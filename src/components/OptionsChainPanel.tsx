/**
 * OptionsChainPanel — floating panel for one-click options trading.
 *
 * Expiry dates are fetched from the backend (/api/derivatives/expiries) so they
 * always match what Upstox actually has listed.  In mock mode the backend returns
 * computed dates; in Upstox mode it returns the real listed contract expiries.
 *
 * Real-time LTPs: after each chain fetch, all Upstox instrument keys are subscribed
 * via liveFeed.subscribeKeys() and LTPs update tick-by-tick.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDerivativesChain, fetchDerivativesExpiries, liveFeed } from '../data/dataService';
import type { DerivChainRow } from '../data/dataService';
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

// Which underlyings have weekly options (SEBI 2023: one per exchange)
const WEEKLY_UNDERLYING = new Set(['NIFTY', 'SENSEX']);

// ─── Helpers ──────────────────────────────────────────────────────────────

interface ExpiryOpt { label: string; value: string; days: number }

/** Convert a YYYY-MM-DD string to a display chip option. */
function toExpiryOpt(dateStr: string): ExpiryOpt {
  // Parse as UTC midnight to avoid timezone shifts in label
  const d    = new Date(dateStr + 'T00:00:00Z');
  const days = Math.max(0, Math.round((d.getTime() - Date.now()) / 86_400_000));
  const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  return { label, value: dateStr, days };
}

function buildContractSymbol(underlying: string, expiry: string, strike: number, type: 'CE' | 'PE'): string {
  const d   = new Date(expiry + 'T00:00:00Z');
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  return `${underlying}${d.getUTCDate()}${mon}${strike}${type}`;
}

const fmt2    = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSpot = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

// ─── Component ────────────────────────────────────────────────────────────

export function OptionsChainPanel() {
  const closeChain       = useUiStore((s) => s.closeChain);
  const setSymbol        = useChartStore((s) => s.setSymbol);
  const currentSym       = useChartStore((s) => s.symbol.symbol);

  const addPaperPos      = usePositionsStore((s) => s.add);
  const addLines         = usePriceLinesStore((s) => s.addEntryWithSlTp);
  const pushToast        = useToastStore((s) => s.push);
  const brokerSource     = useBrokerStore((s) => s.source);
  const brokerSandbox    = useBrokerStore((s) => s.sandbox);
  const brokerPlaceOrder = useBrokerStore((s) => s.placeOrder);

  const isLive = brokerSource === 'upstox';

  // ── Panel state ──────────────────────────────────────────────────────
  const [underlying, setUnderlying] = useState('NIFTY');
  const [expiries, setExpiries]     = useState<ExpiryOpt[]>([]);
  const [expiryIdx, setExpiryIdx]   = useState(0);
  const [lots, setLots]             = useState(1);
  const [side, setSide]             = useState<'buy' | 'sell'>('buy');

  // Chain data
  const [chain, setChain]           = useState<DerivChainRow[]>([]);
  const [chainSpot, setChainSpot]   = useState(0);
  const [loading, setLoading]       = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);

  // Live index spot from the WebSocket feed
  const [liveSpot, setLiveSpot] = useState(0);
  const spotRef = useRef(0);

  // Placing state: "24000CE" | "24000PE" | null
  const [placing, setPlacing] = useState<string | null>(null);

  // Ref for option-tick subscription cleanup
  const optionUnsubRef = useRef<(() => void) | null>(null);

  // ── ATM depth + pending order ─────────────────────────────────────────
  const [depth, setDepth] = useState<number | 'all'>(8);
  const [pendingOrder, setPendingOrder] = useState<{ row: DerivChainRow; optType: 'CE' | 'PE' } | null>(null);
  const chainBodyRef = useRef<HTMLDivElement>(null);
  const atmRowRef    = useRef<HTMLDivElement | null>(null);

  // ── Fetch real expiry dates from backend on underlying change ─────────
  useEffect(() => {
    setExpiries([]);
    setExpiryIdx(0);
    setChain([]);
    setChainSpot(0);
    setChainError(null);

    let cancelled = false;
    fetchDerivativesExpiries(underlying)
      .then((res) => {
        if (cancelled) return;
        const opts = res.expiries.map(toExpiryOpt);
        setExpiries(opts.length ? opts : []);
      })
      .catch(() => {
        if (cancelled) return;
        // Network / server error — leave expiries empty (chain fetch will surface the error)
        setExpiries([]);
      });

    return () => { cancelled = true; };
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

  // ── Real-time option contract tick subscription ───────────────────────
  const subscribeToOptionTicks = useCallback((rows: DerivChainRow[]) => {
    // Tear down previous subscription
    if (optionUnsubRef.current) {
      optionUnsubRef.current();
      optionUnsubRef.current = null;
    }

    // Only real Upstox instrument keys (not MOCK:… placeholders)
    const realKeys = rows
      .flatMap((r) => [r.callKey, r.putKey])
      .filter((k): k is string => !!k && !k.startsWith('MOCK:'));

    if (realKeys.length === 0) return;

    // Build stable key → row-index + side lookup
    const keyMap = new Map<string, { idx: number; side: 'call' | 'put' }>();
    rows.forEach((row, i) => {
      if (row.callKey && !row.callKey.startsWith('MOCK:'))
        keyMap.set(row.callKey, { idx: i, side: 'call' });
      if (row.putKey && !row.putKey.startsWith('MOCK:'))
        keyMap.set(row.putKey, { idx: i, side: 'put' });
    });

    optionUnsubRef.current = liveFeed.subscribeKeys(realKeys, (key, ltp) => {
      if (ltp <= 0) return;
      const entry = keyMap.get(key);
      if (!entry) return;
      setChain((prev) => {
        const row = prev[entry.idx];
        if (!row) return prev;
        if (entry.side === 'call' && row.callLtp === ltp) return prev;
        if (entry.side === 'put'  && row.putLtp  === ltp) return prev;
        const next = [...prev];
        next[entry.idx] = entry.side === 'call'
          ? { ...row, callLtp: ltp }
          : { ...row, putLtp:  ltp };
        return next;
      });
    });
  }, []); // stable — deps are only refs + setChain

  // Cleanup option subscriptions on unmount
  useEffect(() => () => { optionUnsubRef.current?.(); }, []);

  // ── Fetch option chain ────────────────────────────────────────────────
  const fetchChain = useCallback(async () => {
    const exp = expiries[expiryIdx];
    if (!exp) return;
    setLoading(true);
    setChainError(null);
    try {
      const res = await fetchDerivativesChain(underlying, exp.value);
      setChain(res.chains);
      setChainSpot(res.spot ?? 0);
      subscribeToOptionTicks(res.chains);
    } catch (e: any) {
      setChain([]);
      const raw  = e instanceof Error ? e.message : String(e);
      // 404 = no listed contracts for this expiry; 502 = Upstox API error
      const msg  = raw.includes('404')
        ? `No options listed for ${exp.label} — pick another expiry.`
        : `Failed to load chain: ${raw}`;
      setChainError(msg);
      // Only toast for non-404 (404 is expected when user browses expiries)
      if (!raw.includes('404')) {
        useToastStore.getState().push(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [underlying, expiryIdx, expiries, subscribeToOptionTicks]);

  useEffect(() => { fetchChain(); }, [fetchChain]);

  // Auto-refresh every 30 s to keep OI fresh (ticks handle LTPs in real-time)
  useEffect(() => {
    const id = setInterval(fetchChain, 30_000);
    return () => clearInterval(id);
  }, [fetchChain]);

  // ── Effective spot (live WebSocket > chain REST response) ─────────────
  const effectiveSpot = liveSpot > 0 ? liveSpot : chainSpot;

  const atmStrike = effectiveSpot > 0 && chain.length > 0
    ? chain.reduce((best, r) =>
        Math.abs(r.strike - effectiveSpot) < Math.abs(best - effectiveSpot) ? r.strike : best,
        chain[0].strike)
    : 0;

  // Filtered chain: ±depth strikes around ATM
  const atmIdx = chain.findIndex((r) => r.strike === atmStrike);
  const visibleChain: DerivChainRow[] = depth === 'all' || atmIdx < 0 || chain.length === 0
    ? chain
    : chain.slice(Math.max(0, atmIdx - (depth as number)), atmIdx + (depth as number) + 1);

  // Auto-scroll chain body to center ATM row when chain loads or depth changes
  useEffect(() => {
    if (atmStrike <= 0) return;
    const body = chainBodyRef.current;
    const row  = atmRowRef.current;
    if (!body || !row) return;
    body.scrollTop = row.offsetTop - body.clientHeight / 2 + row.clientHeight / 2;
  }, [atmStrike, depth]);

  // Clear pending order on context change
  useEffect(() => { setPendingOrder(null); }, [underlying, expiryIdx, depth]);

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

    const ls         = lotSize(underlying);
    const qty        = lots * ls;
    const contract   = buildContractSymbol(underlying, exp.value, row.strike, optType);
    const expiryMs   = new Date(exp.value + 'T00:00:00Z').getTime();
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

      addLines({
        positionId,
        symbol:             contract,
        underlying,
        side,
        qty,
        lots,
        price:              indexSpot,
        entryPrice:         indexSpot,
        optionEntryPremium: ltp,
        strike:             row.strike,
        optType,
        expiryDate:         expiryMs,
        instrumentKey:      key,
      });

      if (currentSym !== underlying) {
        const info = UL_INFO[underlying] ?? { name: underlying, exchange: 'NSE', kind: 'index' as const };
        setSymbol({ symbol: underlying, ...info });
      }

    } catch (e) {
      const raw  = e instanceof Error ? e.message : 'Unknown error';
      const hint = /margin|fund|insufficient/i.test(raw) ? ' — insufficient margin'
                 : /market.*close|after.*hour/i.test(raw) ? ' — market closed' : '';
      pushToast(`Order failed: ${raw}${hint}`);
    } finally {
      setPlacing(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const exp       = expiries[expiryIdx];
  const isMonthly = !WEEKLY_UNDERLYING.has(underlying.toUpperCase());

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
          {expiries.length === 0 && (
            <span className="ocp-expiry-loading">Loading expiries…</span>
          )}
          {expiries.map((e, i) => (
            <button
              key={e.value}
              className={`ocp-chip ${expiryIdx === i ? 'active' : ''}`}
              onClick={() => setExpiryIdx(i)}
              title={`${e.days}d${isMonthly ? ' · monthly' : ''}`}
            >
              {e.label}
              {isMonthly && <span className="ocp-chip-mo">M</span>}
            </button>
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
        <div className="ocp-depth-row">
          <span className="ocp-depth-label">Rows ±ATM:</span>
          {([4, 8, 12, 'all'] as const).map((d) => (
            <button
              key={String(d)}
              className={`ocp-depth-chip ${depth === d ? 'active' : ''}`}
              onClick={() => setDepth(d)}
            >{d === 'all' ? 'All' : `±${d}`}</button>
          ))}
        </div>
      </div>

      {/* ── Chain table ── */}
      <div className="ocp-chain-wrap">
        <div className="ocp-chain-head">
          <span>CALL (CE)</span>
          <span>Strike</span>
          <span>PUT (PE)</span>
        </div>
        <div ref={chainBodyRef} className="ocp-chain-body">
          {loading && <div className="ocp-empty">Loading chain…</div>}
          {!loading && chainError && (
            <div className="ocp-empty ocp-chain-err">{chainError}</div>
          )}
          {!loading && !chainError && chain.length === 0 && (
            <div className="ocp-empty">
              {expiries.length === 0 ? 'Select an expiry' : 'No data'}
            </div>
          )}
          {!loading && !chainError && visibleChain.map((row) => {
            const isAtm       = row.strike === atmStrike;
            const ceItm       = effectiveSpot > 0 && row.strike < effectiveSpot;
            const peItm       = effectiveSpot > 0 && row.strike > effectiveSpot;
            const cePKey      = `${row.strike}CE`;
            const pePKey      = `${row.strike}PE`;
            const cePlace     = placing === cePKey;
            const pePlace     = placing === pePKey;
            const isPendingCe = pendingOrder?.row.strike === row.strike && pendingOrder?.optType === 'CE';
            const isPendingPe = pendingOrder?.row.strike === row.strike && pendingOrder?.optType === 'PE';

            return (
              <div
                key={row.strike}
                ref={isAtm ? (el) => { atmRowRef.current = el; } : undefined}
                className={`ocp-chain-row ${isAtm ? 'atm' : ''}`}
              >
                {/* CE cell */}
                <button
                  className={`ocp-ce-cell ${ceItm ? 'itm' : 'otm'} ${side}${isPendingCe ? ' selected' : ''}`}
                  disabled={!row.callKey || (!!placing && !isPendingCe)}
                  onClick={() => setPendingOrder({ row, optType: 'CE' })}
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
                  className={`ocp-pe-cell ${peItm ? 'itm' : 'otm'} ${side}${isPendingPe ? ' selected' : ''}`}
                  disabled={!row.putKey || (!!placing && !isPendingPe)}
                  onClick={() => setPendingOrder({ row, optType: 'PE' })}
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

      {/* ── Pending Order Confirmation ── */}
      {pendingOrder && exp && (
        <div className="ocp-pending">
          <div className="ocp-pending-info">
            <span className={`ocp-pending-type ${pendingOrder.optType === 'CE' ? 'ce' : 'pe'}`}>
              {pendingOrder.optType}
            </span>
            <span className="ocp-pending-contract">
              {buildContractSymbol(underlying, exp.value, pendingOrder.row.strike, pendingOrder.optType)}
            </span>
            <span className="ocp-pending-ltp">
              ₹{fmt2(pendingOrder.optType === 'CE' ? pendingOrder.row.callLtp : pendingOrder.row.putLtp)}
            </span>
            <span className={`ocp-pending-side ${side}`}>{side.toUpperCase()}</span>
            <span className="ocp-pending-lots">{lots}L</span>
          </div>
          <div className="ocp-pending-btns">
            <button className="ocp-pending-cancel" onClick={() => setPendingOrder(null)}>✕</button>
            <button
              className={`ocp-pending-place ${side}`}
              disabled={placing === `${pendingOrder.row.strike}${pendingOrder.optType}`}
              onClick={async () => {
                const snap = pendingOrder;
                try { await placeTrade(snap.row, snap.optType); }
                finally { setPendingOrder(null); }
              }}
            >
              {placing === `${pendingOrder.row.strike}${pendingOrder.optType}`
                ? 'Placing…'
                : `Place ${side.toUpperCase()}`}
            </button>
          </div>
        </div>
      )}

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
