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
import { cancelBrokerOrder, placeBrokerOrder } from '../data/brokerService';
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
  if (l.type === 'exit')  return '#f57c00';  // orange for limit-exit lines
  return l.type === 'sl' ? '#ef5350' : '#26a69a';
}

function chartLineTitle(l: PositionLine): string {
  if (l.type === 'entry') return `${l.side.toUpperCase()} ${l.qty}qty @ ₹${l.price.toFixed(2)}`;
  if (l.type === 'exit')  return `EXIT LIMIT ₹${l.price.toFixed(2)}`;
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

  const allLines        = usePriceLinesStore((s) => s.lines);
  const updatePrice     = usePriceLinesStore((s) => s.updatePrice);
  const updateExitQty   = usePriceLinesStore((s) => s.updateExitQty);
  const updateExitOrder = usePriceLinesStore((s) => s.updateExitOrder);
  const removeLine      = usePriceLinesStore((s) => s.removeLine);
  const removeByPos     = usePriceLinesStore((s) => s.removeByPosition);

  const removePosition = usePositionsStore((s) => s.remove);
  const pushToast      = useToastStore((s) => s.push);

  const brokerSource  = useBrokerStore((s) => s.source);
  const activeBroker  = useBrokerStore((s) => s.activeBroker);
  const cancelOrder   = useBrokerStore((s) => s.cancelOrder);
  const placeOrder    = useBrokerStore((s) => s.placeOrder);
  const brokerOrders  = useBrokerStore((s) => s.orders);

  // Lines whose underlying matches the chart symbol
  const activeLines = allLines.filter((l) => l.underlying === currentSymbol);

  type PL = ReturnType<NonNullable<typeof seriesRef.current>['createPriceLine']>;
  const plRefs = useRef<Map<string, PL>>(new Map());

  const handleYsRef = useRef<Record<string, number>>({});
  const [syncKey, setSyncKey] = useState(0);
  const dragRef = useRef<{ id: string; startPrice: number } | null>(null);

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
  // Positions whose SL/TP has already fired. Synchronous guard so a burst of
  // ticks (Kite streams fast and the LTP jitters around the level) cannot fire
  // the exit more than once before removeByPos lands on the next render.
  const triggeredRef        = useRef<Set<string>>(new Set());
  // Tracks exitOrderIds we've already auto-cleaned to avoid double processing
  const processedOrdersRef  = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!currentSymbol) return;
    const unsub = liveFeed.subscribe(currentSymbol, (tick) => {
      const ltp = tick.ltp;

      for (const line of activeLinesRef.current) {
        if (line.type === 'entry') continue;
        if (line.type === 'exit') continue;  // LIMIT exit already placed on broker — broker handles it

        // Resolve trigger direction: explicit flag or fall back to side-based logic.
        const triggerAbove = line.triggerAbove
          ?? (line.type === 'sl' ? line.side !== 'buy' : line.side === 'buy');

        // Fire when price has REACHED or PASSED the level (not only on a live
        // crossing) so gaps, reloads and already-breached levels still trigger.
        const hit = triggerAbove ? ltp >= line.price : ltp <= line.price;

        if (!hit) continue;
        if (triggeredRef.current.has(line.positionId)) continue;  // already exited

        const isSl   = line.type === 'sl';
        const pnlEst = estimatePnl(line);
        const pnlStr = pnlEst != null ? ` · ${fmtPnl(pnlEst)}` : '';

        triggeredRef.current.add(line.positionId);

        pushToast(
          `${isSl ? '🛑 SL HIT' : '🎯 TP HIT'}: ${line.symbol} @ ₹${ltp.toFixed(2)}${pnlStr}`
        );

        const isLiveBroker = useBrokerStore.getState().source !== 'paper';

        if (isLiveBroker) {
          const rp = line.exitOrderReParams;
          if (rp && rp.segment === 'option') {
            // Options: SL/TP is on the index axis — can't pre-place a LIMIT on the broker.
            // Fire a MARKET order now that the index has actually crossed the level.
            useBrokerStore.getState().placeOrder({
              broker: rp.broker,
              transaction_type: rp.transaction_type,
              order_type: 'MARKET',
              qty: rp.qty,
              product: rp.product,
              segment: 'option',
              underlying: rp.underlying,
              expiry: rp.expiry,
              strike: rp.strike,
              option_type: rp.option_type,
            }).catch(() => {});
          }
          // For equity/futures with LIMIT orders: broker handles fill automatically;
          // auto-cleanup in effect 3b removes lines once the order is confirmed filled.
        } else {
          // Paper mode: remove position immediately when SL/TP level is hit
          removePosition(line.positionId);
        }

        removeByPos(line.positionId);
        break;
      }
    });
    return () => { unsub(); };
  }, [currentSymbol, removePosition, removeByPos, pushToast]);

  // ── 3b. Auto-cleanup: remove position lines when LIMIT exit orders fill ──
  // The broker polls every 5 s; when an exit LIMIT order becomes "complete" or
  // "cancelled/rejected" we clean up immediately so SL/TP cannot fire on a
  // position that is already flat and open an unwanted opposite trade.
  useEffect(() => {
    if (!brokerOrders.length) return;
    const ordersById = new Map(brokerOrders.map(o => [o.order_id, o]));

    for (const line of allLines) {
      // Watch exit, sl, and tp lines that have a broker LIMIT order attached
      if ((line.type !== 'exit' && line.type !== 'sl' && line.type !== 'tp') || !line.exitOrderId) continue;
      if (processedOrdersRef.current.has(line.exitOrderId)) continue;

      const order = ordersById.get(line.exitOrderId);
      if (!order) continue;

      const lineLabel = line.type === 'sl' ? 'SL' : line.type === 'tp' ? 'TP' : 'LIMIT exit';

      if (order.status === 'complete') {
        processedOrdersRef.current.add(line.exitOrderId);
        triggeredRef.current.add(line.positionId);  // guard: prevent duplicate processing
        removeByPos(line.positionId);
        pushToast(`${lineLabel} filled: ${line.symbol} @ ₹${order.average_price?.toFixed(2) ?? order.price?.toFixed(2)}`);
      } else if (order.status === 'cancelled' || order.status === 'rejected') {
        processedOrdersRef.current.add(line.exitOrderId);
        removeLine(line.id);  // remove just this line; other SL/TP/exit lines stay active
        pushToast(`${lineLabel} ${order.status}: ${line.symbol} — set a new one to re-protect`);
      }
    }
  }, [brokerOrders, allLines, removeByPos, removeLine, pushToast]);

  // ── 4. Drag handlers ─────────────────────────────────────────────────
  const onHandleMouseDown = useCallback((id: string, startPrice: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { id, startPrice };
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
    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;

      // For exit / sl / tp lines with a broker LIMIT order: cancel old + re-place at new price
      const line = usePriceLinesStore.getState().lines.find(l => l.id === drag.id);
      if (!line || (line.type !== 'exit' && line.type !== 'sl' && line.type !== 'tp') || !line.exitOrderReParams) return;
      if (Math.abs(line.price - drag.startPrice) < 0.01) return;  // no meaningful move

      const { id: lineId, exitOrderId, exitOrderReParams, price, symbol } = line;
      const pushT = useToastStore.getState().push;
      const upd   = usePriceLinesStore.getState().updateExitOrder;

      const doPlace = () => {
        const isSl = line.type === 'sl';
        const orderType = isSl ? 'SL' : 'LIMIT';
        placeBrokerOrder({
          broker: exitOrderReParams.broker,
          order_type: orderType,
          price,
          trigger_price: isSl ? price : undefined,
          qty: exitOrderReParams.qty,
          transaction_type: exitOrderReParams.transaction_type,
          product: exitOrderReParams.product,
          segment: exitOrderReParams.segment,
          underlying: exitOrderReParams.underlying,
          expiry: exitOrderReParams.expiry,
          strike: exitOrderReParams.strike,
          option_type: exitOrderReParams.option_type,
          tradingsymbol: exitOrderReParams.tradingsymbol,
          exchange: exitOrderReParams.exchange,
          instrument_key: exitOrderReParams.instrument_key,
        })
          .then((result) => {
            if (result.order_id) upd(lineId, result.order_id);
            pushT(`${orderType} order moved: ${symbol} @ ₹${price.toFixed(2)}`);
            // Refresh broker data
            useBrokerStore.getState().refresh();
          })
          .catch((err: unknown) => {
            pushT(`Failed to re-place ${orderType} order: ${err instanceof Error ? err.message : String(err)}`);
          });
      };

      if (exitOrderId) {
        cancelBrokerOrder(exitOrderId, exitOrderReParams.broker)
          .then(doPlace)
          .catch(doPlace);  // if cancel fails (already filled?), still try new order
      } else {
        doPlace();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [updatePrice, seriesRef, containerRef]);

  // ── 5. Entry × — cancel pending order or exit filled position in broker ─
  const handleEntryClose = useCallback(async (line: PositionLine) => {
    if (brokerSource !== 'paper') {
      const cancelled = await cancelOrder(line.positionId);
      if (cancelled) {
        pushToast(`Order cancelled: ${line.symbol}`);
      } else {
        // Order already filled — place a closing/exit order
        try {
          const expiryStr = line.expiryDate
            ? new Date(line.expiryDate).toISOString().split('T')[0]
            : undefined;
          const txType = (line.side === 'buy' ? 'SELL' : 'BUY') as 'BUY' | 'SELL';
          if (activeBroker === 'kite') {
            if (line.underlying && expiryStr && line.strike && line.optType) {
              await placeOrder({
                qty: line.qty,
                transaction_type: txType,
                order_type: 'MARKET',
                segment: 'option',
                underlying: line.underlying,
                expiry: expiryStr,
                strike: line.strike,
                option_type: line.optType,
              });
            } else if (line.underlying && expiryStr && !line.optType) {
              await placeOrder({
                qty: line.qty,
                transaction_type: txType,
                order_type: 'MARKET',
                segment: 'future',
                underlying: line.underlying,
                expiry: expiryStr,
              });
            } else if (line.underlying) {
              // Equity: use symbol directly, no instrument dump needed
              await placeOrder({
                qty: line.qty,
                transaction_type: txType,
                order_type: 'MARKET',
                segment: 'equity',
                underlying: line.underlying,
              });
            } else {
              pushToast(`Could not exit ${line.symbol} — cancel from Orders tab`);
              removeByPos(line.positionId);
              return;
            }
          } else if (line.instrumentKey) {
            await placeOrder({
              instrument_key: line.instrumentKey,
              qty: line.qty,
              transaction_type: txType,
            });
          } else {
            pushToast(`Could not exit ${line.symbol} — cancel from Orders tab`);
            removeByPos(line.positionId);
            return;
          }
          pushToast(`Position closed: ${line.symbol}`);
        } catch {
          pushToast(`Could not close ${line.symbol} — try via Orders tab`);
        }
      }
    } else {
      removePosition(line.positionId);
    }
    removeByPos(line.positionId);
  }, [brokerSource, activeBroker, cancelOrder, placeOrder, removePosition, removeByPos, pushToast]);

  // ── 6. Render HTML handles ────────────────────────────────────────────
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
            <button className="pl-x" title="Cancel / close position in broker" onClick={() => handleEntryClose(line)}>×</button>
          </div>
        );
      })}

      {/* Limit-exit lines — draggable; on drag-end cancels old order + places new */}
      {activeLines.filter((l) => l.type === 'exit').map((line) => {
        const y = handleYsRef.current[line.id];
        if (y == null) return null;
        const draggable = !!line.exitOrderReParams;
        return (
          <div
            key={line.id}
            className={`pl-handle pl-exit-limit${draggable ? '' : ' pl-exit-nodrag'}`}
            style={{ top: Math.round(y) - 14 }}
            onMouseDown={draggable ? (e) => onHandleMouseDown(line.id, line.price, e) : undefined}
          >
            {draggable && <span className="pl-grip">⠿</span>}
            <span className="pl-exit-limit-tag">LIMIT EXIT</span>
            <span className="pl-handle-price">₹{line.price.toFixed(2)}</span>
            <button
              className="pl-x"
              title="Remove exit line from chart (does NOT cancel the broker order — cancel via Orders tab)"
              onClick={(e) => { e.stopPropagation(); removeLine(line.id); }}
            >×</button>
          </div>
        );
      })}

      {/* SL / TP drag handles with P&L and exit-qty editor */}
      {activeLines.filter((l) => l.type !== 'entry' && l.type !== 'exit').map((line) => {
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
            onMouseDown={(e) => onHandleMouseDown(line.id, line.price, e)}
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
