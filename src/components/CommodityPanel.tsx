/**
 * CommodityPanel — floating panel for MCX commodity futures trading via Kite.
 *
 * Shows GOLD, GOLDM, SILVER, SILVERM, CRUDEOIL, CRUDEOILM, NATURALGAS with
 * live prices from the Upstox WebSocket feed.  Orders are placed through the
 * active broker (Kite recommended for MCX).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { liveFeed, fetchFutures } from '../data/dataService';
import type { FutureRow } from '../data/dataService';
import { lotSize } from '../data/options';
import { usePriceLinesStore } from '../state/priceLinesStore';
import { useBrokerStore } from '../state/brokerStore';
import { useToastStore } from '../state/toastStore';
import { useChartStore } from '../state/chartStore';
import { useUiStore } from '../state/uiStore';
import type { SymbolInfo } from '../data/types';
import './CommodityPanel.css';

// ─── Constants ────────────────────────────────────────────────────────────

interface CommodityMeta {
  symbol: string;
  label: string;
  unit: string;
  exchange: string;
}

const COMMODITIES: CommodityMeta[] = [
  { symbol: 'GOLD',       label: 'Gold',       unit: '1 kg',       exchange: 'MCX' },
  { symbol: 'GOLDM',      label: 'Gold Mini',  unit: '100 g',      exchange: 'MCX' },
  { symbol: 'SILVER',     label: 'Silver',     unit: '30 kg',      exchange: 'MCX' },
  { symbol: 'SILVERM',    label: 'Silver Mini',unit: '5 kg',       exchange: 'MCX' },
  { symbol: 'CRUDEOIL',   label: 'Crude Oil',  unit: '100 bbl',    exchange: 'MCX' },
  { symbol: 'CRUDEOILM',  label: 'Crude Mini', unit: '10 bbl',     exchange: 'MCX' },
  { symbol: 'NATURALGAS', label: 'Nat Gas',    unit: '1250 MMBTU', exchange: 'MCX' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function loadCp<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}
function saveCp(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* */ }
}

// ─── Component ────────────────────────────────────────────────────────────

export function CommodityPanel() {
  const closeCommodity = useUiStore((s) => s.closeCommodity);
  const setSymbol      = useChartStore((s) => s.setSymbol);
  const currentSym     = useChartStore((s) => s.symbol.symbol);

  // ── Collapse / drag ───────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState(() => loadCp<boolean>('cp2:col', false));
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => { saveCp('cp2:col', !v); return !v; });
  }, []);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(
    () => loadCp<{ x: number; y: number } | null>('cp2:pos', null)
  );
  const posRef   = useRef(pos);
  posRef.current = pos;
  const dragging = useRef(false);
  const origin   = useRef({ mx: 0, my: 0, wx: 0, wy: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  const onHdrMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select')) return;
    const el     = panelRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const wx = er.left - pr.left;
    const wy = er.top  - pr.top;
    dragging.current = true;
    const newPos = { x: wx, y: wy };
    setPos(newPos); posRef.current = newPos;
    origin.current = { mx: e.clientX, my: e.clientY, wx, wy };
    e.preventDefault(); e.stopPropagation();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: origin.current.wx + e.clientX - origin.current.mx,
               y: origin.current.wy + e.clientY - origin.current.my });
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      saveCp('cp2:pos', posRef.current);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
    : {};

  // ── Broker & store ────────────────────────────────────────────────────
  const addLines         = usePriceLinesStore((s) => s.addEntryWithSlTp);
  const addEntry         = usePriceLinesStore((s) => s.addEntry);
  const pushToast        = useToastStore((s) => s.push);
  const brokerPlaceOrder = useBrokerStore((s) => s.placeOrder);
  const activeBroker     = useBrokerStore((s) => s.activeBroker);
  const brokerSource     = useBrokerStore((s) => s.source);
  const isLive           = brokerSource !== 'paper';

  // ── Panel state ───────────────────────────────────────────────────────
  const [selected, setSelected]   = useState(COMMODITIES[0]);
  const [futures, setFutures]     = useState<FutureRow[]>([]);
  const [expIdx, setExpIdx]       = useState(0);
  const [lots, setLots]           = useState(1);
  const [side, setSide]           = useState<'buy' | 'sell'>('buy');
  const [placing, setPlacing]     = useState(false);
  const [loadingExp, setLoadingExp] = useState(false);

  // Live prices keyed by commodity symbol
  const [prices, setPrices]       = useState<Record<string, number>>({});
  const pricesRef                 = useRef(prices);
  pricesRef.current               = prices;

  // ── Subscribe live prices for all commodities ─────────────────────────
  useEffect(() => {
    const unsubs = COMMODITIES.map((c) =>
      liveFeed.subscribe(c.symbol, (tick) => {
        setPrices((prev) => {
          if (prev[c.symbol] === tick.ltp) return prev;
          return { ...prev, [c.symbol]: tick.ltp };
        });
      })
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Fetch futures (expiry dates) when commodity changes ───────────────
  useEffect(() => {
    setFutures([]);
    setExpIdx(0);
    setLoadingExp(true);
    fetchFutures(selected.symbol)
      .then((res) => setFutures(res.futures))
      .catch(() => setFutures([]))
      .finally(() => setLoadingExp(false));
  }, [selected]);

  // ── Current selection ─────────────────────────────────────────────────
  const livePrice  = prices[selected.symbol] ?? 0;
  const activeFut  = futures[expIdx];
  const ls         = lotSize(selected.symbol);
  const qty        = lots * ls;
  const contractVal = livePrice > 0 ? livePrice * qty : 0;

  // ── Place order ───────────────────────────────────────────────────────
  const placeOrder = async (txSide: 'buy' | 'sell') => {
    if (!activeFut) { pushToast('No futures contract available'); return; }
    if (isLive && activeBroker !== 'kite') {
      pushToast('MCX orders require Kite — switch broker in the terminal first');
      return;
    }
    if (livePrice <= 0 && isLive) { pushToast('Waiting for live price — try again'); return; }
    if (lots <= 0) { pushToast('Enter a valid lot count'); return; }

    const price     = livePrice > 0 ? livePrice : activeFut.ltp;
    const expiryMs  = new Date(activeFut.expiry + 'T00:00:00Z').getTime();
    const contract  = `${selected.symbol}FUT`;

    setPlacing(true);
    try {
      let positionId: string;

      if (isLive) {
        const result = await brokerPlaceOrder({
          qty,
          transaction_type: txSide.toUpperCase() as 'BUY' | 'SELL',
          order_type: 'MARKET',
          product: 'D',
          segment: 'future',
          underlying: selected.symbol,
          expiry: activeFut.expiry,
          broker: activeBroker,
        });
        positionId = result.order_id ?? `live_${Date.now()}`;
        pushToast(`${txSide.toUpperCase()} ${lots}L ${selected.label} @ ₹${fmt(price)} · ${activeFut.expiryLabel}`);
      } else {
        positionId = `paper_${Date.now()}`;
        pushToast(`Paper ${txSide.toUpperCase()} ${lots}L ${selected.label} @ ₹${fmt(price)} · ${activeFut.expiryLabel}`);
      }

      (isLive ? addEntry : addLines)({
        positionId,
        symbol:     contract,
        underlying: selected.symbol,
        side:       txSide,
        qty,
        lots,
        price,
        entryPrice: price,
        expiryDate: expiryMs,
      });

      // Switch chart to this commodity to show SL/TP lines
      if (currentSym !== selected.symbol) {
        const info: SymbolInfo = {
          symbol:   selected.symbol,
          name:     selected.label,
          exchange: 'MCX',
          kind:     'commodity',
        };
        setSymbol(info);
      }
    } catch (e) {
      const raw  = e instanceof Error ? e.message : 'Order failed';
      const hint = /margin|fund|insufficient/i.test(raw) ? ' — insufficient margin'
                 : /market.*close|after.*hour/i.test(raw) ? ' — market closed'
                 : /kite.*not.*connect|token|auth/i.test(raw) ? ' — Kite not connected' : '';
      pushToast(`Order failed: ${raw}${hint}`);
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div
      ref={panelRef}
      className={`cp2-panel${collapsed ? ' cp2-collapsed' : ''}`}
      style={posStyle}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── Header (drag handle) ── */}
      <div className="cp2-hdr" onMouseDown={onHdrMouseDown} style={{ cursor: 'move' }}>
        <div className="cp2-hdr-left">
          {collapsed
            ? <span className="cp2-collapsed-title">MCX · {selected.label}</span>
            : <span className="cp2-title">MCX Commodities</span>
          }
        </div>
        <div className="cp2-hdr-right">
          <button className="cp2-toggle" onClick={toggleCollapsed} title={collapsed ? 'Expand' : 'Collapse'}>
            {collapsed ? '▾' : '▴'}
          </button>
          <button className="cp2-close" onClick={closeCommodity} title="Close">✕</button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* ── Commodity chips ── */}
          <div className="cp2-chips">
            {COMMODITIES.map((c) => {
              const p = prices[c.symbol];
              return (
                <button
                  key={c.symbol}
                  className={`cp2-chip${selected.symbol === c.symbol ? ' active' : ''}`}
                  onClick={() => setSelected(c)}
                  title={c.unit}
                >
                  <span className="cp2-chip-label">{c.label}</span>
                  {p != null && p > 0 && (
                    <span className="cp2-chip-price">{fmt(p, 0)}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Main order area ── */}
          <div className="cp2-body">
            {/* Live price row */}
            <div className="cp2-price-row">
              <span className="cp2-sym">{selected.label}</span>
              <span className="cp2-unit">{selected.unit}/lot</span>
              {livePrice > 0
                ? <span className="cp2-ltp">₹{fmt(livePrice)}</span>
                : <span className="cp2-ltp-wait">Waiting…</span>
              }
            </div>

            {/* Expiry selector */}
            <div className="cp2-expiry-row">
              <span className="cp2-exp-label">Expiry</span>
              {loadingExp
                ? <span className="cp2-exp-loading">Loading…</span>
                : futures.length === 0
                  ? <span className="cp2-exp-loading">No contracts</span>
                  : (
                    <div className="cp2-exp-chips">
                      {futures.map((f, i) => (
                        <button
                          key={f.expiry}
                          className={`cp2-exp-btn${expIdx === i ? ' active' : ''}`}
                          onClick={() => setExpIdx(i)}
                          title={f.name}
                        >
                          {f.expiryLabel}
                        </button>
                      ))}
                    </div>
                  )
              }
            </div>

            {/* Lots + value */}
            <div className="cp2-lots-row">
              <span className="cp2-lots-label">Lots</span>
              <div className="cp2-lots-ctrl">
                <button className="cp2-lots-btn" onClick={() => setLots((v) => Math.max(1, v - 1))}>−</button>
                <input
                  className="cp2-lots-inp"
                  type="text"
                  inputMode="numeric"
                  value={lots}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v) && v > 0) setLots(v);
                  }}
                />
                <button className="cp2-lots-btn" onClick={() => setLots((v) => v + 1)}>+</button>
              </div>
              <div className="cp2-val-col">
                <span className="cp2-qty-info">Qty: {qty} {ls > 1 ? `(${lots}L × ${ls})` : 'unit'}</span>
                {contractVal > 0 && <span className="cp2-val-info">≈ ₹{fmt(contractVal, 0)}</span>}
              </div>
            </div>

            {/* Buy / Sell buttons */}
            <div className="cp2-order-row">
              <button
                className="cp2-buy-btn"
                onClick={() => { setSide('buy'); placeOrder('buy'); }}
                disabled={placing || !activeFut}
              >
                {placing && side === 'buy' ? 'Placing…' : `BUY ${selected.symbol}`}
              </button>
              <button
                className="cp2-sell-btn"
                onClick={() => { setSide('sell'); placeOrder('sell'); }}
                disabled={placing || !activeFut}
              >
                {placing && side === 'sell' ? 'Placing…' : `SELL ${selected.symbol}`}
              </button>
            </div>

            {/* Broker status */}
            <div className="cp2-status-row">
              {isLive
                ? <span className="cp2-status-live">● {activeBroker === 'kite' ? 'Kite' : 'Upstox'} live</span>
                : <span className="cp2-status-paper">● Paper trading</span>
              }
              {activeBroker !== 'kite' && isLive && (
                <span className="cp2-status-hint">Switch to Kite for MCX orders</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
