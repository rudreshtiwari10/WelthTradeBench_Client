import { useMemo, useState, useEffect } from 'react';
import { Icon } from '../icons/Icon';
import { useUiStore } from '../state/uiStore';
import { usePositionsStore } from '../state/positionsStore';
import { useToastStore } from '../state/toastStore';
import { useQuote } from '../data/useQuote';
import { atmStrike, expiries, lotSize, optionPremium, optionSymbol, strikes } from '../data/options';
import './OptionsTicket.css';

export function OptionsTicket() {
  const trade = useUiStore((s) => s.trade);
  const close = useUiStore((s) => s.closeTrade);
  const addPosition = usePositionsStore((s) => s.add);
  const pushToast = useToastStore((s) => s.push);

  const { symbol } = trade;
  // Use a live quote so the ticket has a valid spot even if the button was
  // clicked before the price loaded.
  const liveLast = useQuote(symbol).last;
  const spot = liveLast && liveLast > 0 ? liveLast : (trade.spot || 0);
  const atm = spot > 0 ? atmStrike(symbol, spot) : 0;

  const exps = useMemo(() => expiries(6), [trade.open]);
  const strikeList = useMemo(() => (spot > 0 ? strikes(symbol, spot) : []), [symbol, atm]); // eslint-disable-line react-hooks/exhaustive-deps

  const [side, setSide] = useState<'buy' | 'sell'>(trade.side);
  const [expIdx, setExpIdx] = useState(0);
  const [strike, setStrike] = useState(0); // 0 = follow ATM until user picks
  const [type, setType] = useState<'CE' | 'PE'>('CE');
  const [lots, setLots] = useState(1);
  const [orderType, setOrderType] = useState<'Market' | 'Limit'>('Market');
  const [limit, setLimit] = useState(0);

  // Reset when opened.
  useEffect(() => {
    if (!trade.open) return;
    setSide(trade.side);
    setExpIdx(0);
    setStrike(0);
    setType('CE');
    setLots(1);
    setOrderType('Market');
  }, [trade.open, trade.side, symbol]);

  if (!trade.open) return null;

  const exp = exps[expIdx];
  const effStrike = strike || atm;             // fall back to ATM if not picked
  const premium = spot > 0 ? optionPremium(spot, effStrike, type, exp?.days ?? 7) : 0;
  const ls = lotSize(symbol);
  const qty = lots * ls;
  const price = orderType === 'Limit' && limit > 0 ? limit : premium;
  const contract = exp && effStrike ? optionSymbol(symbol, exp, effStrike, type) : `${symbol} …`;
  const cost = qty * price;
  const valid = spot > 0 && effStrike > 0 && price > 0;

  const place = () => {
    if (!valid) return;
    addPosition({ symbol: contract, side, lots, qty, price });
    pushToast(`${side === 'buy' ? 'Bought' : 'Sold'} ${lots} lot${lots > 1 ? 's' : ''} ${contract} @ ₹${price.toFixed(2)}`);
    close();
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className={`opt-ticket ${side}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="ot-head">
          <span className="ot-title">Options · {symbol}</span>
          <button className="icon-btn" onClick={close}><Icon name="close" size={18} /></button>
        </div>

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
              {strikeList.map((k) => <option key={k} value={k}>{k}{k === atm ? '  (ATM)' : ''}</option>)}
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

          <div className="ot-summary">
            <div><span>Contract</span><b>{contract}</b></div>
            <div><span>LTP (premium)</span><b>₹{premium.toFixed(2)}</b></div>
            <div><span>Qty</span><b>{lots} × {ls} = {qty}</b></div>
            <div><span>Order value</span><b>₹{cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b></div>
          </div>
        </div>

        <button className={`ot-place ${side}`} onClick={place} disabled={!valid}>
          {valid
            ? `${side === 'buy' ? 'BUY' : 'SELL'} ${lots} lot${lots > 1 ? 's' : ''} · ₹${cost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
            : 'Loading price…'}
        </button>
        <div className="ot-note">Paper order (demo) — no real funds are used.</div>
      </div>
    </div>
  );
}
