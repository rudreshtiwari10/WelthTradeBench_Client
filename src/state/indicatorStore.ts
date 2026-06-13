import { create } from 'zustand';
import { getIndicator } from '../indicators/registry';

const LS_KEY = 'welthwest:indicators';

export interface IndicatorInstance {
  instId: string;
  defId: string;
  inputs: Record<string, number>;
}

interface IndicatorState {
  instances: IndicatorInstance[];
  add: (defId: string) => void;
  remove: (instId: string) => void;
  updateInputs: (instId: string, patch: Record<string, number>) => void;
  setInstances: (instances: IndicatorInstance[]) => void;
}

let seq = 1;

function _load(): IndicatorInstance[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is IndicatorInstance =>
        typeof i === 'object' && i !== null &&
        typeof (i as any).instId === 'string' &&
        typeof (i as any).defId === 'string' &&
        typeof (i as any).inputs === 'object',
    );
  } catch { return []; }
}

function _save(instances: IndicatorInstance[]) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(instances)); } catch { /* quota */ }
}

const _initial = _load();
if (_initial.length > 0) {
  const maxSeq = _initial.reduce((m, i) => {
    const n = parseInt(i.instId.replace('i', ''), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  seq = maxSeq + 1;
}

export const useIndicatorStore = create<IndicatorState>((set) => ({
  instances: _initial,

  add: (defId) => set((s) => {
    const def = getIndicator(defId);
    if (!def) return s;
    const inputs: Record<string, number> = {};
    for (const inp of def.inputs) inputs[inp.key] = inp.default;
    const updated = [...s.instances, { instId: `i${seq++}`, defId, inputs }];
    _save(updated);
    return { instances: updated };
  }),

  remove: (instId) => set((s) => {
    const updated = s.instances.filter((i) => i.instId !== instId);
    _save(updated);
    return { instances: updated };
  }),

  updateInputs: (instId, patch) => set((s) => {
    const updated = s.instances.map((i) =>
      i.instId === instId ? { ...i, inputs: { ...i.inputs, ...patch } } : i,
    );
    _save(updated);
    return { instances: updated };
  }),

  setInstances: (instances) => {
    _save(instances);
    set({ instances });
  },
}));
