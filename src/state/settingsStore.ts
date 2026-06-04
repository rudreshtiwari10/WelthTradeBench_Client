import { create } from 'zustand';

// Chart appearance settings (the gear dialog). Applied reactively in ChartView.
export interface ChartSettings {
  upColor: string;
  downColor: string;
  wickVisible: boolean;
  borderVisible: boolean;
  showVolume: boolean;
  gridVisible: boolean;
  crosshairColor: string;
  background: string;
}

interface SettingsState extends ChartSettings {
  set: (patch: Partial<ChartSettings>) => void;
  reset: () => void;
}

const DEFAULTS: ChartSettings = {
  upColor: '#26a69a',
  downColor: '#ef5350',
  wickVisible: true,
  borderVisible: false,
  showVolume: false,
  gridVisible: true,
  crosshairColor: '#787b86',
  background: '',  // '' = follow theme
};

export const useSettingsStore = create<SettingsState>((set) => ({
  ...DEFAULTS,
  set: (patch) => set(patch),
  reset: () => set(DEFAULTS),
}));
