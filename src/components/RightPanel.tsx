import { useState } from 'react';
import { Icon } from '../icons/Icon';
import { useChartStore } from '../state/chartStore';
import { useQuote } from '../data/useQuote';
import './RightPanel.css';

interface WItem { sym: string; name: string; ticker: string; exchange: string; mark: string; }

const INDICES: WItem[] = [
  { sym: 'SF', name: 'SENSEX',    ticker: 'SENSEX',    exchange: 'BSE', mark: '#e53935' },
  { sym: 'NI', name: 'NIFTY',     ticker: 'NIFTY',     exchange: 'NSE', mark: '#1e88e5' },
  { sym: 'BN', name: 'BANKNIFTY', ticker: 'BANKNIFTY', exchange: 'NSE', mark: '#43a047' },
  { sym: 'FN', name: 'FINNIFTY',  ticker: 'FINNIFTY',  exchange: 'NSE', mark: '#8e24aa' },
  { sym: 'MD', name: 'MIDCPNIFTY',ticker: 'MIDCPNIFTY',exchange: 'NSE', mark: '#fb8c00' },
];
const STOCKS: WItem[] = [
  { sym: 'R',  name: 'RELIANCE',  ticker: 'RELIANCE',  exchange: 'NSE', mark: '#fb8c00' },
  { sym: 'T',  name: 'TCS',       ticker: 'TCS',       exchange: 'NSE', mark: '#3949ab' },
  { sym: 'A',  name: 'APOLLO',    ticker: 'APOLLOHOSP',exchange: 'NSE', mark: '#00897b' },
  { sym: 'TI', name: 'TITAN',     ticker: 'TITAN',     exchange: 'NSE', mark: '#6d4c41' },
  { sym: 'HB', name: 'HDFCBANK',  ticker: 'HDFCBANK',  exchange: 'NSE', mark: '#1565c0' },
  { sym: 'IC', name: 'ICICIBANK', ticker: 'ICICIBANK', exchange: 'NSE', mark: '#ef6c00' },
  { sym: 'IN', name: 'INFY',      ticker: 'INFY',      exchange: 'NSE', mark: '#2e7d32' },
  { sym: 'SB', name: 'SBIN',      ticker: 'SBIN',      exchange: 'NSE', mark: '#b71c1c' },
];

const fmt  = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const sign = (n: number)        => `${n >= 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

// Icons shown in the collapsed rail (matches tab order)
const RAIL_ICONS = [
  { icon: 'star'    as const, title: 'Watchlist'  },
  { icon: 'alert'   as const, title: 'Alerts'     },
  { icon: 'pattern' as const, title: 'Hotlists'   },
  { icon: 'layout'  as const, title: 'Calendar'   },
  { icon: 'note'    as const, title: 'News'        },
];

export function RightPanel() {
  const symbol = useChartStore((s) => s.symbol);
  const det    = useQuote(symbol.symbol, true);

  const [collapsed, setCollapsed] = useState(false);

  // ── Collapsed: show a narrow icon rail ───────────────────────────────
  if (collapsed) {
    return (
      <aside className="rightpanel rightpanel--collapsed">
        {/* Expand button at the top */}
        <button
          className="rp-expand-btn"
          title="Expand watchlist panel"
          onClick={() => setCollapsed(false)}
        >
          <Icon name="chevronLeft" size={16} />
        </button>

        {/* Vertical icon rail */}
        <div className="rp-rail">
          {RAIL_ICONS.map(({ icon, title }) => (
            <button
              key={title}
              className="rp-rail-btn icon-btn"
              title={title}
              onClick={() => setCollapsed(false)}
            >
              <Icon name={icon} size={18} />
            </button>
          ))}
        </div>
      </aside>
    );
  }

  // ── Expanded panel ────────────────────────────────────────────────────
  return (
    <aside className="rightpanel">
      <div className="rp-tabs">
        <button className="rp-tab active" title="Watchlist"><Icon name="star"    size={18} /></button>
        <button className="rp-tab"        title="Alerts">   <Icon name="alert"   size={18} /></button>
        <button className="rp-tab"        title="Hotlists"> <Icon name="pattern" size={18} /></button>
        <button className="rp-tab"        title="Calendar"> <Icon name="layout"  size={18} /></button>
        <button className="rp-tab"        title="News">     <Icon name="note"    size={18} /></button>

        {/* Collapse button — right-aligned */}
        <div style={{ flex: 1 }} />
        <button
          className="rp-tab"
          title="Collapse watchlist panel"
          onClick={() => setCollapsed(true)}
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <div className="rp-watchlist">
        <div className="wl-toolbar">
          <span className="wl-title">Watchlist</span>
          <div className="wl-actions">
            <button className="icon-btn sm" title="Add symbol"><Icon name="plus"  size={16} /></button>
            <button className="icon-btn sm" title="More">      <Icon name="dots"  size={16} /></button>
          </div>
        </div>
        <div className="wl-head">
          <span>Symbol</span><span>Last</span><span>Chg</span><span>Chg%</span>
        </div>
        <Section title="INDICES" rows={INDICES} />
        <Section title="STOCKS"  rows={STOCKS}  />
      </div>

      <div className="rp-details">
        <div className="det-head">
          <span className="det-mark" style={{ background: '#5e35b1' }}>
            {symbol.symbol.charAt(0)}
          </span>
          <div className="det-title">
            <div className="det-sym">{symbol.symbol}</div>
            <div className="det-name">{symbol.name} · {symbol.exchange}</div>
          </div>
        </div>

        <div className="det-quote">
          <span className="det-price">{fmt(det.last)}</span>
          <span className="det-unit">{symbol.kind === 'index' ? 'POINT' : 'INR'}</span>
        </div>
        <div className={`det-change ${det.dir}`}>
          {sign(det.chg)}&nbsp;&nbsp;
          {det.pct >= 0 ? '+' : '−'}{Math.abs(det.pct).toFixed(2)}%
        </div>
        <div className="det-status">Market open · live</div>
        <div className="det-update">
          Updated {new Date().toLocaleTimeString('en-GB')}
        </div>

        <div className="det-perf">
          <div className="perf-title">Performance</div>
          <div className="perf-grid">
            {(det.perf.length
              ? det.perf
              : ['1D','5D','1M','6M','YTD','1Y'].map((l) => ({ label: l, val: '—', dir: 'up' as const }))
            ).map((p) => (
              <div className="perf-cell" key={p.label}>
                <div className={`perf-val ${p.dir}`}>{p.val}</div>
                <div className="perf-label">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Section({ title, rows }: { title: string; rows: WItem[] }) {
  return (
    <div className="wl-section">
      <div className="wl-section-head">{title}</div>
      {rows.map((q) => <LiveRow key={q.sym + q.name} item={q} />)}
    </div>
  );
}

function LiveRow({ item }: { item: WItem }) {
  const q      = useQuote(item.ticker);
  const setSymbol = useChartStore((s) => s.setSymbol);
  return (
    <div
      className="wl-row"
      onClick={() => setSymbol({
        symbol:   item.ticker,
        name:     item.name,
        exchange: item.exchange,
        kind: (item.exchange === 'BSE' || item.ticker.includes('NIFTY') || item.ticker === 'SENSEX' || item.ticker === 'MIDCPNIFTY')
          ? 'index' : 'stock',
      })}
    >
      <span className="wl-sym">
        <span className="wl-mark" style={{ background: item.mark }}>{item.sym}</span>
        <span className="wl-name">{item.name}</span>
      </span>
      <span className="wl-last">{fmt(q.last)}</span>
      <span className={`wl-chg ${q.dir}`}>{sign(q.chg)}</span>
      <span className={`wl-pct ${q.dir}`}>
        {q.pct >= 0 ? '+' : '−'}{Math.abs(q.pct).toFixed(2)}%
      </span>
    </div>
  );
}
