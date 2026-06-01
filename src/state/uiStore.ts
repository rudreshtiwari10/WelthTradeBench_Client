import { create } from 'zustand';

// Cross-cutting UI flags (dialogs, panels). Feature dialogs land in later phases.
type Theme = 'dark' | 'light';

interface UiState {
  indicatorsOpen: boolean;
  openIndicators: () => void;
  closeIndicators: () => void;
  objectTreeOpen: boolean;
  toggleObjectTree: () => void;
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  chartOnly: boolean;
  toggleChartOnly: () => void;
  setChartOnly: (v: boolean) => void;
  trade: { open: boolean; symbol: string; side: 'buy' | 'sell'; spot: number };
  openTrade: (symbol: string, side: 'buy' | 'sell', spot: number) => void;
  closeTrade: () => void;
  chainOpen: boolean;
  toggleChain: () => void;
  closeChain: () => void;
  // Global symbol-search modal (opened via toolbar click or any printable keypress)
  searchOpen: boolean;
  searchInitialQuery: string;
  openSearch: (q?: string) => void;
  closeSearch: () => void;
  theme: Theme;
  toggleTheme: () => void;
}

const initialTheme: Theme = (localStorage.getItem('theme') as Theme) || 'dark';

export const useUiStore = create<UiState>((set) => ({
  indicatorsOpen: false,
  openIndicators: () => set({ indicatorsOpen: true }),
  closeIndicators: () => set({ indicatorsOpen: false }),
  objectTreeOpen: false,
  toggleObjectTree: () => set((s) => ({ objectTreeOpen: !s.objectTreeOpen })),
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  chartOnly: false,
  toggleChartOnly: () => set((s) => ({ chartOnly: !s.chartOnly })),
  setChartOnly: (chartOnly) => set({ chartOnly }),
  trade: { open: false, symbol: '', side: 'buy', spot: 0 },
  openTrade: (symbol, side, spot) => set({ trade: { open: true, symbol, side, spot } }),
  closeTrade: () => set((s) => ({ trade: { ...s.trade, open: false } })),
  chainOpen: false,
  toggleChain: () => set((s) => ({ chainOpen: !s.chainOpen })),
  closeChain: () => set({ chainOpen: false }),
  searchOpen: false,
  searchInitialQuery: '',
  openSearch: (q = '') => set({ searchOpen: true, searchInitialQuery: q }),
  closeSearch: () => set({ searchOpen: false, searchInitialQuery: '' }),
  theme: initialTheme,
  toggleTheme: () => set((s) => {
    const theme: Theme = s.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
    return { theme };
  }),
}));
