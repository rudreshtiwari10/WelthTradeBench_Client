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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePositionsStore } from '../state/positionsStore';
import type { Position } from '../state/positionsStore';
import { useBrokerStore } from '../state/brokerStore';
import { usePriceLinesStore } from '../state/priceLinesStore';
import { useSlTpPopupStore } from '../state/slTpPopupStore';
import { useToastStore } from '../state/toastStore';
import type { BrokerPosition } from '../data/brokerService';
import { liveFeed } from '../data/dataService';
import { useQuote } from '../data/useQuote';
import { optionPremium, lotSize } from '../data/options';
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
  if (source === 'paper') return <span className="cw-mode-badge paper">PAPER</span>;
  return <span className={`cw-mode-badge ${sandbox ? 'sandbox' : 'live'}`}>{sandbox ? 'SANDBOX' : 'LIVE'}</span>;
}

// ─── Date / time helpers (Positions & Orders "Time" column) ──────────────

/** Compact "16 Jun, 14:32" for an epoch-ms timestamp. */
function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date}, ${time}`;
}

/**
 * Broker order timestamps differ in format between Kite ("2024-06-16 09:15:32")
 * and Upstox (similar, sometimes "DD-MM-YYYY HH:mm:ss"). Try both before giving up.
 */
function parseOrderTimestamp(ts: string | undefined | null): Date | null {
  if (!ts) return null;
  const isoLike = ts.includes(' ') && !ts.includes('T') ? ts.replace(' ', 'T') : ts;
  let d = new Date(isoLike);
  if (!isNaN(d.getTime())) return d;
  const m = ts.match(/^(\d{2})-(\d{2})-(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [, dd, mm, yyyy, hh, mi, ss] = m;
    d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function fmtOrderTime(ts: string | undefined | null): string {
  const d = parseOrderTimestamp(ts);
  return d ? fmtDateTime(d.getTime()) : (ts || '—');
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Keeps only today's orders — defends against any broker/sandbox returning stale days. */
function isOrderFromToday(o: { order_timestamp?: string }): boolean {
  const d = parseOrderTimestamp(o.order_timestamp);
  if (!d) return true; // unparseable — don't hide a legitimate order over a format quirk
  return isSameLocalDay(d, new Date());
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

  if (source !== 'paper' && funds?.equity) {
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
            <span>{source !== 'paper' ? 'Total balance' : 'Demo balance'}</span>
            <span className="cw-v">₹{total.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="cw-row">
            <span>Margin used</span>
            <span className="cw-v cw-down">
              {used > 0 ? `-₹${used.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '₹0'}
            </span>
          </div>
          {source !== 'paper' && funds?.equity?.span != null && (
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
          {source !== 'paper' && funds?.equity?.pnl != null && (
            <div className="cw-row">
              <span>Day P&L</span>
              <span className={`cw-v ${(funds.equity.pnl ?? 0) >= 0 ? 'cw-up' : 'cw-down'}`}>
                {(funds.equity.pnl ?? 0) >= 0 ? '+' : ''}₹{(funds.equity.pnl ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </span>
            </div>
          )}
          {source === 'paper' && (
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

// Live broker mode: subscribe to underlying ticks and compute P&L tick-by-tick
function useLiveBrokerPnl(positions: BrokerPosition[]) {
  const [spots, setSpots] = useState<Record<string, number>>({});

  const underlyings = useMemo(() => {
    const syms = positions.map((p) => {
      const parsed = parseKiteSymbol(p.trading_symbol);
      return parsed.kind === 'equity' ? p.trading_symbol : parsed.underlying;
    });
    return [...new Set(syms)];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.map((p) => p.trading_symbol).sort().join(',')]);

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
    const qty = p.quantity;
    if (qty === 0) continue;
    const parsed = parseKiteSymbol(p.trading_symbol);
    let pnl: number;

    if (parsed.kind === 'equity') {
      const ltp = spots[p.trading_symbol] ?? p.last_price;
      pnl = (ltp - p.average_price) * qty;
    } else if (parsed.kind === 'option') {
      const spot = spots[parsed.underlying] ?? 0;
      if (spot > 0) {
        const daysLeft = parsed.expiryMs
          ? Math.max(0.1, (parsed.expiryMs - Date.now()) / 86_400_000)
          : 7;
        const curPremium = optionPremium(spot, parsed.strike, parsed.optType, daysLeft);
        pnl = (curPremium - p.average_price) * Math.abs(qty) * (qty > 0 ? 1 : -1);
      } else {
        pnl = p.unrealised_profit ?? 0;
      }
    } else {
      // Future: broker unrealised_profit already accounts for lot size / multiplier
      pnl = p.unrealised_profit ?? 0;
    }

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

  // Kite's net positions include flat (qty=0) rows — filter those out
  const openBrokerPositions = brokerPositions.filter((p) => p.quantity !== 0);
  const { total: livePnlTotal, wins: livePnlWins, losses: livePnlLosses } =
    useLiveBrokerPnl(source !== 'paper' ? openBrokerPositions : []);

  const totalPnl = source !== 'paper' ? livePnlTotal : paperTotal;
  const wins     = source !== 'paper' ? livePnlWins  : paperWins;
  const losses   = source !== 'paper' ? livePnlLosses : paperLosses;

  const posCount = source !== 'paper' ? openBrokerPositions.length : paperPositions.length;
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
            {pnlUp ? '+' : '−'}₹{Math.abs(totalPnl).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                  {pnlUp ? '+' : '−'}₹{Math.abs(totalPnl).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="cw-row cw-pnl-meta">
                <span className="cw-up">▲ {wins} winning</span>
                <span className="cw-down">▼ {losses} losing</span>
              </div>
              {source !== 'paper' && agoLabel && (
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

// Month abbreviation → 0-indexed month number for expiry parsing
const _MON: Record<string, number> = {
  JAN:0, FEB:1, MAR:2, APR:3, MAY:4, JUN:5,
  JUL:6, AUG:7, SEP:8, OCT:9, NOV:10, DEC:11,
};

type ParsedKiteSymbol =
  | { kind: 'option'; underlying: string; strike: number; optType: 'CE' | 'PE'; expiryMs?: number }
  | { kind: 'future'; underlying: string; expiryMs?: number }
  | { kind: 'equity'; tradingsymbol: string };

/** Last Thursday of a given year/month (0-indexed). */
function _lastThursday(year: number, mon: number): number {
  const lastDay = new Date(Date.UTC(year, mon + 1, 0));
  const back = (lastDay.getUTCDay() + 3) % 7;
  return new Date(Date.UTC(year, mon, lastDay.getUTCDate() - back)).getTime();
}

/**
 * Parse any Kite tradingsymbol — option, future, or equity.
 * Never returns null; always classifies by kind.
 *
 * Handles:
 *   Monthly option/future  NIFTY24JUN24000CE / NIFTY24JUNFUT
 *   Weekly option (Jan-Sep) NIFTY2461324000CE  (YY + M(1-digit) + DD + strike + CE/PE)
 *   Weekly option (Oct-Dec) NIFTY241013240000CE (YY + MM(2-digit) + DD + strike + CE/PE)
 *   Weekly future           NIFTY24613FUT
 *   Equity                  RELIANCE / NIFTYBEES
 */
function parseKiteSymbol(sym: string): ParsedKiteSymbol {
  const s = sym.trim().toUpperCase();

  // ─── Options (CE / PE suffix) ──────────────────────────────────────────
  if (s.endsWith('CE') || s.endsWith('PE')) {
    const optType = s.slice(-2) as 'CE' | 'PE';
    const body = s.slice(0, -2);
    const ulyM = body.match(/^([A-Z]+)/);
    if (ulyM) {
      const underlying = ulyM[1];
      const rest = body.slice(underlying.length);

      // Monthly: YYMMM + strike digits (e.g. "24JUN24000")
      const moM = rest.match(/^(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d+)$/);
      if (moM) {
        const year = 2000 + parseInt(moM[1], 10);
        const mon  = _MON[moM[2]];
        const strike = parseInt(moM[3], 10);
        const expiryMs = mon !== undefined ? _lastThursday(year, mon) : undefined;
        return { kind: 'option', underlying, strike, optType, expiryMs };
      }

      // Weekly: rest is all digits — date (5 or 6 digits) + strike (remaining)
      if (/^\d+$/.test(rest) && rest.length >= 7) {
        let strike: number | undefined;
        let expiryMs: number | undefined;

        // 6-digit date first (months 10-12): YY + MM(2) + DD(2) + strike
        if (rest.length >= 8) {
          const mo = parseInt(rest.slice(2, 4), 10);
          const dy = parseInt(rest.slice(4, 6), 10);
          if (mo >= 10 && mo <= 12 && dy >= 1 && dy <= 31) {
            const s2 = parseInt(rest.slice(6), 10);
            if (s2 > 0) {
              strike = s2;
              const d = new Date(Date.UTC(2000 + parseInt(rest.slice(0, 2), 10), mo - 1, dy));
              if (!isNaN(d.getTime())) expiryMs = d.getTime();
            }
          }
        }
        // 5-digit date (months 1-9): YY + M(1) + DD(2) + strike
        if (strike === undefined) {
          const mo = parseInt(rest.slice(2, 3), 10);
          const dy = parseInt(rest.slice(3, 5), 10);
          if (mo >= 1 && mo <= 9 && dy >= 1 && dy <= 31) {
            const s2 = parseInt(rest.slice(5), 10);
            if (s2 > 0) {
              strike = s2;
              const d = new Date(Date.UTC(2000 + parseInt(rest.slice(0, 2), 10), mo - 1, dy));
              if (!isNaN(d.getTime())) expiryMs = d.getTime();
            }
          }
        }
        if (strike && strike > 0) {
          return { kind: 'option', underlying, strike, optType, expiryMs };
        }
      }
    }
  }

  // ─── Futures (FUT suffix) ──────────────────────────────────────────────
  if (s.endsWith('FUT')) {
    const body = s.slice(0, -3);
    const ulyM = body.match(/^([A-Z]+)/);
    const underlying = ulyM ? ulyM[1] : body;
    const rest = ulyM ? body.slice(underlying.length) : '';
    let expiryMs: number | undefined;

    // Monthly future: YYMMM (e.g. "24JUN")
    const moM = rest.match(/^(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/);
    if (moM) {
      const year = 2000 + parseInt(moM[1], 10);
      const mon  = _MON[moM[2]];
      if (mon !== undefined) expiryMs = _lastThursday(year, mon);
    }
    // Weekly future 6-digit date (months 10-12)
    if (!expiryMs && /^\d{6}$/.test(rest)) {
      const mo = parseInt(rest.slice(2, 4), 10);
      const dy = parseInt(rest.slice(4, 6), 10);
      if (mo >= 10 && mo <= 12 && dy >= 1 && dy <= 31) {
        const d = new Date(Date.UTC(2000 + parseInt(rest.slice(0, 2), 10), mo - 1, dy));
        if (!isNaN(d.getTime())) expiryMs = d.getTime();
      }
    }
    // Weekly future 5-digit date (months 1-9)
    if (!expiryMs && /^\d{5}$/.test(rest)) {
      const mo = parseInt(rest.slice(2, 3), 10);
      const dy = parseInt(rest.slice(3, 5), 10);
      if (mo >= 1 && mo <= 9 && dy >= 1 && dy <= 31) {
        const d = new Date(Date.UTC(2000 + parseInt(rest.slice(0, 2), 10), mo - 1, dy));
        if (!isNaN(d.getTime())) expiryMs = d.getTime();
      }
    }
    return { kind: 'future', underlying, expiryMs };
  }

  // ─── Equity (everything else) ──────────────────────────────────────────
  return { kind: 'equity', tradingsymbol: sym };
}

function BrokerPosRow({ p }: { p: BrokerPosition }) {
  const qty   = p.quantity;
  const side: 'buy' | 'sell' = qty >= 0 ? 'buy' : 'sell';
  const pnl   = p.unrealised_profit ?? 0;
  const pnlUp = pnl >= 0;

  const allLines  = usePriceLinesStore((s) => s.lines);
  const addEntry  = usePriceLinesStore((s) => s.addEntry);
  const parsed    = parseKiteSymbol(p.trading_symbol);  // never null

  // Derive kind-specific fields once (avoids repeated type-narrowing casts)
  const isOption  = parsed.kind === 'option';
  const isFuture  = parsed.kind === 'future';
  const isEquity  = parsed.kind === 'equity';
  const posUnderlying = isEquity ? p.trading_symbol : parsed.underlying;
  const posExpiry     = parsed.kind !== 'equity' ? parsed.expiryMs   : undefined;
  const posStrike     = parsed.kind === 'option'  ? parsed.strike     : undefined;
  const posOptType    = parsed.kind === 'option'  ? parsed.optType    : undefined;

  // Find existing chart entry line for any position type
  const entryLine = allLines.find(l =>
    l.type === 'entry' && (
      l.symbol === p.trading_symbol ||
      (isEquity
        ? l.underlying.toUpperCase() === p.trading_symbol.toUpperCase() && !l.optType && !l.strike
        : l.underlying.toUpperCase() === posUnderlying.toUpperCase() &&
          (isOption ? l.strike === posStrike && l.optType === posOptType : !l.optType)
      )
    )
  );

  const slLine     = entryLine ? allLines.find(l => l.positionId === entryLine.positionId && l.type === 'sl') : undefined;
  const tpLine     = entryLine ? allLines.find(l => l.positionId === entryLine.positionId && l.type === 'tp') : undefined;
  const posId      = entryLine?.positionId;
  const optType    = entryLine?.optType ?? posOptType;

  // For options/futures, chart lines live on the INDEX axis (not at the option premium).
  // Subscribe to the underlying spot so ensureLines() can place the entry line at the
  // correct index level rather than at p.average_price (the fill premium, e.g. ₹150).
  const underlyingSpot = useQuote(posUnderlying).last ?? 0;
  const fillPremium = p.average_price ?? 0;
  const entryPrice = (isOption || isFuture)
    ? (entryLine?.entryPrice ?? (underlyingSpot > 0 ? underlyingSpot : fillPremium))
    : (entryLine?.entryPrice ?? fillPremium);

  // lot count for options/futures; undefined for equity (1 share = no lot concept)
  const lotsCount = (isOption || isFuture)
    ? Math.max(1, Math.round(Math.abs(qty) / lotSize(posUnderlying)))
    : undefined;

  // Create chart lines on demand for positions not placed through this app
  const ensureLines = (): string => {
    if (posId) return posId;
    const newId = `kite_${p.instrument_token || p.trading_symbol}`;
    const already = usePriceLinesStore.getState().lines.some(
      l => l.positionId === newId && l.type === 'entry'
    );
    if (!already) {
      addEntry({
        positionId: newId,
        symbol: p.trading_symbol,
        underlying: posUnderlying,   // equity: trading_symbol; options/futures: index name
        side,
        qty: Math.abs(qty),
        lots: lotsCount,             // drives correct exit qty in SL/TP trigger
        price: entryPrice,           // index spot for options/futures; fill price for equity
        entryPrice,
        optionEntryPremium: isOption ? fillPremium : undefined,  // for SL/TP P&L display
        strike: posStrike,
        optType: posOptType,
        expiryDate: posExpiry,
      });
    }
    return newId;
  };

  // Determine default SL direction for prompt suggestions
  const profitOnUp = optType
    ? (optType === 'CE' && side === 'buy') || (optType === 'PE' && side === 'sell')
    : side === 'buy';

  const promptSl = () => {
    const pid = ensureLines();
    const defSl = parseFloat((entryPrice * (profitOnUp ? 0.985 : 1.015)).toFixed(2));
    const txType: 'BUY' | 'SELL' = qty > 0 ? 'SELL' : 'BUY';
    const prod: 'D' | 'I' = p.product?.toUpperCase() === 'MIS' ? 'I' : 'D';
    const expiryStr = posExpiry ? new Date(posExpiry).toISOString().split('T')[0] : undefined;
    let exitOrder: import('../state/slTpPopupStore').ExitLimitOrder;
    if (isOption) {
      exitOrder = { qty: Math.abs(qty), transaction_type: txType, product: prod, segment: 'option', underlying: posUnderlying, expiry: expiryStr, strike: posStrike, option_type: posOptType };
    } else if (isFuture) {
      exitOrder = { qty: Math.abs(qty), transaction_type: txType, product: prod, segment: 'future', underlying: posUnderlying, expiry: expiryStr };
    } else {
      exitOrder = { qty: Math.abs(qty), transaction_type: txType, product: prod, segment: 'equity', tradingsymbol: p.trading_symbol, exchange: p.exchange || 'NSE', underlying: p.trading_symbol };
    }
    useSlTpPopupStore.getState().open({
      posId: pid, type: 'sl', symbol: p.trading_symbol,
      entryPrice, side, suggestedPrice: slLine?.price ?? defSl, exitOrder,
    });
  };

  const promptTp = () => {
    const pid = ensureLines();
    const defTp = parseFloat((entryPrice * (profitOnUp ? 1.015 : 0.985)).toFixed(2));
    const txType: 'BUY' | 'SELL' = qty > 0 ? 'SELL' : 'BUY';
    const prod: 'D' | 'I' = p.product?.toUpperCase() === 'MIS' ? 'I' : 'D';
    const expiryStr = posExpiry ? new Date(posExpiry).toISOString().split('T')[0] : undefined;
    let exitOrder: import('../state/slTpPopupStore').ExitLimitOrder;
    if (isOption) {
      exitOrder = { qty: Math.abs(qty), transaction_type: txType, product: prod, segment: 'option', underlying: posUnderlying, expiry: expiryStr, strike: posStrike, option_type: posOptType };
    } else if (isFuture) {
      exitOrder = { qty: Math.abs(qty), transaction_type: txType, product: prod, segment: 'future', underlying: posUnderlying, expiry: expiryStr };
    } else {
      exitOrder = { qty: Math.abs(qty), transaction_type: txType, product: prod, segment: 'equity', tradingsymbol: p.trading_symbol, exchange: p.exchange || 'NSE', underlying: p.trading_symbol };
    }
    useSlTpPopupStore.getState().open({
      posId: pid, type: 'tp', symbol: p.trading_symbol,
      entryPrice, side, suggestedPrice: tpLine?.price ?? defTp, exitOrder,
    });
  };

  // EXIT → open LIMIT price popup; chart lines auto-clear once broker position becomes flat
  const promptExit = () => {
    if (qty === 0) return;
    const pid = ensureLines();
    const txType: 'BUY' | 'SELL' = qty > 0 ? 'SELL' : 'BUY';
    const product: 'D' | 'I' = p.product?.toUpperCase() === 'MIS' ? 'I' : 'D';
    const ltp = p.last_price ?? entryPrice;
    const expiryStr = posExpiry
      ? new Date(posExpiry).toISOString().split('T')[0]
      : undefined;

    let exitOrder: import('../state/slTpPopupStore').ExitLimitOrder;
    if (isOption) {
      exitOrder = {
        qty: Math.abs(qty), transaction_type: txType, product, segment: 'option',
        underlying: posUnderlying, expiry: expiryStr,
        strike: posStrike, option_type: posOptType,
      };
    } else if (isFuture) {
      exitOrder = {
        qty: Math.abs(qty), transaction_type: txType, product, segment: 'future',
        underlying: posUnderlying, expiry: expiryStr,
      };
    } else {
      exitOrder = {
        qty: Math.abs(qty), transaction_type: txType, product, segment: 'equity',
        tradingsymbol: p.trading_symbol, exchange: p.exchange || 'NSE',
        underlying: p.trading_symbol,
      };
    }

    useSlTpPopupStore.getState().open({
      posId: pid, type: 'exit', symbol: p.trading_symbol,
      entryPrice, side, suggestedPrice: ltp, exitOrder,
    });
  };

  const canSlTp = qty !== 0;
  const canExit = qty !== 0;
  const lastUpdated = useBrokerStore((s) => s.lastUpdated);

  return (
    <div className="pos-row">
      <span className="pos-sym" title={p.trading_symbol}>{p.trading_symbol}</span>
      <span className={`pos-side ${side}`}>{side.toUpperCase()}</span>
      <span className="pos-qty">{Math.abs(qty)}</span>
      <span className="pos-price">₹{(p.average_price ?? 0).toFixed(2)}</span>
      <span className="pos-ltp">₹{(p.last_price ?? 0).toFixed(2)}</span>
      <span className={`pos-pnl ${pnlUp ? 'cw-up' : 'cw-down'}`}>
        {pnlUp ? '+' : '−'}₹{Math.abs(pnl).toFixed(2)}
      </span>
      <span className="pos-time" title="Last synced from broker">{lastUpdated ? fmtDateTime(lastUpdated) : '—'}</span>
      <div className="pos-actions">
        <button
          className="pos-sl-btn"
          title="Set / move Stop Loss on chart"
          disabled={!canSlTp}
          onClick={promptSl}
        >SL</button>
        <button
          className="pos-tp-btn"
          title="Set / move Take Profit on chart"
          disabled={!canSlTp}
          onClick={promptTp}
        >TP</button>
        <button
          className="pos-exit-btn"
          title={canExit ? 'Place LIMIT exit order' : 'Position is already flat (qty = 0)'}
          disabled={!canExit}
          onClick={promptExit}
        >EXIT</button>
      </div>
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

  const promptSl = () => useSlTpPopupStore.getState().open({
    posId: p.id, type: 'sl', symbol: p.symbol, entryPrice: p.price, side: p.side,
    suggestedPrice: parseFloat((p.price * (p.side === 'buy' ? 0.80 : 1.20)).toFixed(2)),
  });
  const promptTp = () => useSlTpPopupStore.getState().open({
    posId: p.id, type: 'tp', symbol: p.symbol, entryPrice: p.price, side: p.side,
    suggestedPrice: parseFloat((p.price * (p.side === 'buy' ? 1.30 : 0.70)).toFixed(2)),
  });

  return (
    <div className="pos-row">
      <span className="pos-sym" title={p.symbol}>{p.symbol}</span>
      <span className={`pos-side ${p.side}`}>{p.side.toUpperCase()}</span>
      <span className="pos-qty">{p.qty}</span>
      <span className="pos-price">₹{p.price.toFixed(2)}</span>
      <span className="pos-ltp">{hasMeta && spot > 0 ? `₹${cur.toFixed(2)}` : '—'}</span>
      <span className={`pos-pnl ${pnlUp ? 'cw-up' : 'cw-down'}`}>
        {hasMeta && spot > 0 ? `${pnlUp ? '+' : '−'}₹${Math.abs(pnl).toFixed(2)}` : '—'}
      </span>
      <span className="pos-time" title="Position opened">{fmtDateTime(p.ts)}</span>
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
      <span className="pos-time" title={o.order_timestamp}>{fmtOrderTime(o.order_timestamp)}</span>
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

  const isLive = source !== 'paper';

  // Auto-cleanup: remove chart lines whose broker position is now flat (qty=0) or gone.
  // Runs on every broker refresh. Paper-position lines are identified by their positionId
  // being present in paperPositions and are intentionally skipped.
  useEffect(() => {
    if (!isLive || brokerPositions.length === 0) return;

    const paperIds = new Set(paperPositions.map((p) => p.id));
    const entryLines = usePriceLinesStore.getState().lines.filter((l) => l.type === 'entry');

    entryLines.forEach((el) => {
      if (paperIds.has(el.positionId)) return; // skip paper positions

      const stillOpen = brokerPositions.some((p) => {
        if (p.quantity === 0) return false;
        // match by full option/equity trading symbol
        if (p.trading_symbol === el.symbol) return true;
        if (p.trading_symbol === el.underlying) return true;
        // kite_<instrument_token|tradingsymbol> format (from BrokerPosRow.ensureLines)
        if (el.positionId.startsWith('kite_')) {
          const token = el.positionId.slice(5);
          return String(p.instrument_token) === token || p.trading_symbol === token;
        }
        return false;
      });

      if (!stillOpen) removeLines(el.positionId);
    });
  }, [brokerPositions, isLive, removeLines, paperPositions]);

  // Kite's net positions include flat (qty=0) rows — filter those out
  const openBrokerPositions = brokerPositions.filter((p) => p.quantity !== 0);
  // Always count both broker + paper so the badge reflects reality.
  const posCount = (isLive ? openBrokerPositions.length : 0) + paperPositions.length;
  // Both Kite's and Upstox's order-book endpoints already return only the
  // current trading day, but filter defensively so old/stale entries never show.
  // Sort newest-first so the most recently traded order leads, working backward through the day.
  const todaysOrders = brokerOrders
    .filter(isOrderFromToday)
    .slice()
    .sort((a, b) => (parseOrderTimestamp(b.order_timestamp)?.getTime() ?? 0) - (parseOrderTimestamp(a.order_timestamp)?.getTime() ?? 0));
  const ordCount = isLive ? todaysOrders.length : 0;

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
                    <span>Avg</span><span>LTP</span><span>P&L</span><span>Time</span><span />
                  </div>
                  {isLive && openBrokerPositions.map((p) => (
                    <BrokerPosRow key={p.instrument_token + p.product} p={p} />
                  ))}
                  {isLive && openBrokerPositions.length > 0 && paperPositions.length > 0 && (
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
                    <span>Type</span><span>Price</span><span>Status</span><span>Time</span><span />
                  </div>
                  {todaysOrders.map((o) => (
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
// SL / TP INLINE CHART POPUP
// ─────────────────────────────────────────────────────────────────────────

function SlTpPopup() {
  const popup        = useSlTpPopupStore((s) => s.popup);
  const editPrice    = useSlTpPopupStore((s) => s.editPrice);
  const close        = useSlTpPopupStore((s) => s.close);
  const setEdit      = useSlTpPopupStore((s) => s.setEditPrice);
  const setSl        = usePriceLinesStore((s) => s.setSl);
  const setTp        = usePriceLinesStore((s) => s.setTp);
  const setExit      = usePriceLinesStore((s) => s.setExit);
  const placeOrder   = useBrokerStore((s) => s.placeOrder);
  const activeBroker = useBrokerStore((s) => s.activeBroker);
  const pushToast    = useToastStore((s) => s.push);

  if (!popup) return null;

  const price   = parseFloat(editPrice);
  const isValid = isFinite(price) && price > 0;
  const pct     = popup.entryPrice > 0 ? ((price - popup.entryPrice) / popup.entryPrice) * 100 : 0;
  const isSl    = popup.type === 'sl';
  const isExit  = popup.type === 'exit';

  const confirm = () => {
    if (!isValid) return;
    if (popup.exitOrder) {
      const reParams: import('../state/priceLinesStore').ExitOrderReParams = {
        broker: activeBroker,
        qty: popup.exitOrder.qty,
        transaction_type: popup.exitOrder.transaction_type,
        product: popup.exitOrder.product,
        segment: popup.exitOrder.segment,
        underlying: popup.exitOrder.underlying,
        expiry: popup.exitOrder.expiry,
        strike: popup.exitOrder.strike,
        option_type: popup.exitOrder.option_type,
        tradingsymbol: popup.exitOrder.tradingsymbol,
        exchange: popup.exitOrder.exchange,
      };

      if (popup.exitOrder.segment === 'option') {
        // Options: SL/TP is set at an INDEX price level, not the option premium.
        // Placing a LIMIT order at the index price on the option contract is invalid
        // (Kite rejects "limit above/below price"). Instead, store the index level
        // with reParams so the tick monitor can fire a MARKET exit when triggered.
        if (isExit) {
          setExit(popup.posId, price, undefined, reParams);
          pushToast(`Exit set at index ₹${price.toFixed(2)} — will MARKET-exit ${popup.symbol} on trigger`);
        } else if (isSl) {
          setSl(popup.posId, price, undefined, reParams);
          pushToast(`SL set at index ₹${price.toFixed(2)} — will MARKET-exit ${popup.symbol} on trigger`);
        } else {
          setTp(popup.posId, price, undefined, reParams);
          pushToast(`TP set at index ₹${price.toFixed(2)} — will MARKET-exit ${popup.symbol} on trigger`);
        }
      } else {
        // Equity / futures: place LIMIT or SL-M order directly on the broker.
        const orderType = isSl ? 'SL' : 'LIMIT';
        placeOrder({
          ...popup.exitOrder,
          order_type: orderType,
          price,
          trigger_price: isSl ? price : undefined,
        })
          .then((result) => {
            if (isExit) {
              setExit(popup.posId, price, result.order_id, reParams);
              pushToast(`LIMIT exit placed: ${popup.symbol} @ ₹${price.toFixed(2)}`);
            } else if (isSl) {
              setSl(popup.posId, price, result.order_id, reParams);
              pushToast(`Stop Loss order placed: ${popup.symbol} @ ₹${price.toFixed(2)}`);
            } else {
              setTp(popup.posId, price, result.order_id, reParams);
              pushToast(`LIMIT TP placed: ${popup.symbol} @ ₹${price.toFixed(2)}`);
            }
          })
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            pushToast(`${orderType} order FAILED for ${popup.symbol}: ${msg}`);
          });
      }
    } else if (isSl) {
      // Paper mode: chart-only SL line
      setSl(popup.posId, price);
    } else if (!isExit) {
      // Paper mode: chart-only TP line
      setTp(popup.posId, price);
    }
    close();
  };

  return (
    <>
      <div className="sltp-overlay" onClick={close} />
      <div className="sltp-popup">
        <div className="sltp-hdr">
          <span className={`sltp-tag ${isSl ? 'sltp-sl' : isExit ? 'sltp-exit' : 'sltp-tp'}`}>
            {isSl ? (popup.exitOrder ? 'Limit SL' : 'Stop Loss') : isExit ? 'Limit Exit' : (popup.exitOrder ? 'Limit TP' : 'Take Profit')}
          </span>
          <button className="sltp-x" onClick={close}>✕</button>
        </div>
        <div className="sltp-contract">{popup.symbol}</div>
        <div className="sltp-meta">
          {isExit
            ? `LTP ₹${popup.suggestedPrice.toFixed(2)} · ${popup.side.toUpperCase()} ${popup.exitOrder?.qty ?? ''} qty`
            : `Entry ₹${popup.entryPrice.toFixed(2)} · ${popup.side.toUpperCase()}`}
        </div>
        <div className="sltp-row">
          <span className="sltp-lbl">Price (₹)</span>
          <input
            className="sltp-inp"
            type="number"
            step="0.5"
            value={editPrice}
            onChange={(e) => setEdit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') close(); }}
            autoFocus
          />
          {isFinite(pct) && !isExit && (
            <span className={`sltp-pct ${pct >= 0 ? 'sltp-pct-up' : 'sltp-pct-dn'}`}>
              {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
            </span>
          )}
        </div>
        <div className="sltp-hint">
          {popup.exitOrder
            ? `Places a LIMIT ${popup.exitOrder.transaction_type} order at this price. Broker auto-exits when price reaches it. Cancel via Orders tab if needed.`
            : isSl
              ? (popup.side === 'buy'
                  ? 'Price must drop to this level to trigger exit'
                  : 'Price must rise to this level to trigger exit')
              : (popup.side === 'buy'
                  ? 'Price must rise to this level to take profit'
                  : 'Price must drop to this level to take profit')}
        </div>
        <div className="sltp-btns">
          <button className="sltp-cancel" onClick={close}>Cancel</button>
          <button
            className={`sltp-confirm ${isSl ? 'sltp-sl-btn' : isExit ? 'sltp-exit-btn' : 'sltp-tp-btn'}`}
            disabled={!isValid}
            onClick={confirm}
          >
            {popup.exitOrder
              ? (isSl ? 'Place Limit SL' : isExit ? 'Place Limit Exit' : 'Place Limit TP')
              : (isSl ? 'Set Stop Loss' : 'Set Take Profit')}
          </button>
        </div>
      </div>
    </>
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
      <SlTpPopup />
    </>
  );
}
