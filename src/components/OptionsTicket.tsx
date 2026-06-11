import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '../icons/Icon';
import { useUiStore } from '../state/uiStore';
import { usePositionsStore } from '../state/positionsStore';
import { useToastStore } from '../state/toastStore';
import { useBrokerStore } from '../state/brokerStore';
import { usePriceLinesStore } from '../state/priceLinesStore';
import { useQuote } from '../data/useQuote';
import { fetchOptionChain } from '../data/brokerService';
import type { OptionChainRow } from '../data/brokerService';
import { atmStrike, expiries, lotSize, optionPremium, optionSymbol, strikes } from '../data/options';
import './OptionsTicket.css';

const API_BASE = import.meta.env.VITE_API_URL || '';

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Build a map: strike → { CE: chainRow-cell, PE: chainRow-cell }
type ChainCell = { key: string; ltp: number; bid: number; ask: number; oi: number };
type ChainMap = Map<number, { CE: ChainCell | null; PE: ChainCell | null }>;

function buildChainMap(rows: OptionChainRow[]): ChainMap {
  const m: ChainMap = new Map();
  for (const r of rows) {
    m.set(r.strike, {
      CE: r.callKey ? { key: r.callKey, ltp: r.callLtp, bid: r.callBid, ask: r.callAsk, oi: r.callOi } : null,
      PE: r.putKey  ? { key: r.putKey,  ltp: r.putLtp,  bid: r.putBid,  ask: r.putAsk,  oi: r.putOi  } : null,
    });
  }
  return m;
}

/** Round to nearest 0.05 (NSE option tick size). */
function roundTick(v: number): number {
  return Math.round(v / 0.05) * 0.05;
}

/** Protective limit price for Kite market orders.
 *  BUY  → LTP + 2%  (fills easily but caps extreme slippage)
 *  SELL → LTP - 2%
 */
function protectedPrice(ltp: number, side: 'buy' | 'sell'): number {
  return roundTick(side === 'buy' ? ltp * 1.02 : ltp * 0.98);
}

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export function OptionsTicket() {
  const trade = useUiStore((s) => s.trade);
  const close = useUiStore((s) => s.closeTrade);
  const addPosition = usePositionsStore((s) => s.add);
  const pushToast = useToastStore((s) => s.push);

  // Broker state
  const brokerSource = useBrokerStore((s) => s.source);
  const brokerSandbox = useBrokerStore((s) => s.sandbox);
  const brokerPlaceOrder = useBrokerStore((s) => s.placeOrder);
  const activeBroker = useBrokerStore((s) => s.activeBroker);
  const setActiveBroker = useBrokerStore((s) => s.setActiveBroker);
  const brokerAuth = useBrokerStore((s) => s.auth);
  const initBroker = useBrokerStore((s) => s.init);
  const addPriceLines = usePriceLinesStore((s) => s.addEntryWithSlTp);

  const isLive = brokerSource !== 'paper';
  const isKite = activeBroker === 'kite';

  // Account selector + popup auth (shown once Kite is configured).
  const showAccountSelector = brokerAuth.kite.credentialsPresent;
  const activeAuthed = brokerAuth[activeBroker].authenticated;
  const brokerLabel = activeBroker === 'kite' ? 'Zerodha' : 'Upstox';
  const loginPath = activeBroker === 'kite' ? 'kite/login' : 'login';
  const [authenticating, setAuthenticating] = useState(false);

  const authenticate = useCallback(() => {
    const url = `${API_BASE}/auth/${loginPath}`;
    const popup = window.open(url, 'broker-auth', 'width=480,height=720,menubar=no,toolbar=no');
    if (!popup) { window.location.href = url; return; }   // popup blocked → full redirect
    setAuthenticating(true);

    let settled = false;
    const finish = async () => {
      if (settled) return; settled = true;
      window.removeEventListener('message', onMsg);
      clearInterval(poll); clearTimeout(timeout);
      try { popup.close(); } catch { /* cross-origin */ }
      await initBroker();                                  // re-read /api/broker/status
      const ok = useBrokerStore.getState().auth[activeBroker].authenticated;
      pushToast(ok ? `${brokerLabel} connected ✓` : `${brokerLabel} not connected — try again`);
      setAuthenticating(false);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === 'broker-auth') finish(); // from _oauth_done() postMessage
    };
    window.addEventListener('message', onMsg);
    const poll = setInterval(() => { if (popup.closed) finish(); }, 600); // popup closed manually
    const timeout = setTimeout(() => {                       // 3-min safety valve
      window.removeEventListener('message', onMsg);
      clearInterval(poll); setAuthenticating(false);
    }, 180_000);
  }, [loginPath, activeBroker, brokerLabel, initBroker, pushToast]);

  // ── Equity / cash mode ─────────────────────────────────────────────────
  const isEquity = trade.kind === 'stock';

  const { symbol } = trade;
  const liveLast = useQuote(symbol).last;
  const spot = liveLast && liveLast > 0 ? liveLast : (trade.spot || 0);
  const atm = spot > 0 ? atmStrike(symbol, spot) : 0;

  const exps = useMemo(() => expiries(6), [trade.open]); // eslint-disable-line react-hooks/exhaustive-deps
  const strikeList = useMemo(() => (spot > 0 ? strikes(symbol, spot) : []), [symbol, atm]); // eslint-disable-line react-hooks/exhaustive-deps

  const [side, setSide] = useState<'buy' | 'sell'>(trade.side);
  const [expIdx, setExpIdx] = useState(0);
  const [strike, setStrike] = useState(0);
  const [type, setType] = useState<'CE' | 'PE'>('CE');
  const [lots, setLots] = useState(1);
  const [orderType, setOrderType] = useState<'Market' | 'Limit'>('Market');
  const [limit, setLimit] = useState(0);
  const [product, setProduct] = useState<'D' | 'I'>('D');

  // PAPER / LIVE mode toggle.
  // Kite: defaults to LIVE when authenticated. Upstox/paper: defaults to PAPER.
  const [orderMode, setOrderMode] = useState<'paper' | 'live'>('paper');

  // Market protection (Kite only): send a LIMIT at LTP ±2% instead of a raw MARKET
  // to avoid NSE rejections on options during volatile sessions. Default ON for Kite.
  const [mktProtect, setMktProtect] = useState(true);

  // Equity-mode state
  const [eqShares, setEqShares] = useState(1);
  const [eqExchange, setEqExchange] = useState<'NSE' | 'BSE'>('NSE');

  // Option chain (for live mode)
  const [chain, setChain] = useState<ChainMap>(new Map());
  const [chainLoading, setChainLoading] = useState(false);

  // Order placement state
  const [placing, setPlacing] = useState(false);

  // Track previous activeBroker so we only auto-switch live when broker changes
  const prevBrokerRef = useRef(activeBroker);

  // Reset on open
  useEffect(() => {
    if (!trade.open) return;
    setSide(trade.side);
    setExpIdx(0);
    setStrike(0);
    setType('CE');
    setLots(1);
    setEqShares(1);
    setEqExchange((trade.exchange as 'NSE' | 'BSE' | undefined) === 'BSE' ? 'BSE' : 'NSE');
    setOrderType('Market');
    setMktProtect(true);
    // Auto-live if already authenticated when ticket opens
    const authed = useBrokerStore.getState().auth[activeBroker]?.authenticated;
    setOrderMode(authed ? 'live' : 'paper');
    setChain(new Map());
  }, [trade.open, trade.side, symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch to live when the user picks a broker that is already authenticated
  useEffect(() => {
    if (prevBrokerRef.current === activeBroker) return;
    prevBrokerRef.current = activeBroker;
    if (brokerAuth[activeBroker]?.authenticated) setOrderMode('live');
    else setOrderMode('paper');
  }, [activeBroker, brokerAuth]);

  // When authentication completes for the active broker, flip to live automatically
  useEffect(() => {
    if (activeAuthed && orderMode === 'paper') setOrderMode('live');
  }, [activeAuthed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch option chain when switching to live mode or changing expiry
  const fetchChain = useCallback(async () => {
    if (!isLive || !trade.open) return;
    const exp = exps[expIdx];
    if (!exp) return;
    setChainLoading(true);
    try {
      const res = await fetchOptionChain(symbol, fmtDate(exp.date));
      setChain(buildChainMap(res.chains));
    } catch {
      setChain(new Map());
    } finally {
      setChainLoading(false);
    }
  }, [isLive, trade.open, expIdx, symbol, exps]);

  useEffect(() => {
    if (orderMode === 'live') fetchChain();
  }, [orderMode, expIdx, fetchChain]);

  if (!trade.open) return null;

  const exp = exps[expIdx];
  const effStrike = strike || atm;

  // LTP: prefer real chain data in live mode
  const chainCell = chain.get(effStrike)?.[type] ?? null;
  const chainLtp = chainCell?.ltp ?? 0;
  const bsLtp = spot > 0 ? optionPremium(spot, effStrike, type, exp?.days ?? 7) : 0;
  const premium = orderMode === 'live' && chainLtp > 0 ? chainLtp : bsLtp;

  const ls = lotSize(symbol);
  const qty = lots * ls;
  const price = orderType === 'Limit' && limit > 0 ? limit : premium;
  const contract = exp && effStrike ? optionSymbol(symbol, exp, effStrike, type) : `${symbol} …`;
  const cost = qty * price;
  const valid = spot > 0 && effStrike > 0 && price > 0;

  // ── Live-readiness ─────────────────────────────────────────────────
  // Equity: just need a symbol. Option/Upstox: need the chain key. Option/Kite: need expiry+strike.
  const instrumentKey = chainCell?.key ?? null;
  const liveReady =
    orderMode === 'live' &&
    !chainLoading &&
    (isEquity
      ? true                                         // equity: always ready
      : isKite
        ? !!exp && effStrike > 0                     // kite option: need expiry+strike
        : instrumentKey != null);                    // upstox option: need chain key

  // Market-protection: effective order type and price sent to Kite
  const useProtection = isKite && orderType === 'Market' && mktProtect;
  const protPrice = useProtection ? protectedPrice(price, side) : 0;
  const effectiveOrderType = useProtection ? 'LIMIT' : orderType.toUpperCase() as 'MARKET' | 'LIMIT';
  const effectivePrice = orderType === 'Limit' ? price : useProtection ? protPrice : 0;

  // ── Place order ─────────────────────────────────────────────────────
  const place = async () => {
    if (placing) return;

    // ── Equity live order (Kite or Upstox) ──────────────────────────
    if (isEquity && orderMode === 'live') {
      if (!spot) { pushToast('Price not available yet — try again'); return; }
      setPlacing(true);
      const eqPrice = orderType === 'Limit' ? price : useProtection ? protectedPrice(spot, side) : 0;
      const eqOrderType = (orderType === 'Limit') ? 'LIMIT' : useProtection ? 'LIMIT' : 'MARKET';
      try {
        const result = await brokerPlaceOrder(
          isKite
            ? {
                qty: eqShares,
                transaction_type: side.toUpperCase() as 'BUY' | 'SELL',
                order_type: eqOrderType,
                price: eqPrice,
                product,
                segment: 'equity',
                tradingsymbol: symbol,
                exchange: eqExchange,
              }
            : {
                // Upstox equity: use instrument_key from SymbolInfo
                instrument_key: trade.instrumentKey ?? symbol,
                qty: eqShares,
                transaction_type: side.toUpperCase() as 'BUY' | 'SELL',
                order_type: orderType.toUpperCase() as 'MARKET' | 'LIMIT',
                price: orderType === 'Limit' ? price : 0,
                product,
                segment: 'equity',
              },
        );
        const label = brokerSandbox ? '[SANDBOX] ' : '';
        pushToast(
          `${label}${side === 'buy' ? 'Bought' : 'Sold'} ${eqShares} share${eqShares !== 1 ? 's' : ''} of ${symbol} @ ₹${spot.toFixed(2)}${result.order_id ? ` · Order ${result.order_id}` : ''}`
        );
        addPriceLines({
          positionId: result.order_id ?? `live_${Date.now()}`,
          symbol, underlying: symbol, side,
          qty: eqShares, lots: eqShares, price: spot, entryPrice: spot,
          instrumentKey: trade.instrumentKey,
        });
        close();
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Unknown error';
        pushToast(`Order failed: ${raw}`);
      } finally {
        setPlacing(false);
      }
      return;
    }

    // ── Equity paper trade ───────────────────────────────────────────
    if (isEquity) {
      const posId = addPosition({
        symbol, underlying: symbol, strike: 0, optType: 'CE',
        side, lots: eqShares, qty: eqShares, price: spot,
      });
      pushToast(`${side === 'buy' ? 'Bought' : 'Sold'} ${eqShares} share${eqShares !== 1 ? 's' : ''} of ${symbol} @ ₹${spot.toFixed(2)}`);
      addPriceLines({ positionId: posId, symbol, underlying: symbol, side, qty: eqShares, lots: eqShares, price: spot, entryPrice: spot });
      close();
      return;
    }

    // ── Options order ────────────────────────────────────────────────
    if (!valid || placing) return;

    if (orderMode === 'live') {
      if (!liveReady) {
        pushToast(isKite ? 'Pick an expiry/strike first' : 'Option chain not loaded yet — try again');
        return;
      }
      setPlacing(true);
      try {
        const result = await brokerPlaceOrder(
          isKite
            ? {
                qty,
                transaction_type: side.toUpperCase() as 'BUY' | 'SELL',
                order_type: effectiveOrderType,
                price: effectivePrice,
                product,
                segment: 'option',
                underlying: symbol,
                expiry: exp ? fmtDate(exp.date) : undefined,
                strike: effStrike,
                option_type: type,
              }
            : {
                instrument_key: instrumentKey!,
                qty,
                transaction_type: side.toUpperCase() as 'BUY' | 'SELL',
                order_type: orderType === 'Limit' ? 'LIMIT' : 'MARKET',
                price: orderType === 'Limit' ? price : 0,
                product,
              },
        );
        const posId = result.order_id ?? `live_${Date.now()}`;
        const label = brokerSandbox ? '[SANDBOX] ' : '';
        pushToast(
          `${label}${side === 'buy' ? 'Bought' : 'Sold'} ${lots} lot${lots > 1 ? 's' : ''} ${contract} @ ₹${price.toFixed(2)}${result.order_id ? ` · Order ${result.order_id}` : ''}`
        );
        addPriceLines({
          positionId: posId,
          symbol: contract,
          underlying: symbol,
          side,
          qty,
          lots,
          price,
          entryPrice: price,
          instrumentKey: instrumentKey ?? undefined,
        });
        close();
      } catch (e) {
        const raw = e instanceof Error ? e.message : 'Unknown error';
        // Surface specific Upstox reasons so the user knows exactly what went wrong.
        const hint = /margin|fund|insufficient/i.test(raw)
          ? ' — insufficient margin'
          : /market.*close|after.*hour|pre.*open/i.test(raw)
            ? ' — market is closed'
            : /invalid.*instrument|instrument.*not/i.test(raw)
              ? ' — invalid instrument'
              : '';
        pushToast(`Order failed: ${raw}${hint}`);
      } finally {
        setPlacing(false);
      }
    } else {
      // Paper trade
      const posId = addPosition({
        symbol: contract,
        underlying: symbol,
        strike: effStrike,
        optType: type,
        expiryDate: exp ? exp.date.getTime() : undefined,
        side, lots, qty, price,
      });
      pushToast(`${side === 'buy' ? 'Bought' : 'Sold'} ${lots} lot${lots > 1 ? 's' : ''} ${contract} @ ₹${price.toFixed(2)}`);
      // Mark entry + auto-set default SL/TP on chart
      addPriceLines({
        positionId: posId,
        symbol: contract,
        underlying: symbol,
        side,
        qty,
        lots,
        price,
        entryPrice: price,
      });
      close();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  const headerBadge = isLive ? (
    <span className={`ot-mode-badge ${brokerSandbox ? 'sandbox' : 'live'}`}>
      {brokerSandbox ? 'SANDBOX' : '● LIVE'}
    </span>
  ) : null;

  const accountSelector = showAccountSelector ? (
    <>
      <div className="ot-order-mode ot-account-toggle">
        <button className={`ot-mode-btn ${activeBroker === 'upstox' ? 'on' : ''}`} onClick={() => setActiveBroker('upstox')}>Upstox</button>
        <button className={`ot-mode-btn ${activeBroker === 'kite' ? 'on' : ''}`} onClick={() => setActiveBroker('kite')}>Zerodha (Kite)</button>
      </div>
      {!activeAuthed && (
        <button type="button" className="ot-account-connect" onClick={authenticate} disabled={authenticating}>
          {authenticating ? `Waiting for ${brokerLabel} login…` : `Authenticate ${brokerLabel} to place live orders`}
        </button>
      )}
    </>
  ) : null;

  const paperLiveToggle = isLive ? (
    <div className="ot-order-mode">
      <button className={`ot-mode-btn ${orderMode === 'paper' ? 'on' : ''}`} onClick={() => setOrderMode('paper')}>Paper</button>
      <button className={`ot-mode-btn live ${orderMode === 'live' ? 'on' : ''}`} onClick={() => setOrderMode('live')}>
        {brokerSandbox ? 'Sandbox' : 'Live Order'}
      </button>
    </div>
  ) : null;

  const productToggle = orderMode === 'live' ? (
    <div className="ot-field">
      <span>Product</span>
      <div className="ot-toggle">
        <button className={product === 'D' ? 'on' : ''} onClick={() => setProduct('D')}>{isEquity ? 'CNC' : 'NRML'}</button>
        <button className={product === 'I' ? 'on' : ''} onClick={() => setProduct('I')}>MIS</button>
      </div>
    </div>
  ) : null;

  const orderTypeField = (refPrice: number) => (
    <>
      <div className="ot-field">
        <span>Order type</span>
        <div className="ot-toggle">
          <button className={orderType === 'Market' ? 'on' : ''} onClick={() => setOrderType('Market')}>Market</button>
          <button className={orderType === 'Limit' ? 'on' : ''} onClick={() => { setOrderType('Limit'); setLimit(refPrice); }}>Limit</button>
        </div>
      </div>
      {/* Market Protection toggle — Kite + Market only */}
      {isKite && orderMode === 'live' && orderType === 'Market' && (
        <div className="ot-field ot-protect-row">
          <span className="ot-protect-label">
            Market protection
            <span className="ot-protect-hint"> (limit @ {side === 'buy' ? '+' : '-'}2%)</span>
          </span>
          <button
            className={`ot-protect-toggle ${mktProtect ? 'on' : ''}`}
            onClick={() => setMktProtect((v) => !v)}
          >
            {mktProtect ? 'ON' : 'OFF'}
          </button>
        </div>
      )}
      {orderType === 'Limit' && (
        <label className="ot-field">
          <span>Limit price (₹)</span>
          <input type="number" step="0.05" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
        </label>
      )}
      {/* Show protected price preview */}
      {useProtection && (
        <div className="ot-protect-price">
          Sends LIMIT @ ₹{protPrice.toFixed(2)} (fills immediately within 2% of LTP)
        </div>
      )}
    </>
  );

  const footerNote = orderMode === 'live'
    ? brokerSandbox
      ? 'Sandbox order — simulated execution, no real funds used.'
      : `● Live order via ${activeBroker === 'kite' ? 'Zerodha Kite' : 'Upstox'}.`
    : 'Paper order (demo) — no real funds are used.';

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className={`opt-ticket ${side}`} onMouseDown={(e) => e.stopPropagation()}>

        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="ot-head">
          <span className="ot-title">{isEquity ? 'Equity' : 'Options'} · {symbol}</span>
          {headerBadge}
          <button className="icon-btn" onClick={close}><Icon name="close" size={18} /></button>
        </div>

        {accountSelector}
        {paperLiveToggle}

        {/* ── BUY / SELL ─────────────────────────────────────────── */}
        <div className="ot-side">
          <button className={`ot-sidebtn buy ${side === 'buy' ? 'on' : ''}`} onClick={() => setSide('buy')}>BUY</button>
          <button className={`ot-sidebtn sell ${side === 'sell' ? 'on' : ''}`} onClick={() => setSide('sell')}>SELL</button>
        </div>

        {/* ═══ EQUITY BODY ═══════════════════════════════════════ */}
        {isEquity ? (
          <div className="ot-body">
            <div className="ot-field">
              <span>Exchange</span>
              <div className="ot-toggle">
                <button className={eqExchange === 'NSE' ? 'on' : ''} onClick={() => setEqExchange('NSE')}>NSE</button>
                <button className={eqExchange === 'BSE' ? 'on' : ''} onClick={() => setEqExchange('BSE')}>BSE</button>
              </div>
            </div>

            <label className="ot-field">
              <span>Shares</span>
              <input type="number" min={1} value={eqShares} onChange={(e) => setEqShares(Math.max(1, Number(e.target.value)))} />
            </label>

            {orderTypeField(spot)}
            {productToggle}

            <div className="ot-summary">
              <div><span>Symbol</span><b>{symbol} · {eqExchange}</b></div>
              <div><span>LTP</span><b>₹{spot > 0 ? spot.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</b></div>
              <div><span>Shares</span><b>{eqShares}</b></div>
              <div><span>Order value</span><b>₹{spot > 0 ? (eqShares * spot).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</b></div>
            </div>
          </div>
        ) : (

        /* ═══ OPTIONS BODY ════════════════════════════════════════ */
          <div className="ot-body">
            <label className="ot-field">
              <span>Expiry</span>
              <select value={expIdx} onChange={(e) => setExpIdx(Number(e.target.value))}>
                {exps.map((x, i) => <option key={i} value={i}>{x.label} ({x.days}d)</option>)}
              </select>
            </label>

            <label className="ot-field">
              <span>Strike</span>
              <select value={effStrike} onChange={(e) => setStrike(Number(e.target.value))}>
                {strikeList.map((k) => (
                  <option key={k} value={k}>
                    {k}{k === atm ? '  (ATM)' : ''}
                    {orderMode === 'live' && chain.get(k)?.[type]
                      ? `  ₹${chain.get(k)![type]!.ltp.toFixed(1)}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="ot-field">
              <span>Type</span>
              <div className="ot-toggle">
                <button className={type === 'CE' ? 'on' : ''} onClick={() => setType('CE')}>CE (Call)</button>
                <button className={type === 'PE' ? 'on' : ''} onClick={() => setType('PE')}>PE (Put)</button>
              </div>
            </div>

            <label className="ot-field">
              <span>Quantity (lots)</span>
              <input type="number" min={1} value={lots} onChange={(e) => setLots(Math.max(1, Number(e.target.value)))} />
            </label>

            {orderTypeField(premium)}
            {productToggle}

            <div className="ot-summary">
              <div><span>Contract</span><b>{contract}</b></div>
              <div>
                <span>LTP {orderMode === 'live' ? (chainLoading ? '(loading…)' : chainCell ? '(live)' : '(BS est.)') : '(estimate)'}</span>
                <b>₹{premium.toFixed(2)}</b>
              </div>
              <div><span>Qty</span><b>{lots} × {ls} = {qty}</b></div>
              <div><span>Order value</span><b>₹{cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></div>
              {orderMode === 'live' && chainCell && (
                <>
                  <div><span>Bid / Ask</span><b>₹{chainCell.bid.toFixed(2)} / ₹{chainCell.ask.toFixed(2)}</b></div>
                  <div><span>OI</span><b>{(chainCell.oi / 1000).toFixed(1)}K</b></div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Place button ────────────────────────────────────────── */}
        <button
          className={`ot-place ${side} ${orderMode === 'live' ? 'ot-place-live' : ''}`}
          onClick={place}
          disabled={placing || (!isEquity && (!valid || (orderMode === 'live' && !liveReady && !chainLoading)))}
        >
          {placing
            ? 'Placing order…'
            : chainLoading && orderMode === 'live' && !isEquity
              ? 'Loading chain…'
              : isEquity
                ? `${side === 'buy' ? 'BUY' : 'SELL'} ${eqShares} share${eqShares !== 1 ? 's' : ''} · ₹${spot > 0 ? (eqShares * spot).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}`
                : valid
                  ? `${side === 'buy' ? 'BUY' : 'SELL'} ${lots} lot${lots > 1 ? 's' : ''} · ₹${cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                  : 'Loading price…'}
        </button>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <div className="ot-note">{footerNote}</div>
      </div>
    </div>
  );
}
