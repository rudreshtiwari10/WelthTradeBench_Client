import { create } from 'zustand';

export interface CompareItem { symbol: string; name: string; color: string; }

const PALETTE = ['#ff9800', '#ab47bc', '#26c6da', '#ec407a', '#9ccc65', '#5c6bc0', '#ffca28'];

interface CompareState {
  compares: CompareItem[];
  add: (symbol: string, name: string) => void;
  remove: (symbol: string) => void;
  clear: () => void;
}

export const useCompareStore = create<CompareState>((set, get) => ({
  compares: [],
  add: (symbol, name) => set((s) => {
    if (s.compares.some((c) => c.symbol === symbol)) return s;
    const color = PALETTE[s.compares.length % PALETTE.length];
    return { compares: [...s.compares, { symbol, name, color }] };
  }),
  remove: (symbol) => set((s) => ({ compares: s.compares.filter((c) => c.symbol !== symbol) })),
  clear: () => set({ compares: [] }),
}));
