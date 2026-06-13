import { useState } from 'react';
import { usePanelId } from '../state/PanelContext';
import { usePanelsStore } from '../state/panelsStore';
import { useChartStore } from '../state/chartStore';
import { SymbolSearch } from './SymbolSearch';
import { Dropdown } from './ui/Dropdown';
import { Icon } from '../icons/Icon';
import { INTERVAL_GROUPS, CHART_TYPES, chartTypeIcon } from '../chart/constants';
import type { SymbolInfo, Interval, ChartType } from '../data/types';
import './PanelHeader.css';

const INTERVAL_SHORT: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1H': '1h', '2H': '2h', '4H': '4h', '1D': '1D', '1W': '1W', '1M': '1M',
};

const DEFAULT_SYMBOL: SymbolInfo = {
  symbol: 'NIFTY', name: 'Nifty 50 Index', exchange: 'NSE', kind: 'index',
};

export function PanelHeader() {
  const panelId = usePanelId();
  const symbol = usePanelsStore((s) => s.panels.find((p) => p.id === panelId)?.symbol ?? DEFAULT_SYMBOL);
  const interval = usePanelsStore((s) => s.panels.find((p) => p.id === panelId)?.interval ?? '1D');
  const chartType = usePanelsStore((s) => s.panels.find((p) => p.id === panelId)?.chartType ?? 'candles');
  const updatePanel = usePanelsStore((s) => s.updatePanel);
  const [searchOpen, setSearchOpen] = useState(false);

  // Activate this panel (if not already) so TopToolbar stays in sync.
  const activate = () => {
    if (usePanelsStore.getState().activeId !== panelId) {
      usePanelsStore.getState().setActive(panelId);
    }
  };

  const handleInterval = (iv: Interval) => {
    activate();
    updatePanel(panelId, { interval: iv });
    useChartStore.getState().setInterval(iv);
  };

  const handleChartType = (ct: ChartType) => {
    activate();
    updatePanel(panelId, { chartType: ct });
    useChartStore.getState().setChartType(ct);
  };

  const handleSymbolSelect = (sym: SymbolInfo) => {
    activate();
    updatePanel(panelId, { symbol: sym });
    useChartStore.getState().setSymbol(sym);
    setSearchOpen(false);
  };

  return (
    <div className="panel-header" onMouseDown={(e) => e.stopPropagation()}>
      <button
        className="panel-symbol-btn"
        title="Change symbol"
        onClick={(e) => { e.stopPropagation(); setSearchOpen(true); }}
      >
        <span className="panel-symbol-mark">{symbol.symbol.charAt(0)}</span>
        <span className="panel-symbol-name">{symbol.symbol}</span>
      </button>
      <span className="panel-exchange">{symbol.exchange}</span>

      <div className="panel-sep" />

      <Dropdown
        trigger={({ toggle }) => (
          <button
            className="panel-pill"
            title="Interval"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            {INTERVAL_SHORT[interval] ?? interval}
          </button>
        )}
      >
        {(close) => (
          <>
            {INTERVAL_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="menu-group-title">{g.title}</div>
                {g.items.map((it) => (
                  <button
                    key={it.value}
                    className={`menu-item ${interval === it.value ? 'active' : ''}`}
                    onClick={() => { handleInterval(it.value as Interval); close(); }}
                  >
                    <span className="mi-label">{it.label}</span>
                    <span className="mi-tag">{INTERVAL_SHORT[it.value]}</span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </Dropdown>

      <Dropdown
        trigger={({ toggle }) => (
          <button
            className="panel-icon-btn"
            title="Chart type"
            onClick={(e) => { e.stopPropagation(); toggle(); }}
          >
            <Icon name={chartTypeIcon(chartType)} size={15} />
          </button>
        )}
      >
        {(close) => (
          <>
            {CHART_TYPES.map((c) => (
              <button
                key={c.value}
                className={`menu-item ${chartType === c.value ? 'active' : ''}`}
                onClick={() => { handleChartType(c.value as ChartType); close(); }}
              >
                <span className="mi-icon"><Icon name={c.icon} size={16} /></span>
                <span className="mi-label">{c.label}</span>
              </button>
            ))}
          </>
        )}
      </Dropdown>

      {searchOpen && (
        <SymbolSearch onClose={() => setSearchOpen(false)} onSelect={handleSymbolSelect} />
      )}
    </div>
  );
}
