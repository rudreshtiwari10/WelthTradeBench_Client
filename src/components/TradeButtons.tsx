import { useUiStore } from '../state/uiStore';
import { useQuote } from '../data/useQuote';
import './TradeButtons.css';

const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

interface TradeButtonsProps {
  symbol: string;
  kind?: string;
  instrumentKey?: string;
  exchange?: string;
}

/** Buy/Sell overlay on a chart panel. Opens the options or equity order ticket. */
export function TradeButtons({ symbol, kind, instrumentKey, exchange }: TradeButtonsProps) {
  const q = useQuote(symbol);
  const openTrade = useUiStore((s) => s.openTrade);
  const last = q.last ?? 0;
  const isEquity = kind === 'stock';

  return (
    <div className="trade-buttons" onMouseDown={(e) => e.stopPropagation()}>
      <button
        className="tb-btn sell"
        title={isEquity ? 'Sell stock' : 'Sell options'}
        onClick={() => openTrade(symbol, 'sell', last, kind, instrumentKey, exchange)}
      >
        <span className="tb-label">SELL</span>
        <span className="tb-price">{fmt(last)}</span>
      </button>
      <button
        className="tb-btn buy"
        title={isEquity ? 'Buy stock' : 'Buy options'}
        onClick={() => openTrade(symbol, 'buy', last, kind, instrumentKey, exchange)}
      >
        <span className="tb-label">BUY</span>
        <span className="tb-price">{fmt(last)}</span>
      </button>
    </div>
  );
}
