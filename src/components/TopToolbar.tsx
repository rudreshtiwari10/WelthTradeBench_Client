import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icon';
import { Dropdown } from './ui/Dropdown';
import { SymbolSearch } from './SymbolSearch';
import { useChartStore } from '../state/chartStore';
import { CHART_TYPES, INTERVAL_GROUPS, chartTypeIcon } from '../chart/constants';
import { authStatus } from '../data/dataService';
import { useUiStore } from '../state/uiStore';
import { useReplayStore } from '../state/replayStore';
import { useAlertStore } from '../state/alertStore';
import { useToastStore } from '../state/toastStore';
import { useHistoryStore } from '../state/historyStore';
import { useLayoutStore } from '../state/layoutStore';
import { useChartBridge } from '../state/chartBridge';
import { usePanelsStore, type GridLayout } from '../state/panelsStore';
import { useAuthStore } from '../state/authStore';
import { AuthModal } from './AuthModal';
import { AdminPanel } from './AdminPanel';
import './TopToolbar.css';

const LAYOUTS: { id: GridLayout; icon: 'fullscreen' | 'splitV' | 'splitH' | 'grid'; label: string }[] = [
  { id: 'single', icon: 'fullscreen', label: 'Single chart' },
  { id: 'cols2', icon: 'splitV', label: 'Two columns (side by side)' },
  { id: 'rows2', icon: 'splitH', label: 'Two rows (stacked)' },
  { id: 'grid4', icon: 'grid', label: 'Four charts (2×2)' },
];

const INTERVAL_SHORT: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1H': '1h', '2H': '2h', '4H': '4h', '1D': '1D', '1W': '1W', '1M': '1M',
};

export function TopToolbar() {
  const { symbol, interval, chartType, setInterval, setChartType, backtestMode, toggleBacktestMode } = useChartStore();
  const { openIndicators, openSettings, theme, toggleTheme, setChartOnly, chainOpen, toggleChain } = useUiStore();
  const replay = useReplayStore();
  const addAlert = useAlertStore((s) => s.add);
  const pushToast = useToastStore((s) => s.push);
  const history = useHistoryStore();
  const layout = useLayoutStore();
  const gridLayout = usePanelsStore((s) => s.layout);
  const setGridLayout = usePanelsStore((s) => s.setLayout);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => pushToast('Fullscreen blocked by browser'));
  };

  const snapshot = async (action: 'save' | 'copy') => {
    const fn = useChartBridge.getState().takeSnapshot;
    if (!fn) return;
    const blob = await fn();
    if (!blob) { pushToast('Snapshot failed'); return; }
    if (action === 'save') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${symbol.symbol}_${interval}_${Date.now()}.png`; a.click();
      URL.revokeObjectURL(url);
      pushToast('Snapshot saved');
    } else {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        pushToast('Snapshot copied to clipboard');
      } catch { pushToast('Clipboard not available — use Save instead'); }
    }
  };

  const createAlert = () => {
    const v = window.prompt(`Create alert for ${symbol.symbol} when price crosses:`, '');
    const price = Number(v);
    if (v && Number.isFinite(price) && price > 0) {
      addAlert(symbol.symbol, price);
      pushToast(`Alert set for ${symbol.symbol} at ${price.toLocaleString('en-IN')}`);
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    }
  };

  const toggleReplay = () => {
    if (replay.active) replay.exit();
    else replay.start(useChartStore.getState().barCount || 300);
  };
  const searchOpen         = useUiStore((s) => s.searchOpen);
  const searchInitialQuery = useUiStore((s) => s.searchInitialQuery);
  const openSearch         = useUiStore((s) => s.openSearch);
  const closeSearch        = useUiStore((s) => s.closeSearch);
  const [compareOpen, setCompareOpen] = useState(false);
  const [mode, setMode] = useState<'upstox' | 'mock'>('mock');
  const [creds, setCreds] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const { user, logout } = useAuthStore();

  useEffect(() => {
    authStatus().then((s) => { setMode(s.mode); setCreds(s.credentialsPresent); });
  }, []);

  const mark = symbol.symbol.charAt(0);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="symbol-btn" title="Symbol Search (or press any letter key)" onClick={() => openSearch()}>
          <span className="symbol-mark">{mark}</span>
          <span className="symbol-name">{symbol.symbol}</span>
        </button>
        <button className="icon-btn add-symbol" title="Compare or add symbol" onClick={() => setCompareOpen(true)}><Icon name="plus" size={18} /></button>

        <div className="sep" />

        {/* Interval */}
        <Dropdown
          trigger={({ toggle }) => (
            <button className="pill-btn strong" title="Interval" onClick={toggle}>{INTERVAL_SHORT[interval]}</button>
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
                      onClick={() => { setInterval(it.value); close(); }}
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

        <div className="sep" />

        {/* Chart type */}
        <Dropdown
          trigger={({ toggle }) => (
            <button className="icon-btn" title="Chart type" onClick={toggle}><Icon name={chartTypeIcon(chartType)} size={20} /></button>
          )}
        >
          {(close) => (
            <>
              {CHART_TYPES.map((c) => (
                <button
                  key={c.value}
                  className={`menu-item ${chartType === c.value ? 'active' : ''}`}
                  onClick={() => { setChartType(c.value); close(); }}
                >
                  <span className="mi-icon"><Icon name={c.icon} size={18} /></span>
                  <span className="mi-label">{c.label}</span>
                </button>
              ))}
            </>
          )}
        </Dropdown>

        <div className="sep" />

        <button className="pill-btn" title="Indicators, metrics & strategies" onClick={openIndicators}>
          <Icon name="indicators" size={20} /><span>Indicators</span>
        </button>
        <button className="pill-btn" title="Create Alert" onClick={createAlert}><Icon name="alert" size={18} /><span>Alert</span></button>
        <button className={`pill-btn ${replay.active ? 'strong' : ''}`} title="Bar Replay" onClick={toggleReplay}><Icon name="replay" size={18} /><span>Replay</span></button>
        <button
          className={`pill-btn${backtestMode ? ' backtest-active' : ''}`}
          title="Backtest Mode — loads 2000 bars of history and disconnects the live feed"
          onClick={() => toggleBacktestMode()}
        >
          <span>Backtest</span>
        </button>

        <div className="sep" />

        <button className="icon-btn" title="Undo (Ctrl+Z)" disabled={!history.canUndo()} onClick={() => history.undo()}><Icon name="undo" size={18} /></button>
        <button className="icon-btn" title="Redo (Ctrl+Y)" disabled={!history.canRedo()} onClick={() => history.redo()}><Icon name="redo" size={18} /></button>
      </div>

      <div className="topbar-right">
        {/* Data source / Upstox login */}
        <a
          className={`data-pill ${mode}`}
          href={creds ? `${import.meta.env.VITE_API_URL || ''}/auth/login` : undefined}
          title={mode === 'upstox' ? 'Live Upstox data' : creds ? 'Connect Upstox (login)' : 'Mock data — add Upstox credentials in server/.env'}
        >
          <span className="data-dot" />
          {mode === 'upstox' ? 'Live' : creds ? 'Connect Upstox' : 'Mock data'}
        </a>

        <div className="sep" />

        <Dropdown align="right" trigger={({ toggle }) => (
          <button className="icon-btn" title="Take a snapshot" onClick={toggle}><Icon name="camera" size={18} /></button>
        )}>
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { snapshot('save'); close(); }}><span className="mi-icon"><Icon name="camera" size={16} /></span><span className="mi-label">Save chart image</span></button>
              <button className="menu-item" onClick={() => { snapshot('copy'); close(); }}><span className="mi-icon"><Icon name="compare" size={16} /></span><span className="mi-label">Copy chart image</span></button>
            </>
          )}
        </Dropdown>

        <input
          className="layout-name-input"
          value={layout.name}
          title="Layout name"
          onChange={(e) => layout.setName(e.target.value)}
          onBlur={() => layout.saveCurrent()}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />

        <Dropdown align="right" width={240} trigger={({ toggle }) => (
          <button className="icon-btn" title="Manage layouts" onClick={toggle}><Icon name="layout" size={18} /></button>
        )}>
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { layout.saveCurrent(); pushToast('Layout saved'); close(); }}><span className="mi-icon"><Icon name="layout" size={16} /></span><span className="mi-label">Save</span></button>
              <button className="menu-item" onClick={() => { const n = prompt('Save layout as:', layout.name + ' copy'); if (n) { layout.saveAs(n); pushToast('Layout saved'); } close(); }}><span className="mi-icon"><Icon name="plus" size={16} /></span><span className="mi-label">Save As…</span></button>
              <button className="menu-item" onClick={() => { layout.newLayout(); close(); }}><span className="mi-icon"><Icon name="plus" size={16} /></span><span className="mi-label">New blank layout</span></button>
              {layout.layouts.length > 0 && <div className="menu-sep" />}
              {layout.layouts.length > 0 && <div className="menu-group-title">SAVED LAYOUTS</div>}
              {layout.layouts.map((l) => (
                <div key={l.id} className={`menu-item ${l.id === layout.currentId ? 'active' : ''}`} onClick={() => { layout.load(l.id); close(); }}>
                  <span className="mi-icon"><Icon name="layout" size={16} /></span>
                  <span className="mi-label">{l.name}</span>
                  <span className="mi-tag" onClick={(e) => { e.stopPropagation(); if (confirm(`Delete layout "${l.name}"?`)) layout.remove(l.id); }}><Icon name="trash" size={13} /></span>
                </div>
              ))}
            </>
          )}
        </Dropdown>

        <Dropdown align="right" trigger={({ toggle }) => (
          <button className={`icon-btn ${gridLayout !== 'single' ? 'active' : ''}`} title="Select layout (split screen)" onClick={toggle}><Icon name="grid" size={18} /></button>
        )}>
          {(close) => (
            <>
              <div className="menu-group-title">SELECT LAYOUT</div>
              {LAYOUTS.map((l) => (
                <button key={l.id} className={`menu-item ${gridLayout === l.id ? 'active' : ''}`} onClick={() => { setGridLayout(l.id); close(); }}>
                  <span className="mi-icon"><Icon name={l.icon} size={18} /></span>
                  <span className="mi-label">{l.label}</span>
                </button>
              ))}
            </>
          )}
        </Dropdown>

        <button className="icon-btn" title="Chart settings" onClick={openSettings}><Icon name="settings" size={18} /></button>
        <button className="icon-btn" title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme}><Icon name="theme" size={18} /></button>
        <button className="icon-btn" title="Fullscreen chart (hide all panels)" onClick={() => setChartOnly(true)}><Icon name="expand" size={18} /></button>
        <button className={`icon-btn ${fs ? 'active' : ''}`} title={fs ? 'Exit fullscreen' : 'Fullscreen window'} onClick={toggleFullscreen}><Icon name="fullscreen" size={18} /></button>

        <div className="sep" />

        <button
          className={`pill-btn ${chainOpen ? 'strong' : 'outlined'}`}
          title="Options Chain — one-click trading"
          onClick={toggleChain}
        >⊞ Chain</button>
        <button className="publish-btn" title="Publish">Publish</button>

        <div className="sep" />

        {user ? (
          <div className="auth-user-widget">
            {user.is_admin && (
              <button
                className="pill-btn admin-btn"
                onClick={() => setAdminOpen(true)}
                title="User Management (Admin)"
              >
                ★ Admin
              </button>
            )}
            <span className="auth-user-email" title={user.email}>{user.email.split('@')[0]}</span>
            <button className="pill-btn auth-logout-btn" onClick={logout} title="Logout">Logout</button>
          </div>
        ) : (
          <button className="pill-btn auth-login-btn" onClick={() => setAuthOpen(true)} title="Login / Register">
            Login
          </button>
        )}
      </div>

      {searchOpen && <SymbolSearch onClose={closeSearch} initialQuery={searchInitialQuery} />}
      {compareOpen && <SymbolSearch mode="compare" onClose={() => setCompareOpen(false)} />}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}
    </header>
  );
}
