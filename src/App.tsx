import { TopToolbar } from './components/TopToolbar';
import { LeftToolbar } from './components/LeftToolbar';
import { ChartArea } from './components/ChartArea';
import { RightPanel } from './components/RightPanel';
import { BottomBar } from './components/BottomBar';
import { IndicatorsDialog } from './components/IndicatorsDialog';
import { ChartSettingsDialog } from './components/ChartSettingsDialog';
import { OptionsTicket } from './components/OptionsTicket';
import { OptionsChainPanel } from './components/OptionsChainPanel';
import { SymbolSearch } from './components/SymbolSearch';
import { ToastHost } from './components/Toast';
import { Icon } from './icons/Icon';
import { useShortcuts } from './hooks/useShortcuts';
import { useUiStore } from './state/uiStore';
import { initHistoryTracking } from './state/historyStore';
import { useEffect } from 'react';
import './App.css';

initHistoryTracking();

export default function App() {
  useShortcuts();
  const theme      = useUiStore((s) => s.theme);
  const chartOnly  = useUiStore((s) => s.chartOnly);
  const setChartOnly = useUiStore((s) => s.setChartOnly);
  const chainOpen  = useUiStore((s) => s.chainOpen);
  const searchOpen         = useUiStore((s) => s.searchOpen);
  const searchInitialQuery = useUiStore((s) => s.searchInitialQuery);
  const closeSearch        = useUiStore((s) => s.closeSearch);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  // Chart-only mode: try real browser fullscreen too; Esc exits.
  useEffect(() => {
    if (chartOnly) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && useUiStore.getState().chartOnly) setChartOnly(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chartOnly, setChartOnly]);

  if (chartOnly) {
    return (
      <div className="app chart-only-mode">
        <ChartArea />
        <button className="chartonly-exit" title="Exit fullscreen (Esc)" onClick={() => setChartOnly(false)}>
          <Icon name="close" size={16} /> Exit fullscreen
        </button>
        <OptionsTicket />
        <ToastHost />
      </div>
    );
  }

  return (
    <div className="app">
      <TopToolbar />
      <div className="app-body">
        <LeftToolbar />
        <div className="app-center">
          <ChartArea />
          <BottomBar />
        </div>
        <RightPanel />
      </div>
      <IndicatorsDialog />
      <ChartSettingsDialog />
      <OptionsTicket />
      {chainOpen && <OptionsChainPanel />}
      {searchOpen && <SymbolSearch onClose={closeSearch} initialQuery={searchInitialQuery} />}
      <ToastHost />
    </div>
  );
}
