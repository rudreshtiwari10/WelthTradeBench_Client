/**
 * OptionsChainPanel — floating panel for one-click options trading.
 *
 * Workflow:
 *  1. Pick underlying (NIFTY, BANKNIFTY, …), expiry, lot size, and side (BUY/SELL).
 *  2. Click a CE or PE cell → trade is placed instantly at market price.
 *  3. Entry + SL + TP price lines are created on the UNDERLYING INDEX chart
 *     (not on the option chart). SL/TP default to ±1.5 % of the current index price.
 *  4. The underlying chart becomes active so the user sees the SL/TP lines immediately.
 *
 * Works in both mock (paper) and live (Upstox) mode.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDerivativesChain } from '../data/dataService';
import type { DerivChainRow } from '../data/dataService';
import { liveFeed } from '../data/dataService';
import { lotSize } from '../data/options';
import { usePositionsStore } from '../state/positionsStore';
import { usePriceLinesStore } from '../state/priceLinesStore';
import { useBrokerStore } from '../state/brokerStore';
import { useToastStore } from '../state/toastStore';
import { useChartStore } from '../state/chartStore';
import { useUiStore } from '../state/uiStore';
import type { SymbolInfo } from '../data/types';
import './OptionsChainPanel.css';

// ─── Constants ────────────────────────────────────────────────────────────

const UNDERLYINGS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];

const UL_INFO: Record<string, Pick<SymbolInfo, 'name' | 'exchange' | 'kind'>> = {
  NIFTY:      { name: 'Nifty 50 Index',       exchange: 'NSE', kind: 'index' },
  BANKNIFTY:  { name: 'Nifty Bank Index',      exchange: 'NSE', kind: 'index' },
  FINNIFTY:   { name: 'Nifty Fin Service',     exchange: 'NSE', kind: 'index' },
  MIDCPNIFTY: { name: 'Nifty Midcap Select',   exchange: 'NSE', kind: 'index' },
  SENSEX:     { name: 'BSE Sensex',            exchange: 'BSE', kind: 'index' },
  BANKEX:     { name: 'BSE Bankex',            exchange: 'BSE', kind: 'index' },
};

// Expiry weekday (0=Sun…6=Sat) per underlying
const EXPIRY_DOW: Record<string, number> = {
  NIFTY: 4, BANKNIFTY: 3, FINNIFTY: 2, MIDCPNIFTY: 1, SENSEX: 5, BANKEX: 1,
};

// ─── Helpers ──────────────────────────────────────────────────────────────

interface ExpiryOpt { label: string; value: string; days: number }

function getExpiries(underlying: string, n = 6): ExpiryOpt[] {
  const dow = EXPIRY_DOW[underlying.toUpperCase()] ?? 4;
  const results: ExpiryOpt[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (results.length < n) {
    const add = (dow - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + add);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const days  = Math.max(0, Math.round((d.getTime() - Date.now()) / 86_400_000));
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    results.push({ label, value, days });
  }
  return results;
}

function buildContractSymbol(underlying: string, expiry: string, strike: number, type: 'CE' | 'PE'): string {
  const d = new Date(expiry + 'T00:00:00Z');
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return `${underlying}${d.getUTCDate()}${mon}${strike}${type}`;
}

const fmt2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSpot = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

// ─── Component ────────────────────────────────────────────────────────────

export function OptionsChainPanel() {
  const closeChain   = useUiStore((s) => s.closeChain);
  const setSymbol    = useChartStore((s) => s.setSymbol);
  const currentSym   = useChartStore((s) => s.symbol.symbol);

  const addPaperPos  = usePositionsStore((s) => s.add);
  const addLines     = usePriceLinesStore((s) => s.addEntryWithSlTp);
  const pushToast    = useToastStore((s) => s.push);
  const brokerSource = useBrokerStore((s) => s.source);
  const brokerSandbox = useBrokerStore((s) => s.sandbox);
  const brokerPlaceOrder = useBrokerStore((s) => s.placeOrder);

  const isLive = brokerSource === 'upstox';

  // ── Panel state ──────────────────────────────────────────────────────
  const [underlying, setUnderlying] = useState('NIFTY');
  const [expiries, setExpiries] = useState<ExpiryOpt[]>(() => getExpiries('NIFTY'));
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [lots, setLots] = useState(1);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');

  // Chain data
  const [chain, setChain] = useState<DerivChainRow[]>([]);
  const [chainSpot, setChainSpot] = useState(0);
  const [loading, setLoading] = useState(false);

  // Live index spot from feed
  const [liveSpot, setLiveSpot] = useState(0);
  const spotRef = useRef(0);

  // Placing state: "24000CE" | "24000PE" | null
  const [placing, setPlacing] = useState<string | null>(null);

  // ── Expiry options reset when underlying changes ──────────────────────
  useEffect(() => {
    const exps = getExpiries(underlying);
    setExpiries(exps);
    setExpiryIdx(0);
    setChain([]);
    setChainSpot(0);
  }, [underlying]);

  // ── Subscribe to live index spot ──────────────────────────────────────
  useEffect(() => {
    setLiveSpot(0);
    const unsub = liveFeed.subscribe(underlying, (t) => {
      setLiveSpot(t.ltp);
      spotRef.current = t.ltp;
    });
    return unsub;
  }, [underlying]);

  // ── Fetch option chain ────────────────────────────────────────────────
  const fetchChain = useCallback(async () => {
    const exp = expiries[expiryIdx];
    if (!exp) return;
    setLoading(true);
    try {
      const res = await fetchDerivativesChain(underlying, exp.value);
      setChain(res.chains);
      setChainSpot(res.spot ?? 0);
    } catch (e: any) {
      setChain([]);
      const msg = e instanceof Error ? e.message : 'Unknown error';
      useToastStore.getState().push(`Failed to load option chain: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [underlying, expiryIdx, expiries]);

  useEffect(() => { fetchChain(); }, [fetchChain]);

  // Auto-refresh chain every 30 s
  useEffect(() => {
    const id = setInterval(fetchChain, 30_000);
    return () => clearInterval(id);
  }, [fetchChain]);

  // ── Effective spot (live feed > chain API) ────────────────────────────
  const effectiveSpot = liveSpot > 0 ? liveSpot : chainSpot;

  // ATM strike detection
  const atmStrike = effectiveSpot > 0 && chain.length > 0
    ? chain.reduce((best, r) =>
        Math.abs(r.strike - effectiveSpot) < Math.abs(best - effectiveSpot) ? r.strike : best,
        chain[0].strike)
    : 0;

  // ── Place trade ───────────────────────────────────────────────────────
  const placeTrade = async (row: DerivChainRow, optType: 'CE' | 'PE') => {
    const key = optType === 'CE' ? row.callKey : row.putKey;
    const ltp = optType === 'CE' ? row.callLtp : row.putLtp;
    if (!key) { pushToast('No instrument key — cannot place order'); return; }
    if (!ltp) { pushToast('Price unavailable — try again'); return; }

    const exp = expiries[expiryIdx];
    if (!exp) return;

    const indexSpot = effectiveSpot;
    if (!indexSpot) { pushToast('Waiting for spot price — try again'); return; }

    const ls        = lotSize(underlying);
    const qty       = lots * ls;
    const contract  = buildContractSymbol(underlying, exp.value, row.strike, optType);
    const expiryMs  = new Date(exp.value + 'T00:00:00Z').getTime();
    const placingKey = `${row.strike}${optType}`;

    setPlacing(placingKey);
    try {
      let positionId: string;

      if (isLive) {
        const result = await brokerPlaceOrder({
          instrument_key: key,
          qty,
          transaction_type: side.toUpperCase() as 'BUY' | 'SELL',
          order_type: 'MARKET',
          price: 0,
          product: 'D',
        });
        positionId = result.order_id ?? `live_${Date.now()}`;
        const label = brokerSandbox ? '[SANDBOX] ' : '';
        pushToast(`${label}${side.toUpperCase()} ${lots}L ${contract} @ ₹${fmt2(ltp)}`);
      } else {
        // Paper trade
        positionId = addPaperPos({
          symbol: contract,
          underlying,
          strike: row.strike,
          optType,
          expiryDate: expiryMs,
          side,
          lots,
          qty,
          price: ltp,
        });
        pushToast(`Paper ${side.toUpperCase()} ${lots}L ${contract} @ ₹${fmt2(ltp)} · View ${underlying} for SL/TP`);
      }

      // Place entry + SL + TP lines on the UNDERLYING INDEX chart
      addLines({
        positionId,
        symbol:              contract,
        underlying,           // lines appear only when viewing this index
        side,
        qty,
        lots,
        price:               indexSpot,  // entry marker at current index level
        entryPrice:          indexSpot,  // baseline for SL/TP % display
        optionEntryPremium:  ltp,        // for estimated P&L on handles
        strike:              row.strike,
        optType,
        expiryDate:          expiryMs,
        instrumentKey:       key,
      });

      // Switch to the underlying chart so user sees SL/TP immediately
      if (currentSym !== underlying) {
        const info = UL_INFO[underlying] ?? { name: underlying, exchange: 'NSE', kind: 'index' as const };
        setSymbol({ symbol: underlying, ...info });
      }

    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Unknown error';
      const hint = /margin|fund|insufficient/i.test(raw) ? ' — insufficient margin'
        : /market.*close|after.*hour/i.test(raw) ? ' — market closed' : '';
      pushToast(`Order failed: ${raw}${hint}`);
    } finally {
      setPlacing(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const exp = expiries[expiryIdx];

  return (
    <div className="ocp-panel">
      {/* ── Header ── */}
      <div className="ocp-hdr">
        <div className="ocp-ul-chips">
          {UNDERLYINGS.map((ul) => (
            <button
              key={ul}
              className={`ocp-ul-btn ${underlying === ul ? 'active' : ''}`}
              onClick={() => setUnderlying(ul)}
            >{ul}</button>
          ))}
        </div>
        <div className="ocp-hdr-right">
          {effectiveSpot > 0 && (
            <span className="ocp-spot">₹{fmtSpot(effectiveSpot)}</span>
          )}
          <button className="ocp-close" onClick={closeChain} title="Close">✕</button>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="ocp-controls">
        <div className="ocp-expiry-chips">
          {expiries.map((e, i) => (
            <button
              key={e.value}
              className={`ocp-chip ${expiryIdx === i ? 'active' : ''}`}
              onClick={() => setExpiryIdx(i)}
              title={`${e.days}d`}
            >{e.label}</button>
          ))}
        </div>
        <div className="ocp-trade-ctrl">
          <div className="ocp-side-toggle">
            <button className={`ocp-side-btn buy ${side === 'buy' ? 'on' : ''}`} onClick={() => setSide('buy')}>BUY</button>
            <button className={`ocp-side-btn sell ${side === 'sell' ? 'on' : ''}`} onClick={() => setSide('sell')}>SELL</button>
          </div>
          <label className="ocp-lots-wrap">
            <span className="ocp-lots-label">Lots</span>
            <input
              className="ocp-lots-input"
              type="number"
              min={1}
              value={lots}
              onChange={(e) => setLots(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </label>
          {exp && (
            <span className="ocp-qty-hint">
              = {(lots * lotSize(underlying)).toLocaleString('en-IN')} qty · {exp.days}d exp
            </span>
          )}
        </div>
      </div>

      {/* ── Chain table ── */}
      <div className="ocp-chain-wrap">
        <div className="ocp-chain-head">
          <span>CALL (CE)</span>
          <span>Strike</span>
          <span>PUT (PE)</span>
        </div>
        <div className="ocp-chain-body">
          {loading && <div className="ocp-empty">Loading chain…</div>}
          {!loading && chain.length === 0 && <div className="ocp-empty">No data</div>}
          {!loading && chain.map((row) => {
            const isAtm   = row.strike === atmStrike;
            const ceItm   = effectiveSpot > 0 && row.strike < effectiveSpot;
            const peItm   = effectiveSpot > 0 && row.strike > effectiveSpot;
            const cePKey  = `${row.strike}CE`;
            const pePKey  = `${row.strike}PE`;
            const cePlace = placing === cePKey;
            const pePlace = placing === pePKey;

            return (
              <div key={row.strike} className={`ocp-chain-row ${isAtm ? 'atm' : ''}`}>
                {/* CE cell */}
                <button
                  className={`ocp-ce-cell ${ceItm ? 'itm' : 'otm'} ${side}`}
                  disabled={!row.callKey || !!placing}
                  onClick={() => placeTrade(row, 'CE')}
                  title={`${side.toUpperCase()} ${lots}L ${buildContractSymbol(underlying, exp?.value ?? '', row.strike, 'CE')}`}
                >
                  {cePlace ? (
                    <span className="ocp-placing">…</span>
                  ) : (
                    <>
                      <span className="ocp-ltp">₹{fmt2(row.callLtp)}</span>
                      {row.callOi > 0 && <span className="ocp-oi">{(row.callOi / 1000).toFixed(0)}K</span>}
                    </>
                  )}
                </button>

                {/* Strike */}
                <div className={`ocp-strike ${isAtm ? 'atm' : ''}`}>
                  {row.strike.toLocaleString('en-IN')}
                  {isAtm && <span className="ocp-atm-tag">ATM</span>}
                </div>

                {/* PE cell */}
                <button
                  className={`ocp-pe-cell ${peItm ? 'itm' : 'otm'} ${side}`}
                  disabled={!row.putKey || !!placing}
                  onClick={() => placeTrade(row, 'PE')}
                  title={`${side.toUpperCase()} ${lots}L ${buildContractSymbol(underlying, exp?.value ?? '', row.strike, 'PE')}`}
                >
                  {pePlace ? (
                    <span className="ocp-placing">…</span>
                  ) : (
                    <>
                      <span className="ocp-ltp">₹{fmt2(row.putLtp)}</span>
                      {row.putOi > 0 && <span className="ocp-oi">{(row.putOi / 1000).toFixed(0)}K</span>}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="ocp-footer">
        {isLive
          ? brokerSandbox
            ? '⬡ Sandbox — simulated fills'
            : '● Live orders — real Upstox execution'
          : '◻ Paper trading — no real funds'}
        <button className="ocp-refresh" onClick={fetchChain} title="Refresh chain">↺</button>
      </div>
    </div>
  );
}
