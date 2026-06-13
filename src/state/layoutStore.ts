import { create } from 'zustand';
import type { ChartType, Interval, SymbolInfo } from '../data/types';
import { useChartStore } from './chartStore';
import { useIndicatorStore, type IndicatorInstance } from './indicatorStore';
import { usePanelsStore, type GridLayout, type Panel } from './panelsStore';
import { useSettingsStore, type ChartSettings } from './settingsStore';
import { apiFetch, isAuthenticated } from '../api/client';

export interface Layout {
  id: string;
  name: string;
  // Active-panel snapshot (kept for backward compat and display)
  symbol: SymbolInfo;
  interval: Interval;
  chartType: ChartType;
  indicators: IndicatorInstance[];
  // Full multi-panel state
  gridLayout?: GridLayout;
  panels?: Panel[];
  // Chart appearance settings (candle colors, grid, etc.)
  settings?: ChartSettings;
}

interface LayoutState {
  layouts: Layout[];
  currentId: string | null;
  name: string;
  setName: (name: string) => void;
  saveCurrent: () => void;
  saveAs: (name: string) => void;
  load: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  newLayout: () => void;
  fetchLayouts: () => Promise<void>;
  clearForLogout: () => void;
}

const LS_KEY = 'tradomate:layouts';

const loadLocal = (): { layouts: Layout[]; currentId: string | null; name: string } => {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { layouts: d.layouts || [], currentId: d.currentId ?? null, name: d.name || 'Unnamed' };
  } catch { return { layouts: [], currentId: null, name: 'Unnamed' }; }
};

const persistLocal = (s: Pick<LayoutState, 'layouts' | 'currentId' | 'name'>) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ layouts: s.layouts, currentId: s.currentId, name: s.name })); } catch { /* */ }
};

const capture = (name: string, id: string): Layout => {
  const cs = useChartStore.getState();
  const ps = usePanelsStore.getState();
  const ss = useSettingsStore.getState();
  return {
    id,
    name,
    // Active-panel fields (used for single-panel display / backward compat)
    symbol: cs.symbol,
    interval: cs.interval,
    chartType: cs.chartType,
    indicators: useIndicatorStore.getState().instances,
    // Full multi-panel state
    gridLayout: ps.layout,
    panels: ps.panels,
    // Chart appearance settings
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
};

const init = loadLocal();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: init.layouts,
  currentId: init.currentId,
  name: init.name,

  setName: (name) => set((s) => { persistLocal({ ...s, name }); return { name }; }),

  saveCurrent: () => set((s) => {
    let layouts = s.layouts;
    let currentId = s.currentId;
    const isUpdate = currentId != null && layouts.some((l) => l.id === currentId);
    if (isUpdate) {
      layouts = layouts.map((l) => (l.id === currentId ? capture(s.name, currentId!) : l));
    } else {
      currentId = `l${Date.now()}`;
      layouts = [...layouts, capture(s.name, currentId)];
    }
    persistLocal({ layouts, currentId, name: s.name });
    if (isAuthenticated()) {
      const layout = layouts.find((l) => l.id === currentId)!;
      if (isUpdate) {
        apiFetch(`/api/layouts/${currentId}`, { method: 'PUT', body: JSON.stringify(layout) }).catch(console.error);
      } else {
        apiFetch('/api/layouts', { method: 'POST', body: JSON.stringify(layout) }).catch(console.error);
      }
    }
    return { layouts, currentId };
  }),

  saveAs: (name) => set((s) => {
    const id = `l${Date.now()}`;
    const layout = capture(name, id);
    const layouts = [...s.layouts, layout];
    persistLocal({ layouts, currentId: id, name });
    if (isAuthenticated()) {
      apiFetch('/api/layouts', { method: 'POST', body: JSON.stringify(layout) }).catch(console.error);
    }
    return { layouts, currentId: id, name };
  }),

  load: (id) => set((s) => {
    const l = s.layouts.find((x) => x.id === id);
    if (!l) return s;

    if (l.gridLayout && l.panels && l.panels.length > 0) {
      // Restore the grid layout first (creates correct panel slots)
      usePanelsStore.getState().setLayout(l.gridLayout);
      // Restore each panel's state
      l.panels.forEach((p) => usePanelsStore.getState().updatePanel(p.id, p));
      // Sync chartStore with the active panel so TopToolbar reflects reality
      const activeId = usePanelsStore.getState().activeId;
      const activePanel = l.panels.find((p) => p.id === activeId) ?? l.panels[0];
      useChartStore.getState().setSymbol(activePanel.symbol);
      useChartStore.getState().setInterval(activePanel.interval);
      useChartStore.getState().setChartType(activePanel.chartType);
    } else {
      // Legacy layout saved before multi-panel support
      useChartStore.getState().setSymbol(l.symbol);
      useChartStore.getState().setInterval(l.interval);
      useChartStore.getState().setChartType(l.chartType);
    }

    // Restore chart appearance settings if the layout has them
    if (l.settings) {
      useSettingsStore.getState().set(l.settings);
    }

    useIndicatorStore.getState().setInstances(l.indicators);
    persistLocal({ layouts: s.layouts, currentId: id, name: l.name });
    return { currentId: id, name: l.name };
  }),

  rename: (id, name) => set((s) => {
    const layouts = s.layouts.map((l) => (l.id === id ? { ...l, name } : l));
    const newName = id === s.currentId ? name : s.name;
    persistLocal({ layouts, currentId: s.currentId, name: newName });
    if (isAuthenticated()) {
      const layout = layouts.find((l) => l.id === id)!;
      apiFetch(`/api/layouts/${id}`, { method: 'PUT', body: JSON.stringify(layout) }).catch(console.error);
    }
    return { layouts, name: newName };
  }),

  remove: (id) => set((s) => {
    const layouts = s.layouts.filter((l) => l.id !== id);
    const currentId = s.currentId === id ? null : s.currentId;
    persistLocal({ layouts, currentId, name: s.name });
    if (isAuthenticated()) {
      apiFetch(`/api/layouts/${id}`, { method: 'DELETE' }).catch(console.error);
    }
    return { layouts, currentId };
  }),

  newLayout: () => set((s) => {
    useIndicatorStore.getState().setInstances([]);
    persistLocal({ layouts: s.layouts, currentId: null, name: 'Unnamed' });
    return { currentId: null, name: 'Unnamed' };
  }),

  fetchLayouts: async () => {
    if (!isAuthenticated()) return;
    try {
      const res = await apiFetch('/api/layouts');
      if (!res.ok) return;
      const layouts: Layout[] = await res.json();
      const { currentId, name } = get();
      persistLocal({ layouts, currentId, name });
      set({ layouts });
      // Restore the active layout (panels, settings, indicators) after login
      if (currentId && layouts.some((l) => l.id === currentId)) {
        get().load(currentId);
      }
    } catch (e) {
      console.error('[layoutStore] fetchLayouts failed:', e);
    }
  },

  clearForLogout: () => {
    try { localStorage.removeItem(LS_KEY); } catch { /* */ }
    set({ layouts: [], currentId: null, name: 'Unnamed' });
  },
}));
