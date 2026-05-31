import { create } from 'zustand';
import { getIndicator } from '../indicators/registry';

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

export const useIndicatorStore = create<IndicatorState>((set) => ({
  instances: [],
  add: (defId) => set((s) => {
    const def = getIndicator(defId);
    if (!def) return s;
    const inputs: Record<string, number> = {};
    for (const inp of def.inputs) inputs[inp.key] = inp.default;
    return { instances: [...s.instances, { instId: `i${seq++}`, defId, inputs }] };
  }),
  remove: (instId) => set((s) => ({ instances: s.instances.filter((i) => i.instId !== instId) })),
  updateInputs: (instId, patch) => set((s) => ({
    instances: s.instances.map((i) => (i.instId === instId ? { ...i, inputs: { ...i.inputs, ...patch } } : i)),
  })),
  setInstances: (instances) => set({ instances }),
}));
