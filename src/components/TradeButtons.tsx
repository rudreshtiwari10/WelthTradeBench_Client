import { useUiStore } from '../state/uiStore';
import { useQuote } from '../data/useQuote';
import './TradeButtons.css';

const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Buy/Sell overlay on a chart panel. Opens the options order ticket. */
export function TradeButtons({ symbol }: { symbol: string }) {
  const q = useQuote(symbol);
  const openTrade = useUiStore((s) => s.openTrade);
  const last = q.last ?? 0;
  const bid = last ? last * 0.9995 : 0;
  const ask = last ? last * 1.0005 : 0;

  return (
    <div className="trade-buttons" onMouseDown={(e) => e.stopPropagation()}>
      <button className="tb-btn sell" title="Sell options" onClick={() => openTrade(symbol, 'sell', last)}>
        <span className="tb-label">SELL</span>
        <span className="tb-price">{fmt(bid)}</span>
      </button>
      <button className="tb-btn buy" title="Buy options" onClick={() => openTrade(symbol, 'buy', last)}>
        <span className="tb-label">BUY</span>
        <span className="tb-price">{fmt(ask)}</span>
      </button>
    </div>
  );
}
