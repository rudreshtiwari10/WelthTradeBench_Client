/**
 * PositionLines — chart overlay that:
 *  1. Renders lightweight-charts price lines for entry / SL / TP.
 *  2. Renders draggable HTML handles for SL and TP.
 *  3. Monitors live ticks and auto-triggers a close when the underlying
 *     spot crosses an SL or TP line (respecting `triggerAbove` direction).
 *  4. Shows estimated option P&L at each SL/TP level (Black-Scholes).
 *  5. Provides an inline lot-size editor for the exit qty.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LineStyle } from 'lightweight-charts';
import { useChartApi } from '../chart/ChartContext';
import { usePriceLinesStore } from '../state/priceLinesStore';
import type { PositionLine } from '../state/priceLinesStore';
import { usePositionsStore } from '../state/positionsStore';
import { useBrokerStore } from '../state/brokerStore';
import { useToastStore } from '../state/toastStore';
import { useChartStore } from '../state/chartStore';
import { liveFeed } from '../data/dataService';
import { optionPremium, lotSize } from '../data/options';
import './PositionLines.css';

// ─── Styling helpers ──────────────────────────────────────────────────────
function lineColor(l: PositionLine): string {
  if (l.type === 'entry') return l.side === 'buy' ? '#26a69a' : '#ef5350';
  return l.type === 'sl' ? '#ef5350' : '#26a69a';
}

function chartLineTitle(l: PositionLine): string {
  if (l.type === 'entry') return `${l.side.toUpperCase()} ${l.qty}qty @ ₹${l.price.toFixed(2)}`;
  const pct = l.entryPrice > 0 ? ((l.price - l.entryPrice) / l.entryPrice) * 100 : 0;
  return `${l.type.toUpperCase()} ₹${l.price.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`;
}

/** Estimate option P&L if the underlying reaches `linePrice`. */
function estimatePnl(line: PositionLine): number | null {
  if (!line.optionEntryPremium || !line.strike || !line.optType) return null;
  const daysLeft = line.expiryDate
    ? Math.max(0.1, (line.expiryDate - Date.now()) / 86_400_000)
    : 7;
  const premAtLevel = optionPremium(line.price, line.strike, line.optType, daysLeft);
  const exitLots = line.exitQty ?? line.lots ?? 1;
  const ls = lotSize(line.underlying);
  return (premAtLevel - line.optionEntryPremium) * exitLots * ls * (line.side === 'buy' ? 1 : -1);
}

function fmtPnl(n: number | null): string | null {
  if (n == null) return null;
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return `${n >= 0 ? '+' : '−'}₹${abs}`;
}

// ─── Component ────────────────────────────────────────────────────────────
export function PositionLines() {
  const { chartRef, seriesRef, containerRef, ready } = useChartApi();
  const currentSymbol = useChartStore((s) => s.symbol.symbol);
  const dataVersion   = useChartStore((s) => s.dataVersion);

  const allLines     = usePriceLinesStore((s) => s.lines);
  const updatePrice  = usePriceLinesStore((s) => s.updatePrice);
  const updateExitQty = usePriceLinesStore((s) => s.updateExitQty);
  const removeLine   = usePriceLinesStore((s) => s.removeLine);
  const removeByPos  = usePriceLinesStore((s) => s.removeByPosition);

  const removePosition = usePositionsStore((s) => s.remove);
  const pushToast      = useToastStore((s) => s.push);

  // Lines whose underlying matches the chart symbol
  const activeLines = allLines.filter((l) => l.underlying === currentSymbol);

  type PL = ReturnType<NonNullable<typeof seriesRef.current>['createPriceLine']>;
  const plRefs = useRef<Map<string, PL>>(new Map());

  const handleYsRef = useRef<Record<string, number>>({});
  const [syncKey, setSyncKey] = useState(0);
  const dragRef = useRef<{ id: string } | null>(null);

  // ── 1. Sync lightweight-charts price lines ────────────────────────────
  useEffect(() => {
    if (!ready) return;
    const series = seriesRef.current;
    if (!series) return;

    for (const [, pl] of plRefs.current) {
      try { series.removePriceLine(pl); } catch { /* old series */ }
    }
    plRefs.current.clear();

    for (const line of activeLines) {
      try {
        const pl = series.createPriceLine({
          price: line.price,
          color: lineColor(line),
          lineWidth: line.type === 'entry' ? 2 : 1,
          lineStyle: line.type === 'entry' ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: true,
          title: chartLineTitle(line),
        });
        plRefs.current.set(line.id, pl);
      } catch { /* series not ready */ }
    }

    return () => {
      const s = seriesRef.current;
      for (const [, pl] of plRefs.current) {
        try { s?.removePriceLine(pl); } catch { /* */ }
      }
      plRefs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLines, ready, dataVersion]);

  // ── 2. RAF: keep handle Y positions in sync ───────────────────────────
  useEffect(() => {
    if (!ready) return;
    let rafId: number;
    const syncYs = () => {
      const series = seriesRef.current;
      if (!series) { rafId = requestAnimationFrame(syncYs); return; }
      let dirty = false;
      const ys = handleYsRef.current;
      for (const line of activeLines) {
        if (line.type === 'entry') continue;
        const y = series.priceToCoordinate(line.price);
        const prev = ys[line.id] ?? -9999;
        if (y !== null && Math.abs(prev - y) > 0.5) { ys[line.id] = y; dirty = true; }
        else if (y === null && line.id in ys) { delete ys[line.id]; dirty = true; }
      }
      if (dirty) setSyncKey((k) => k + 1);
      rafId = requestAnimationFrame(syncYs);
    };
    rafId = requestAnimationFrame(syncYs);
    return () => cancelAnimationFrame(rafId);
  }, [activeLines, ready]);

  // ── 3. SL / TP trigger — monitor live ticks ───────────────────────────
  const activeLinesRef = useRef(activeLines);
  activeLinesRef.current = activeLines;
  const prevTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentSymbol) return;
    const unsub = liveFeed.subscribe(currentSymbol, (tick) => {
      const ltp  = tick.ltp;
      const prev = prevTickRef.current;
      prevTickRef.current = ltp;
      if (prev === null) return;

      for (const line of activeLinesRef.current) {
        if (line.type === 'entry') continue;

        // Resolve trigger direction: explicit flag or fall back to side-based logic.
        const triggerAbove = line.triggerAbove
          ?? (line.type === 'sl' ? line.side !== 'buy' : line.side === 'buy');

        const hit = triggerAbove
          ? (prev < line.price && ltp >= line.price)   // crossed UP through the line
          : (prev > line.price && ltp <= line.price);  // crossed DOWN through the line

        if (!hit) continue;

        const isSl   = line.type === 'sl';
        const pnlEst = estimatePnl(line);
        const pnlStr = pnlEst != null ? ` · ${fmtPnl(pnlEst)}` : '';
        const maxLots = line.lots ?? 1;
        const exitLots = line.exitQty ?? maxLots;
        
        if (exitLots <= 0 || exitLots > maxLots) {
          pushToast(`Trigger ignored for ${line.symbol}: invalid exit qty (${exitLots}L)`);
          continue;
        }

        pushToast(
          `${isSl ? '🛑 SL HIT' : '🎯 TP HIT'}: ${line.symbol} @ ₹${ltp.toFixed(2)}${pnlStr}`
        );

        // Exit order qty
        const lotSz = line.lots && line.lots > 0 ? line.qty / line.lots : 1;
        const exitQtyUnits = Math.round(exitLots * lotSz);

        const brokerSource = useBrokerStore.getState().source;
        if (brokerSource === 'upstox' && line.instrumentKey) {
          useBrokerStore.getState().placeOrder({
            instrument_key: line.instrumentKey,
            qty: exitQtyUnits,
            transaction_type: line.side === 'buy' ? 'SELL' : 'BUY',
          }).catch(() => {});
        } else {
          removePosition(line.positionId);
        }

        removeByPos(line.positionId);
        break;
      }
    });
    return () => { unsub(); prevTickRef.current = null; };
  }, [currentSymbol, removePosition, removeByPos, pushToast]);

  // ── 4. Drag handlers ─────────────────────────────────────────────────
  const onHandleMouseDown = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { id };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const series = seriesRef.current;
      const container = containerRef.current;
      if (!series || !container) return;
      const rect = container.getBoundingClientRect();
      const newPrice = series.coordinateToPrice(e.clientY - rect.top);
      if (newPrice != null && newPrice > 0)
        updatePrice(dragRef.current.id, parseFloat(newPrice.toFixed(2)));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [updatePrice, seriesRef, containerRef]);

  // ── 5. Render HTML handles ────────────────────────────────────────────
  void syncKey;

  return (
    <div className="pl-overlay">
      {/* Entry line labels */}
      {activeLines.filter((l) => l.type === 'entry').map((line) => {
        const y = seriesRef.current?.priceToCoordinate(line.price);
        if (y == null) return null;
        return (
          <div key={line.id} className={`pl-entry-label ${line.side}`} style={{ top: Math.round(y) - 12 }}>
            <span className="pl-entry-dot">◆</span>
            <span className="pl-entry-side">{line.side.toUpperCase()}</span>
            <span className="pl-entry-price">₹{line.price.toFixed(2)}</span>
            <span className="pl-entry-qty">{line.lots ? `${line.lots}L` : `${line.qty}qty`}</span>
            <button className="pl-x" title="Remove entry line" onClick={() => removeLine(line.id)}>×</button>
          </div>
        );
      })}

      {/* SL / TP drag handles with P&L and exit-qty editor */}
      {activeLines.filter((l) => l.type !== 'entry').map((line) => {
        const y = handleYsRef.current[line.id];
        if (y == null) return null;

        const isSl     = line.type === 'sl';
        const pct      = line.entryPrice > 0 ? ((line.price - line.entryPrice) / line.entryPrice) * 100 : 0;
        const pnlEst   = estimatePnl(line);
        const maxLots  = line.lots ?? 1;              // position lot count — upper bound
        const exitLots = line.exitQty ?? maxLots;

        // Validation: qty must be 1..maxLots
        const qtyErr =
          exitLots <= 0         ? 'Must be ≥ 1'
          : exitLots > maxLots  ? `Max ${maxLots}L`
          : null;

        return (
          <div
            key={line.id}
            className={`pl-handle pl-${line.type}${qtyErr ? ' pl-handle-err' : ''}`}
            style={{ top: Math.round(y) - 14 }}
            onMouseDown={(e) => onHandleMouseDown(line.id, e)}
          >
            {/* Price badge */}
            <span className="pl-handle-price">₹{line.price.toFixed(2)}</span>

            {/* % distance from entry */}
            <span className={`pl-handle-pct ${pct >= 0 ? 'pl-up' : 'pl-dn'}`}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
            </span>

            {/* Est P&L based on distance & option greeks (if active) */}
            {pnlEst != null && !qtyErr && (
              <span className={`pl-handle-pnl ${pnlEst >= 0 ? 'pl-pnl-up' : 'pl-pnl-dn'}`}>
                {fmtPnl(pnlEst)}
              </span>
            )}

            {/* Exit qty editor */}
            <span className="pl-exit-sep">|</span>
            <input
              className={`pl-exit-qty${qtyErr ? ' pl-qty-err' : ''}`}
              type="number"
              min={1}
              max={maxLots}
              value={exitLots}
              title={qtyErr ?? `Exit lots (1–${maxLots})`}
              onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => {
                // Accept the raw string while typing (allow empty/in-progress)
                const raw = e.target.value;
                const v   = parseInt(raw, 10);
                if (!isNaN(v)) updateExitQty(line.id, v);   // store clamps to ≥ 1 already
              }}
            />
            <span className="pl-exit-label">L</span>
            {/* Inline error badge */}
            {qtyErr && (
              <span className="pl-qty-err-badge" title={qtyErr}>⚠ {qtyErr}</span>
            )}
            <button
              className="pl-x"
              title={`Remove ${line.type.toUpperCase()} line`}
              onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
}
