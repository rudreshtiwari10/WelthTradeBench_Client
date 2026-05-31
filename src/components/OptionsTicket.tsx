import { useMemo, useState, useEffect, useCallback } from 'react';
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
  const addPriceLines = usePriceLinesStore((s) => s.addEntryWithSlTp);

  const isLive = brokerSource === 'upstox';

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

  // PAPER / LIVE mode toggle (default: PAPER for safety)
  const [orderMode, setOrderMode] = useState<'paper' | 'live'>('paper');

  // Option chain (for live mode)
  const [chain, setChain] = useState<ChainMap>(new Map());
  const [chainLoading, setChainLoading] = useState(false);

  // Order placement state
  const [placing, setPlacing] = useState(false);

  // Reset on open
  useEffect(() => {
    if (!trade.open) return;
    setSide(trade.side);
    setExpIdx(0);
    setStrike(0);
    setType('CE');
    setLots(1);
    setOrderType('Market');
    setOrderMode('paper');
    setChain(new Map());
  }, [trade.open, trade.side, symbol]);

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

  // Instrument key for live order
  const instrumentKey = chainCell?.key ?? null;
  const liveReady = orderMode === 'live' && instrumentKey != null && !chainLoading;

  // ── Place order ─────────────────────────────────────────────────────
  const place = async () => {
    if (!valid || placing) return;

    if (orderMode === 'live') {
      if (!liveReady) { pushToast('Option chain not loaded yet — try again'); return; }
      setPlacing(true);
      try {
        const result = await brokerPlaceOrder({
          instrument_key: instrumentKey!,
          qty,
          transaction_type: side.toUpperCase() as 'BUY' | 'SELL',
          order_type: orderType === 'Limit' ? 'LIMIT' : 'MARKET',
          price: orderType === 'Limit' ? price : 0,
          product,
        });
        const posId = result.order_id ?? `live_${Date.now()}`;
        const label = brokerSandbox ? '[SANDBOX] ' : '';
        pushToast(
          `${label}${side === 'buy' ? 'Bought' : 'Sold'} ${lots} lot${lots > 1 ? 's' : ''} ${contract} @ ₹${price.toFixed(2)}${result.order_id ? ` · Order ${result.order_id}` : ''}`
        );
        // Mark entry + auto-set default SL/TP on chart
        addPriceLines({
          positionId: posId,
          symbol: contract,
          underlying: symbol,
          side,
          qty,
          price,
          entryPrice: price,
          instrumentKey: instrumentKey ?? undefined,
        });
        close();
      } catch (e) {
        pushToast(`Order failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
        price,
        entryPrice: price,
      });
      close();
    }
  };

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className={`opt-ticket ${side}`} onMouseDown={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="ot-head">
          <span className="ot-title">Options · {symbol}</span>
          {isLive && (
            <span className={`ot-mode-badge ${brokerSandbox ? 'sandbox' : 'live'}`}>
              {brokerSandbox ? '⬡ SANDBOX' : '● LIVE'}
            </span>
          )}
          <button className="icon-btn" onClick={close}><Icon name="close" size={18} /></button>
        </div>

        {/* Paper / Live toggle (only when broker is live) */}
        {isLive && (
          <div className="ot-order-mode">
            <button
              className={`ot-mode-btn ${orderMode === 'paper' ? 'on' : ''}`}
              onClick={() => setOrderMode('paper')}
            >
              Paper
            </button>
            <button
              className={`ot-mode-btn live ${orderMode === 'live' ? 'on' : ''}`}
              onClick={() => setOrderMode('live')}
            >
              {brokerSandbox ? 'Sandbox' : 'Live Order'}
            </button>
          </div>
        )}

        {/* BUY / SELL */}
        <div className="ot-side">
          <button className={`ot-sidebtn buy ${side === 'buy' ? 'on' : ''}`} onClick={() => setSide('buy')}>BUY</button>
          <button className={`ot-sidebtn sell ${side === 'sell' ? 'on' : ''}`} onClick={() => setSide('sell')}>SELL</button>
        </div>

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

          <div className="ot-field">
            <span>Order type</span>
            <div className="ot-toggle">
              <button className={orderType === 'Market' ? 'on' : ''} onClick={() => setOrderType('Market')}>Market</button>
              <button className={orderType === 'Limit' ? 'on' : ''} onClick={() => { setOrderType('Limit'); setLimit(premium); }}>Limit</button>
            </div>
          </div>

          {orderType === 'Limit' && (
            <label className="ot-field">
              <span>Limit price (₹)</span>
              <input type="number" step="0.05" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
            </label>
          )}

          {/* Product type — only relevant for live orders */}
          {orderMode === 'live' && (
            <div className="ot-field">
              <span>Product</span>
              <div className="ot-toggle">
                <button className={product === 'D' ? 'on' : ''} onClick={() => setProduct('D')}>NRML</button>
                <button className={product === 'I' ? 'on' : ''} onClick={() => setProduct('I')}>MIS</button>
              </div>
            </div>
          )}

          {/* Summary */}
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

        {/* Place button */}
        <button
          className={`ot-place ${side} ${orderMode === 'live' ? 'ot-place-live' : ''}`}
          onClick={place}
          disabled={!valid || placing || (orderMode === 'live' && !liveReady && !chainLoading)}
        >
          {placing
            ? 'Placing order…'
            : chainLoading && orderMode === 'live'
              ? 'Loading chain…'
              : valid
                ? `${side === 'buy' ? 'BUY' : 'SELL'} ${lots} lot${lots > 1 ? 's' : ''} · ₹${cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                : 'Loading price…'}
        </button>

        {/* Footer note */}
        <div className="ot-note">
          {orderMode === 'live'
            ? brokerSandbox
              ? '⬡ Sandbox order — simulated execution, no real funds used.'
              : '● Live order — will be sent to Upstox exchange.'
            : 'Paper order (demo) — no real funds are used.'}
        </div>
      </div>
    </div>
  );
}
