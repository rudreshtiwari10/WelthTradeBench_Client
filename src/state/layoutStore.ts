import { create } from 'zustand';
import type { ChartType, Interval, SymbolInfo } from '../data/types';
import { useChartStore } from './chartStore';
import { useIndicatorStore, type IndicatorInstance } from './indicatorStore';

export interface Layout {
  id: string;
  name: string;
  symbol: SymbolInfo;
  interval: Interval;
  chartType: ChartType;
  indicators: IndicatorInstance[];
}

interface LayoutState {
  layouts: Layout[];
  currentId: string | null;
  name: string;
  setName: (name: string) => void;
  saveCurrent: () => void;        // update existing or create from current name
  saveAs: (name: string) => void;
  load: (id: string) => void;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  newLayout: () => void;
}

const KEY = 'tradomate:layouts';
const load = (): { layouts: Layout[]; currentId: string | null; name: string } => {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { layouts: d.layouts || [], currentId: d.currentId ?? null, name: d.name || 'Unnamed' };
  } catch { return { layouts: [], currentId: null, name: 'Unnamed' }; }
};
const persist = (s: Pick<LayoutState, 'layouts' | 'currentId' | 'name'>) => {
  try { localStorage.setItem(KEY, JSON.stringify({ layouts: s.layouts, currentId: s.currentId, name: s.name })); } catch { /* */ }
};

const capture = (name: string, id: string): Layout => {
  const c = useChartStore.getState();
  return { id, name, symbol: c.symbol, interval: c.interval, chartType: c.chartType, indicators: useIndicatorStore.getState().instances };
};

const init = load();

export const useLayoutStore = create<LayoutState>((set, get) => ({
  layouts: init.layouts,
  currentId: init.currentId,
  name: init.name,

  setName: (name) => set((s) => { persist({ ...s, name }); return { name }; }),

  saveCurrent: () => set((s) => {
    let layouts = s.layouts;
    let currentId = s.currentId;
    if (currentId && layouts.some((l) => l.id === currentId)) {
      layouts = layouts.map((l) => (l.id === currentId ? capture(s.name, currentId!) : l));
    } else {
      currentId = `l${Date.now()}`;
      layouts = [...layouts, capture(s.name, currentId)];
    }
    persist({ layouts, currentId, name: s.name });
    return { layouts, currentId };
  }),

  saveAs: (name) => set((s) => {
    const id = `l${Date.now()}`;
    const layouts = [...s.layouts, capture(name, id)];
    persist({ layouts, currentId: id, name });
    return { layouts, currentId: id, name };
  }),

  load: (id) => set((s) => {
    const l = s.layouts.find((x) => x.id === id);
    if (!l) return s;
    const cs = useChartStore.getState();
    cs.setSymbol(l.symbol); cs.setInterval(l.interval); cs.setChartType(l.chartType);
    useIndicatorStore.getState().setInstances(l.indicators);
    persist({ layouts: s.layouts, currentId: id, name: l.name });
    return { currentId: id, name: l.name };
  }),

  rename: (id, name) => set((s) => {
    const layouts = s.layouts.map((l) => (l.id === id ? { ...l, name } : l));
    const newName = id === s.currentId ? name : s.name;
    persist({ layouts, currentId: s.currentId, name: newName });
    return { layouts, name: newName };
  }),

  remove: (id) => set((s) => {
    const layouts = s.layouts.filter((l) => l.id !== id);
    const currentId = s.currentId === id ? null : s.currentId;
    persist({ layouts, currentId, name: s.name });
    return { layouts, currentId };
  }),

  newLayout: () => set((s) => {
    useIndicatorStore.getState().setInstances([]);
    persist({ layouts: s.layouts, currentId: null, name: 'Unnamed' });
    return { currentId: null, name: 'Unnamed' };
  }),
}));
