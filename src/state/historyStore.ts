import { create } from 'zustand';
import type { Drawing } from '../drawings/types';
import type { IndicatorInstance } from './indicatorStore';
import { useDrawingStore } from './drawingStore';
import { useIndicatorStore } from './indicatorStore';

export interface Snapshot {
  drawings: Drawing[];
  indicators: IndicatorInstance[];
}

interface HistoryState {
  past: Snapshot[];
  future: Snapshot[];
  restoring: boolean;   // suppress recording while we apply undo/redo
  record: (prev: Snapshot) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX = 100;

const snapshot = (): Snapshot => ({
  drawings: structuredClone(useDrawingStore.getState().drawings),
  indicators: structuredClone(useIndicatorStore.getState().instances),
});

const apply = (s: Snapshot) => {
  useDrawingStore.getState().setDrawings(structuredClone(s.drawings));
  useIndicatorStore.getState().setInstances(structuredClone(s.indicators));
};

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  restoring: false,
  record: (prev) => set((st) => ({ past: [...st.past, prev].slice(-MAX), future: [] })),
  undo: () => {
    const { past } = get();
    if (past.length === 0) return;
    const current = snapshot();
    const prev = past[past.length - 1];
    set({ restoring: true });
    apply(prev);
    set((st) => ({ past: st.past.slice(0, -1), future: [current, ...st.future].slice(0, MAX) }));
    setTimeout(() => set({ restoring: false }), 0);
  },
  redo: () => {
    const { future } = get();
    if (future.length === 0) return;
    const current = snapshot();
    const next = future[0];
    set({ restoring: true });
    apply(next);
    set((st) => ({ future: st.future.slice(1), past: [...st.past, current].slice(-MAX) }));
    setTimeout(() => set({ restoring: false }), 0);
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

/** Wire change-tracking once at app start. Records the PREVIOUS state whenever
 *  drawings or indicators change (except while restoring an undo/redo). */
export function initHistoryTracking() {
  let prevDrawings = useDrawingStore.getState().drawings;
  let prevIndicators = useIndicatorStore.getState().instances;

  useDrawingStore.subscribe((s) => {
    if (s.drawings === prevDrawings) return;
    const before = prevDrawings;
    prevDrawings = s.drawings;
    if (!useHistoryStore.getState().restoring) {
      useHistoryStore.getState().record({ drawings: before, indicators: prevIndicators });
    }
  });
  useIndicatorStore.subscribe((s) => {
    if (s.instances === prevIndicators) return;
    const before = prevIndicators;
    prevIndicators = s.instances;
    if (!useHistoryStore.getState().restoring) {
      useHistoryStore.getState().record({ drawings: prevDrawings, indicators: before });
    }
  });
}
