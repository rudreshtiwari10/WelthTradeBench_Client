import { create } from 'zustand';
import type { ChartType, Interval, SymbolInfo } from '../data/types';

export type GridLayout = 'single' | 'cols2' | 'rows2' | 'grid4';

export interface Panel {
  id: string;
  symbol: SymbolInfo;
  interval: Interval;
  chartType: ChartType;
}

const COUNT: Record<GridLayout, number> = { single: 1, cols2: 2, rows2: 2, grid4: 4 };

const defaultPanel = (id: string): Panel => ({
  id,
  symbol: { symbol: 'NIFTY', name: 'Nifty 50 Index', exchange: 'NSE', kind: 'index' },
  interval: '1D',
  chartType: 'candles',
});

// ─── Persistence ────────────────────────────────────────────────────────────

const LS_KEY = 'welthwest:panels';
const VALID_LAYOUTS: GridLayout[] = ['single', 'cols2', 'rows2', 'grid4'];

const loadPanels = (): { layout: GridLayout; panels: Panel[]; activeId: string } => {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    const layout: GridLayout = VALID_LAYOUTS.includes(d.layout) ? d.layout : 'single';
    const panels: Panel[] = Array.isArray(d.panels) && d.panels.length > 0 ? d.panels : [defaultPanel('p1')];
    const activeId: string = typeof d.activeId === 'string' && panels.some((p) => p.id === d.activeId)
      ? d.activeId
      : panels[0].id;
    return { layout, panels, activeId };
  } catch {
    return { layout: 'single', panels: [defaultPanel('p1')], activeId: 'p1' };
  }
};

const savePanels = (layout: GridLayout, panels: Panel[], activeId: string) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ layout, panels, activeId })); } catch { /* */ }
};

// ─── Store ───────────────────────────────────────────────────────────────────

interface PanelsState {
  layout: GridLayout;
  panels: Panel[];
  activeId: string;
  setLayout: (l: GridLayout) => void;
  setActive: (id: string) => void;
  updatePanel: (id: string, patch: Partial<Panel>) => void;
  hydrate: (layout: GridLayout, panels: Panel[], activeId: string) => void;
  resetToDefault: () => void;
}

const init = loadPanels();

export const usePanelsStore = create<PanelsState>((set) => ({
  layout: init.layout,
  panels: init.panels,
  activeId: init.activeId,

  setLayout: (layout) => set((s) => {
    const need = COUNT[layout];
    let panels = s.panels.slice(0, need);
    while (panels.length < need) {
      const base = panels[panels.length - 1] ?? defaultPanel('p1');
      panels.push({ ...base, id: `p${panels.length + 1}` });
    }
    const activeId = panels.some((p) => p.id === s.activeId) ? s.activeId : panels[0].id;
    savePanels(layout, panels, activeId);
    return { layout, panels, activeId };
  }),

  setActive: (activeId) => set((s) => {
    savePanels(s.layout, s.panels, activeId);
    return { activeId };
  }),

  updatePanel: (id, patch) => set((s) => {
    const panels = s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p));
    savePanels(s.layout, panels, s.activeId);
    return { panels };
  }),

  hydrate: (layout, panels, activeId) => {
    const safePanels = panels.length > 0 ? panels : [defaultPanel('p1')];
    const safeActiveId = safePanels.some((p) => p.id === activeId) ? activeId : safePanels[0].id;
    savePanels(layout, safePanels, safeActiveId);
    set({ layout, panels: safePanels, activeId: safeActiveId });
  },

  resetToDefault: () => {
    const panels = [defaultPanel('p1')];
    savePanels('single', panels, 'p1');
    set({ layout: 'single', panels, activeId: 'p1' });
  },
}));
