/**
 * ChartWidgets — three floating, draggable, collapsable chart overlays.
 *
 * When authenticated with Upstox (source = "upstox"):
 *   • Account   → real fund-margin from Upstox API
 *   • Live P&L  → real unrealised_profit sum from positions
 *   • Positions → real short-term positions with cancel-order button
 *
 * When in paper/mock mode (source = "paper"):
 *   • Account   → mock ₹5L balance minus paper margin used
 *   • Live P&L  → estimated via Black-Scholes + live spot tick
 *   • Positions → paper trades from localStorage positionsStore
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePositionsStore } from '../state/positionsStore';
import type { Position } from '../state/positionsStore';
import { useBrokerStore } from '../state/brokerStore';
import { usePriceLinesStore } from '../state/priceLinesStore';
import type { BrokerPosition } from '../data/brokerService';
import { liveFeed } from '../data/dataService';
import { optionPremium } from '../data/options';
import './ChartWidgets.css';

// ─── Persistence helpers ──────────────────────────────────────────────────
function load<T>(key: string, def: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? def; } catch { return def; }
}
function save(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* */ }
}

// ─── Draggable hook ───────────────────────────────────────────────────────
interface DragPos { x: number; y: number }

function useDraggable(storageKey: string) {
  const [pos, setPos] = useState<DragPos | null>(() => load<DragPos | null>(storageKey, null));
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragging = useRef(false);
  const origin = useRef({ mx: 0, my: 0, wx: 0, wy: 0 });
  const elRef = useRef<HTMLDivElement>(null);

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select,a')) return;
    const el = elRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const er = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    const wx = er.left - pr.left;
    const wy = er.top - pr.top;
    dragging.current = true;
    const newPos = { x: wx, y: wy };
    setPos(newPos);
    posRef.current = newPos;
    origin.current = { mx: e.clientX, my: e.clientY, wx, wy };
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: origin.current.wx + e.clientX - origin.current.mx,
        y: origin.current.wy + e.clientY - origin.current.my,
      });
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      save(storageKey, posRef.current);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [storageKey]);

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: 'auto' as unknown as number }
    : {};

  return { posStyle, onHeaderMouseDown, elRef };
}

// ─── Collapse toggle ──────────────────────────────────────────────────────
function useCollapsed(storageKey: string, def = false) {
  const [collapsed, setCollapsed] = useState(() => load<boolean>(storageKey, def));
  const toggle = useCallback(() => {
    setCollapsed((v) => { save(storageKey, !v); return !v; });
  }, [storageKey]);
  return { collapsed, toggle };
}

// ─── Tiny "Live / Sandbox / Paper" badge ─────────────────────────────────
function ModeBadge({ source, sandbox }: { source: string; sandbox: boolean }) {
  if (source !== 'upstox') return <span className="cw-mode-badge paper">PAPER</span>;
  return <span className={`cw-mode-badge ${sandbox ? 'sandbox' : 'live'}`}>{sandbox ? 'SANDBOX' : 'LIVE'}</span>;
}

// ─────────────────────────────────────────────────────────────────────────
// ACCOUNT FUNDS WIDGET
// ─────────────────────────────────────────────────────────────────────────
const DEMO_BALANCE = 500_000;

function AccountWidget({ source, sandbox }: { source: string; sandbox: boolean }) {
  const { posStyle, onHeaderMouseDown, elRef } = useDraggable('cw:account:pos');
  const { collapsed, toggle } = useCollapsed('cw:account:col');
  const funds = useBrokerStore((s) => s.funds);
  const paperPositions = usePositionsStore((s) => s.positions);

  // ── figures ──────────────────────────────────────────────────────────
  let available = 0, used = 0, total = 0;

  if (source === 'upstox' && funds?.equity) {
    available = funds.equity.available_margin ?? 0;
    used = funds.equity.used_margin ?? 0;
    total = funds.equity.payin ?? (available + used);
  } else {
    const paperUsed = paperPositions.reduce((s, p) => s + p.price * p.qty, 0);
    total = DEMO_BALANCE;
    used = paperUsed;
    available = total - used;
  }

  const avUp = available >= 0;

  return (
    <div
      ref={elRef}
      className={`cw cw-account${collapsed ? ' cw-collapsed' : ''}`}
      style={posStyle}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cw-hdr" onMouseDown={onHeaderMouseDown}>
        <span className="cw-icon">₹</span>
        <span className="cw-title">Account Funds</span>
        <ModeBadge source={source} sandbox={sandbox} />
        <button className="cw-toggle" onClick={toggle}>{collapsed ? '▾' : '▴'}</button>
      </div>
      {!collapsed && (
        <div className="cw-body">
          <div className="cw-row">
            <span>{source === 'upstox' ? 'Total balance' : 'Demo balance'}</span>
            <span className="cw-v">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="cw-row">
            <span>Margin used</span>
            <span className="cw-v cw-down">
              {used > 0 ? `-₹${used.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0'}
            </span>
          </div>
          {source === 'upstox' && funds?.equity?.span != null && (
            <div className="cw-row">
              <span>SPAN margin</span>
              <span className="cw-v">₹{(funds.equity.span ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
            </div>
          )}
          <div className="cw-sep" />
          <div className="cw-row cw-hl">
            <span>Available</span>
            <span className={`cw-v ${avUp ? 'cw-up' : 'cw-down'}`}>
              {!avUp ? '-' : ''}₹{Math.abs(available).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </span>
          </div>
          {source === 'upstox' && funds?.equity?.pnl != null && (
            <div className="cw-row">
              <span>Day P&L</span>
              <span className={`cw-v ${(funds.equity.pnl ?? 0) >= 0 ? 'cw-up' : 'cw-down'}`}>
                {(funds.equity.pnl ?? 0) >= 0 ? '+' : ''}₹{(funds.equity.pnl ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {source !== 'upstox' && (
            <div className="cw-row">
              <span>Paper positions</span>
              <span className="cw-v">{paperPositions.length}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LIVE P&L WIDGET
// ─────────────────────────────────────────────────────────────────────────

// Paper-mode: estimate P&L per paper position using live spot + Black-Scholes
function usePaperPnl(positions: Position[]) {
  const [spots, setSpots] = useState<Record<string, number>>({});
  const underlyings = [...new Set(positions.map((p) => p.underlying ?? p.symbol.split(' ')[0]))];
  const uKey = underlyings.slice().sort().join(',');

  useEffect(() => {
    if (!underlyings.length) return;
    const unsubs = underlyings.map((sym) =>
      liveFeed.subscribe(sym, (t) => setSpots((prev) => ({ ...prev, [sym]: t.ltp })))
    );
    return () => unsubs.forEach((u) => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uKey]);

  let total = 0; let wins = 0; let losses = 0;
  for (const p of positions) {
    const spot = spots[p.underlying ?? p.symbol.split(' ')[0]] ?? 0;
    if (!spot || !p.strike || !p.optType || p.expiryDate == null) continue;
    const days = Math.max(0, (p.expiryDate - Date.now()) / 86_400_000);
    const cur = optionPremium(spot, p.strike, p.optType, days);
    const pnl = (cur - p.price) * p.qty * (p.side === 'buy' ? 1 : -1);
    total += pnl;
    if (pnl >= 0) wins++; else losses++;
  }
  return { total, wins, losses };
}

function PnlWidget({ source, sandbox }: { source: string; sandbox: boolean }) {
  const { posStyle, onHeaderMouseDown, elRef } = useDraggable('cw:pnl:pos');
  const { collapsed, toggle } = useCollapsed('cw:pnl:col');
  const brokerPositions = useBrokerStore((s) => s.positions);
  const paperPositions = usePositionsStore((s) => s.positions);
  const lastUpdated = useBrokerStore((s) => s.lastUpdated);
  const { total: paperTotal, wins: paperWins, losses: paperLosses } = usePaperPnl(paperPositions);

  // Live: sum unrealised_profit from Upstox positions
  let totalPnl = 0; let wins = 0; let losses = 0;
  if (source === 'upstox') {
    for (const p of brokerPositions) {
      const pnl = p.unrealised_profit ?? 0;
      totalPnl += pnl;
      if (pnl >= 0) wins++; else losses++;
    }
  } else {
    totalPnl = paperTotal; wins = paperWins; losses = paperLosses;
  }

  const posCount = source === 'upstox' ? brokerPositions.length : paperPositions.length;
  const pnlUp = totalPnl >= 0;

  // "Updated Xs ago" label
  const [, forceRender] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceRender((n) => n + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const agoSec = lastUpdated ? Math.floor((Date.now() - lastUpdated) / 1000) : null;
  const agoLabel = agoSec == null ? null : agoSec < 60 ? `${agoSec}s ago` : `${Math.floor(agoSec / 60)}m ago`;

  return (
    <div
      ref={elRef}
      className={`cw cw-pnl${collapsed ? ' cw-collapsed' : ''}`}
      style={posStyle}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cw-hdr" onMouseDown={onHeaderMouseDown}>
        <span className="cw-icon">⟳</span>
        <span className="cw-title">Live P&amp;L</span>
        {posCount > 0 && (
          <span className={`cw-badge ${pnlUp ? 'cw-up' : 'cw-down'}`}>
            {pnlUp ? '+' : '−'}₹{Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
        )}
        <ModeBadge source={source} sandbox={sandbox} />
        <button className="cw-toggle" onClick={toggle}>{collapsed ? '▾' : '▴'}</button>
      </div>
      {!collapsed && (
        <div className="cw-body">
          {posCount === 0 ? (
            <div className="cw-empty">No open positions</div>
          ) : (
            <>
              <div className="cw-pnl-total">
                <span>Unrealised P&L</span>
                <span className={`cw-pnl-big ${pnlUp ? 'cw-up' : 'cw-down'}`}>
                  {pnlUp ? '+' : '−'}₹{Math.abs(totalPnl).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="cw-row cw-pnl-meta">
                <span className="cw-up">▲ {wins} winning</span>
                <span className="cw-down">▼ {losses} losing</span>
              </div>
              {source === 'upstox' && agoLabel && (
                <div className="cw-row" style={{ marginTop: 2 }}>
                  <span>Updated</span>
                  <span className="cw-v" style={{ fontSize: 10 }}>{agoLabel}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// POSITIONS TERMINAL — LIVE BROKER ROW
// ─────────────────────────────────────────────────────────────────────────

function BrokerPosRow({ p, onCancel }: { p: BrokerPosition; onCancel: ((sym: string) => void) | null }) {
  const qty = p.quantity;
  const side = qty >= 0 ? 'buy' : 'sell';
  const pnl = p.unrealised_profit ?? 0;
  const pnlUp = pnl >= 0;

  return (
    <div className="pos-row">
      <span className="pos-sym" title={p.trading_symbol}>{p.trading_symbol}</span>
      <span className={`pos-side ${side}`}>{side.toUpperCase()}</span>
      <span className="pos-qty">{Math.abs(qty)}</span>
      <span className="pos-price">₹{(p.average_price ?? 0).toFixed(2)}</span>
      <span className="pos-ltp">₹{(p.last_price ?? 0).toFixed(2)}</span>
      <span className={`pos-pnl ${pnlUp ? 'cw-up' : 'cw-down'}`}>
        {pnlUp ? '+' : '−'}₹{Math.abs(pnl).toFixed(0)}
      </span>
      {onCancel ? (
        <button className="pos-x" title="Cancel / close" onClick={() => onCancel(p.trading_symbol)}>✕</button>
      ) : <span />}
    </div>
  );
}

// ─── Paper position row (same as before) ─────────────────────────────────

function PaperPosRow({ p, onRemove }: { p: Position; onRemove: (id: string) => void; }) {
  const underlying = p.underlying ?? p.symbol.split(' ')[0];
  const [spot, setSpot] = useState(0);
  useEffect(() => liveFeed.subscribe(underlying, (t) => setSpot(t.ltp)), [underlying]);

  const hasMeta = !!(p.strike && p.optType && p.expiryDate != null);
  const days = hasMeta ? Math.max(0, (p.expiryDate! - Date.now()) / 86_400_000) : 7;
  const cur = hasMeta && spot > 0 ? optionPremium(spot, p.strike!, p.optType!, days) : p.price;
  const pnl = (cur - p.price) * p.qty * (p.side === 'buy' ? 1 : -1);
  const pnlUp = pnl >= 0;

  const setSl = usePriceLinesStore((s) => s.setSl);
  const setTp = usePriceLinesStore((s) => s.setTp);

  const promptSl = () => {
    const val = window.prompt(`Set SL price for ${p.symbol} (entry ₹${p.price.toFixed(2)}):`, (p.price * (p.side === 'buy' ? 0.80 : 1.20)).toFixed(2));
    const n = Number(val);
    if (val && isFinite(n) && n > 0) setSl(p.id, n);
  };
  const promptTp = () => {
    const val = window.prompt(`Set TP price for ${p.symbol} (entry ₹${p.price.toFixed(2)}):`, (p.price * (p.side === 'buy' ? 1.30 : 0.70)).toFixed(2));
    const n = Number(val);
    if (val && isFinite(n) && n > 0) setTp(p.id, n);
  };

  return (
    <div className="pos-row">
      <span className="pos-sym" title={p.symbol}>{p.symbol}</span>
      <span className={`pos-side ${p.side}`}>{p.side.toUpperCase()}</span>
      <span className="pos-qty">{p.qty}</span>
      <span className="pos-price">₹{p.price.toFixed(2)}</span>
      <span className="pos-ltp">{hasMeta && spot > 0 ? `₹${cur.toFixed(2)}` : '—'}</span>
      <span className={`pos-pnl ${pnlUp ? 'cw-up' : 'cw-down'}`}>
        {hasMeta && spot > 0 ? `${pnlUp ? '+' : '−'}₹${Math.abs(pnl).toFixed(0)}` : '—'}
      </span>
      <div className="pos-actions">
        <button className="pos-sl-btn" title="Set / move SL on chart" onClick={promptSl}>SL</button>
        <button className="pos-tp-btn" title="Set / move TP on chart" onClick={promptTp}>TP</button>
        <button className="pos-x" title="Remove" onClick={() => onRemove(p.id)}>✕</button>
      </div>
    </div>
  );
}

// ─── Orders tab row ───────────────────────────────────────────────────────

function OrderRow({ o, onCancel }: { o: import('../data/brokerService').BrokerOrder; onCancel: (id: string) => void }) {
  const isOpen = ['open', 'trigger pending', 'after market order req received'].includes(o.status?.toLowerCase() ?? '');
  const statusCls = o.status?.toLowerCase() === 'complete' ? 'cw-up' : o.status?.toLowerCase() === 'rejected' ? 'cw-down' : '';

  return (
    <div className="pos-row">
      <span className="pos-sym" title={o.trading_symbol}>{o.trading_symbol}</span>
      <span className={`pos-side ${o.transaction_type?.toLowerCase()}`}>{o.transaction_type}</span>
      <span className="pos-qty">{o.quantity}</span>
      <span className="pos-price">{o.order_type}</span>
      <span className="pos-ltp">₹{(o.average_price || o.price || 0).toFixed(2)}</span>
      <span className={`pos-pnl ${statusCls}`}>{o.status}</span>
      {isOpen
        ? <button className="pos-x" title="Cancel order" onClick={() => onCancel(o.order_id)}>✕</button>
        : <span />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// POSITIONS TERMINAL WIDGET
// ─────────────────────────────────────────────────────────────────────────

function PositionsTerminal({ source, sandbox }: { source: string; sandbox: boolean }) {
  const { posStyle, onHeaderMouseDown, elRef } = useDraggable('cw:pos-term:pos');
  const { collapsed, toggle } = useCollapsed('cw:pos-term:col');
  const [tab, setTab] = useState<'positions' | 'orders'>('positions');

  const brokerPositions = useBrokerStore((s) => s.positions);
  const brokerOrders = useBrokerStore((s) => s.orders);
  const cancelOrder = useBrokerStore((s) => s.cancelOrder);

  const paperPositions = usePositionsStore((s) => s.positions);
  const removePaperPos = usePositionsStore((s) => s.remove);
  const clearPaper = usePositionsStore((s) => s.clear);

  const removeLines = usePriceLinesStore((s) => s.removeByPosition);

  // Remove paper position + clean up its chart lines
  const removePaper = useCallback((id: string) => {
    removePaperPos(id);
    removeLines(id);
  }, [removePaperPos, removeLines]);

  // Clear all paper positions + all lines
  const clearAll = useCallback(() => {
    clearPaper();
    usePriceLinesStore.getState().lines
      .filter((l) => true)
      .forEach((l) => removeLines(l.positionId));
  }, [clearPaper, removeLines]);

  const isLive = source === 'upstox';
  // Always count both broker + paper so the badge reflects reality.
  const posCount = (isLive ? brokerPositions.length : 0) + paperPositions.length;
  const ordCount = isLive ? brokerOrders.length : 0;

  return (
    <div
      ref={elRef}
      className={`cw cw-positions${collapsed ? ' cw-collapsed' : ''}`}
      style={posStyle}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="cw-hdr" onMouseDown={onHeaderMouseDown}>
        <span className="cw-icon">☰</span>
        <span className="cw-title">
          <button
            className={`cw-tab-btn${tab === 'positions' ? ' active' : ''}`}
            onClick={() => setTab('positions')}
          >
            Positions {posCount > 0 && <span className="cw-count">{posCount}</span>}
          </button>
          {isLive && (
            <button
              className={`cw-tab-btn${tab === 'orders' ? ' active' : ''}`}
              onClick={() => setTab('orders')}
            >
              Orders {ordCount > 0 && <span className="cw-count">{ordCount}</span>}
            </button>
          )}
        </span>
        <ModeBadge source={source} sandbox={sandbox} />
        {paperPositions.length > 0 && (
          <button className="cw-clear-all" title="Close all paper positions" onClick={clearAll}>✕ All</button>
        )}
        <button className="cw-toggle" onClick={toggle}>{collapsed ? '▾' : '▴'}</button>
      </div>

      {!collapsed && (
        <div className="cw-body cw-terminal-body">
          {tab === 'positions' && (
            <>
              {posCount === 0 ? (
                <div className="cw-empty">No open positions</div>
              ) : (
                <>
                  <div className="pos-head">
                    <span>Symbol</span><span>Side</span><span>Qty</span>
                    <span>Avg</span><span>LTP</span><span>P&L</span><span />
                  </div>
                  {isLive && brokerPositions.map((p) => (
                    <BrokerPosRow key={p.instrument_token + p.product} p={p} onCancel={null} />
                  ))}
                  {isLive && brokerPositions.length > 0 && paperPositions.length > 0 && (
                    <div className="pos-section-sep">Paper</div>
                  )}
                  {paperPositions.map((p) => (
                    <PaperPosRow key={p.id} p={p} onRemove={removePaper} />
                  ))}
                </>
              )}
            </>
          )}

          {tab === 'orders' && isLive && (
            <>
              {ordCount === 0 ? (
                <div className="cw-empty">No orders today</div>
              ) : (
                <>
                  <div className="pos-head">
                    <span>Symbol</span><span>Side</span><span>Qty</span>
                    <span>Type</span><span>Price</span><span>Status</span><span />
                  </div>
                  {brokerOrders.map((o) => (
                    <OrderRow key={o.order_id} o={o} onCancel={(id) => cancelOrder(id)} />
                  ))}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ROOT — init broker store, render all three widgets
// ─────────────────────────────────────────────────────────────────────────

export function ChartWidgets() {
  const initBroker = useBrokerStore((s) => s.init);
  const stopPolling = useBrokerStore((s) => s.stopPolling);
  const source = useBrokerStore((s) => s.source);
  const sandbox = useBrokerStore((s) => s.sandbox);

  useEffect(() => {
    initBroker();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AccountWidget source={source} sandbox={sandbox} />
      <PnlWidget source={source} sandbox={sandbox} />
      <PositionsTerminal source={source} sandbox={sandbox} />
    </>
  );
}
