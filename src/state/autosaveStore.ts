import { create } from 'zustand';

const LS_KEY = 'welthwest:autosave';

interface AutosaveState {
  enabled: boolean;
  intervalMin: number;          // minutes between saves
  lastSaved: number | null;     // unix ms of most recent autosave
  status: 'idle' | 'saving' | 'saved';
  setEnabled: (v: boolean) => void;
  setIntervalMin: (m: number) => void;
  markSaving: () => void;
  markSaved: () => void;
  resetStatus: () => void;
}

function loadPrefs() {
  try {
    const d = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    return { enabled: d.enabled ?? true, intervalMin: d.intervalMin ?? 5 };
  } catch { return { enabled: true, intervalMin: 5 }; }
}

function savePrefs(patch: Partial<{ enabled: boolean; intervalMin: number }>) {
  try {
    const existing = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    localStorage.setItem(LS_KEY, JSON.stringify({ ...existing, ...patch }));
  } catch {}
}

const prefs = loadPrefs();

export const useAutosaveStore = create<AutosaveState>((set) => ({
  enabled: prefs.enabled,
  intervalMin: prefs.intervalMin,
  lastSaved: null,
  status: 'idle',
  setEnabled:     (enabled)     => { set({ enabled });              savePrefs({ enabled }); },
  setIntervalMin: (intervalMin) => { set({ intervalMin });          savePrefs({ intervalMin }); },
  markSaving:  () => set({ status: 'saving' }),
  markSaved:   () => set({ status: 'saved', lastSaved: Date.now() }),
  resetStatus: () => set({ status: 'idle' }),
}));
