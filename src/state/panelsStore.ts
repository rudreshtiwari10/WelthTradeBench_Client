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

interface PanelsState {
  layout: GridLayout;
  panels: Panel[];
  activeId: string;
  setLayout: (l: GridLayout) => void;
  setActive: (id: string) => void;
  updatePanel: (id: string, patch: Partial<Panel>) => void;
}

export const usePanelsStore = create<PanelsState>((set) => ({
  layout: 'single',
  panels: [defaultPanel('p1')],
  activeId: 'p1',

  setLayout: (layout) => set((s) => {
    const need = COUNT[layout];
    let panels = s.panels.slice(0, need);
    while (panels.length < need) {
      const base = panels[panels.length - 1] ?? defaultPanel('p1');
      panels.push({ ...base, id: `p${panels.length + 1}` });
    }
    const activeId = panels.some((p) => p.id === s.activeId) ? s.activeId : panels[0].id;
    return { layout, panels, activeId };
  }),

  setActive: (activeId) => set({ activeId }),

  updatePanel: (id, patch) => set((s) => ({
    panels: s.panels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  })),
}));
