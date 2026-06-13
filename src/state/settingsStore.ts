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

const LS_KEY = 'welthwest:chartSettings';

const loadSettings = (): Partial<ChartSettings> => {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
};

const saveSettings = (s: ChartSettings) => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* */ }
};

const saved = loadSettings();

export const useSettingsStore = create<SettingsState>((zustandSet, zustandGet) => ({
  ...DEFAULTS,
  ...saved,

  set: (patch) => {
    zustandSet(patch);
    const s = zustandGet();
    saveSettings({
      upColor: s.upColor, downColor: s.downColor,
      wickVisible: s.wickVisible, borderVisible: s.borderVisible,
      showVolume: s.showVolume, gridVisible: s.gridVisible,
      crosshairColor: s.crosshairColor, background: s.background,
    });
  },

  reset: () => {
    zustandSet(DEFAULTS);
    saveSettings(DEFAULTS);
  },
}));
