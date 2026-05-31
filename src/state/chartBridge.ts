import { create } from 'zustand';

// Lets the top toolbar invoke chart actions that live inside ChartView.
interface ChartBridge {
  takeSnapshot: (() => Promise<Blob | null>) | null;
  resetView: (() => void) | null;
  register: (fns: Partial<Pick<ChartBridge, 'takeSnapshot' | 'resetView'>>) => void;
}

export const useChartBridge = create<ChartBridge>((set) => ({
  takeSnapshot: null,
  resetView: null,
  register: (fns) => set(fns),
}));
