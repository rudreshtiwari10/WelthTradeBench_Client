import { create } from 'zustand';
import type { ChartType, Interval, SymbolInfo } from '../data/types';
import { usePanelsStore } from './panelsStore';

interface ChartState {
  symbol: SymbolInfo;
  interval: Interval;
  chartType: ChartType;
  setSymbol: (s: SymbolInfo) => void;
  setInterval: (i: Interval) => void;
  setChartType: (t: ChartType) => void;
  dataVersion: number;        // bumps when candle data changes (history load / tick)
  bumpData: () => void;
  barCount: number;
  setBarCount: (n: number) => void;
  rangeReq: { label: string; nonce: number } | null;  // bottom-bar timeframe request
  requestRange: (label: string) => void;
}

export const useChartStore = create<ChartState>((set) => ({
  symbol: { symbol: 'NIFTY', name: 'Nifty 50 Index', exchange: 'NSE', kind: 'index' },
  interval: '1D',
  chartType: 'candles',
  setSymbol: (symbol) => {
    set({ symbol });
    const { activeId, updatePanel } = usePanelsStore.getState();
    updatePanel(activeId, { symbol });
  },
  setInterval: (interval) => {
    set({ interval });
    const { activeId, updatePanel } = usePanelsStore.getState();
    updatePanel(activeId, { interval });
  },
  setChartType: (chartType) => {
    set({ chartType });
    const { activeId, updatePanel } = usePanelsStore.getState();
    updatePanel(activeId, { chartType });
  },
  dataVersion: 0,
  bumpData: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),
  barCount: 0,
  setBarCount: (barCount) => set({ barCount }),
  rangeReq: null,
  requestRange: (label) => set((s) => ({ rangeReq: { label, nonce: (s.rangeReq?.nonce ?? 0) + 1 } })),
}));
