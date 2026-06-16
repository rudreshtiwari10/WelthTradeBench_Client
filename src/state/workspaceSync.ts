import { apiFetch, isAuthenticated } from '../api/client';
import { useChartStore } from './chartStore';
import { useIndicatorStore } from './indicatorStore';
import { usePanelsStore } from './panelsStore';
import { useSettingsStore } from './settingsStore';

/**
 * Continuously autosaves the user's live session (symbol, interval, chart type,
 * split-screen layout, indicators, candle/appearance settings) to MongoDB —
 * independent of the named "Layout" save/load feature. Restored unconditionally
 * on login so reload always lands exactly where the user left off.
 */

let hydrating = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function buildSnapshot() {
  const cs = useChartStore.getState();
  const ps = usePanelsStore.getState();
  const ss = useSettingsStore.getState();
  const is = useIndicatorStore.getState();
  return {
    symbol: cs.symbol,
    interval: cs.interval,
    chartType: cs.chartType,
    indicators: is.instances,
    gridLayout: ps.layout,
    panels: ps.panels,
    activePanelId: ps.activeId,
    settings: {
      upColor: ss.upColor,
      downColor: ss.downColor,
      wickVisible: ss.wickVisible,
      borderVisible: ss.borderVisible,
      showVolume: ss.showVolume,
      gridVisible: ss.gridVisible,
      crosshairColor: ss.crosshairColor,
      background: ss.background,
    },
  };
}

function scheduleSave() {
  if (hydrating) return;
  if (!isAuthenticated()) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    apiFetch('/api/workspace', { method: 'PUT', body: JSON.stringify(buildSnapshot()) }).catch(console.error);
  }, 1200);
}

/** Mount once at app startup. Sets up subscriptions that fire on ANY relevant state change. */
export function initWorkspaceAutosave() {
  if (initialized) return;
  initialized = true;
  useChartStore.subscribe(scheduleSave);
  usePanelsStore.subscribe(scheduleSave);
  useSettingsStore.subscribe(scheduleSave);
  useIndicatorStore.subscribe(scheduleSave);
}

/** Call after login (or on app boot if already authenticated) to restore the last live session. */
export async function fetchWorkspace(): Promise<void> {
  if (!isAuthenticated()) return;
  try {
    const res = await apiFetch('/api/workspace');
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;

    hydrating = true;
    try {
      if (data.gridLayout && Array.isArray(data.panels) && data.panels.length > 0) {
        usePanelsStore.getState().hydrate(data.gridLayout, data.panels, data.activePanelId);
      }
      if (data.symbol) useChartStore.getState().setSymbol(data.symbol);
      if (data.interval) useChartStore.getState().setInterval(data.interval);
      if (data.chartType) useChartStore.getState().setChartType(data.chartType);
      if (data.settings) useSettingsStore.getState().set(data.settings);
      if (Array.isArray(data.indicators)) useIndicatorStore.getState().setInstances(data.indicators);
    } finally {
      hydrating = false;
    }
  } catch (e) {
    console.error('[workspaceSync] fetchWorkspace failed:', e);
  }
}
