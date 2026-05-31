/**
 * PositionLines — chart overlay that:
 *
 *  1. Renders a lightweight-charts priceLine for each entry / SL / TP line.
 *  2. Renders draggable HTML handles for SL and TP (drag up/down to adjust price).
 *  3. Monitors the live tick feed and auto-triggers a close order when the
 *     underlying spot crosses an SL or TP line.
 *
 * The component is mounted inside ChartView and has access to the chart/series
 * refs through ChartContext.  It reads the current chart symbol from
 * chartStore and only shows lines whose `underlying` matches that symbol.
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

// ─── Component ────────────────────────────────────────────────────────────
export function PositionLines() {
  const { chartRef, seriesRef, containerRef, ready } = useChartApi();
  const currentSymbol = useChartStore((s) => s.symbol.symbol);
  const dataVersion   = useChartStore((s) => s.dataVersion); // bumps on series recreate

  const allLines      = usePriceLinesStore((s) => s.lines);
  const updatePrice   = usePriceLinesStore((s) => s.updatePrice);
  const removeLine    = usePriceLinesStore((s) => s.removeLine);
  const removeByPos   = usePriceLinesStore((s) => s.removeByPosition);

  const removePosition = usePositionsStore((s) => s.remove);
  const pushToast     = useToastStore((s) => s.push);

  // Lines for the currently displayed underlying
  const activeLines = allLines.filter((l) => l.underlying === currentSymbol);

  // Refs to the lightweight-charts IPriceLine objects (keyed by line id)
  type PL = ReturnType<NonNullable<typeof seriesRef.current>['createPriceLine']>;
  const plRefs = useRef<Map<string, PL>>(new Map());

  // Pixel-Y of each SL/TP handle (updated every animation frame)
  const handleYsRef = useRef<Record<string, number>>({});
  const [syncKey, setSyncKey] = useState(0); // bumped when Ys change → triggers render

  // Active drag
  const dragRef = useRef<{ id: string } | null>(null);

  // ── 1. Sync lightweight-charts price lines with store ──────────────────
  useEffect(() => {
    if (!ready) return;
    const series = seriesRef.current;
    if (!series) return;

    // Clear all tracked refs (handles series-recreation transparently via try/catch)
    for (const [, pl] of plRefs.current) {
      try { series.removePriceLine(pl); } catch { /* old series, already gone */ }
    }
    plRefs.current.clear();

    // Recreate all active lines on the (possibly new) series
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
      } catch { /* series not ready yet */ }
    }

    // Cleanup when lines change or component unmounts
    return () => {
      const s = seriesRef.current;
      for (const [, pl] of plRefs.current) {
        try { s?.removePriceLine(pl); } catch { /* */ }
      }
      plRefs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLines, ready, dataVersion]);

  // ── 2. RAF: keep SL/TP handle Y positions in sync with price scale ─────
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

        if (y !== null && Math.abs(prev - y) > 0.5) {
          ys[line.id] = y;
          dirty = true;
        } else if (y === null && line.id in ys) {
          delete ys[line.id];
          dirty = true;
        }
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
      const ltp = tick.ltp;
      const prev = prevTickRef.current;
      prevTickRef.current = ltp;
      if (prev === null) return; // skip initialisation tick

      for (const line of activeLinesRef.current) {
        if (line.type === 'entry') continue;

        const isSl = line.type === 'sl';
        const hit = isSl
          ? (line.side === 'buy' ? ltp <= line.price : ltp >= line.price)
          : (line.side === 'buy' ? ltp >= line.price : ltp <= line.price);

        if (!hit) continue;

        const pct = line.entryPrice > 0
          ? ((line.price - line.entryPrice) / line.entryPrice) * 100 : 0;
        pushToast(
          `${isSl ? '🛑 SL HIT' : '🎯 TP HIT'}: ${line.symbol} @ ₹${ltp.toFixed(2)} · ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
        );

        // Close position
        const brokerSource = useBrokerStore.getState().source;
        if (brokerSource === 'upstox' && line.instrumentKey) {
          useBrokerStore.getState().placeOrder({
            instrument_key: line.instrumentKey,
            qty: line.qty,
            transaction_type: line.side === 'buy' ? 'SELL' : 'BUY',
          }).catch(() => {});
        } else {
          removePosition(line.positionId);
        }

        removeByPos(line.positionId);
        break; // one trigger per tick
      }
    });

    return () => { unsub(); prevTickRef.current = null; };
  }, [currentSymbol, removePosition, removeByPos, pushToast]);

  // ── 4. Drag handlers ──────────────────────────────────────────────────
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
      const chartY = e.clientY - rect.top;
      const newPrice = series.coordinateToPrice(chartY);
      if (newPrice != null && newPrice > 0) {
        updatePrice(dragRef.current.id, parseFloat(newPrice.toFixed(2)));
      }
    };
    const onUp = () => { dragRef.current = null; };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [updatePrice, seriesRef, containerRef]);

  // ── 5. Render HTML handles ─────────────────────────────────────────────
  // syncKey is used as a render-trigger so this re-renders when Ys change.
  void syncKey;

  return (
    <div className="pl-overlay">
      {/* Entry line label — left side of chart */}
      {activeLines
        .filter((l) => l.type === 'entry')
        .map((line) => {
          const y = seriesRef.current?.priceToCoordinate(line.price);
          if (y == null) return null;
          return (
            <div
              key={line.id}
              className={`pl-entry-label ${line.side}`}
              style={{ top: Math.round(y) - 12 }}
            >
              <span className="pl-entry-dot">◆</span>
              <span className="pl-entry-side">{line.side.toUpperCase()}</span>
              <span className="pl-entry-price">₹{line.price.toFixed(2)}</span>
              <span className="pl-entry-qty">{line.qty}qty</span>
              <button
                className="pl-x"
                title="Remove entry line"
                onClick={() => removeLine(line.id)}
              >×</button>
            </div>
          );
        })}

      {/* SL / TP drag handles — right side of chart */}
      {activeLines
        .filter((l) => l.type !== 'entry')
        .map((line) => {
          const y = handleYsRef.current[line.id];
          if (y == null) return null;

          const pct = line.entryPrice > 0
            ? ((line.price - line.entryPrice) / line.entryPrice) * 100 : 0;
          const isSl = line.type === 'sl';

          return (
            <div
              key={line.id}
              className={`pl-handle pl-${line.type}`}
              style={{ top: Math.round(y) - 13 }}
              onMouseDown={(e) => onHandleMouseDown(line.id, e)}
            >
              <span className="pl-grip">⣿</span>
              <span className="pl-handle-tag">{isSl ? 'SL' : 'TP'}</span>
              <span className="pl-handle-price">₹{line.price.toFixed(2)}</span>
              <span className={`pl-handle-pct ${pct >= 0 ? 'pl-up' : 'pl-dn'}`}>
                {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
              </span>
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
