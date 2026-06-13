import { create } from 'zustand';

interface ReplayState {
  active: boolean;
  playing: boolean;
  index: number;   // number of bars revealed
  speed: number;   // bars per second
  total: number;
  timestamps: number[];  // unix seconds for each candle
  start: (total: number) => void;
  exit: () => void;
  play: () => void;
  pause: () => void;
  step: () => void;
  setSpeed: (s: number) => void;
  setIndex: (i: number) => void;
  setTimestamps: (ts: number[]) => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  active: false,
  playing: false,
  index: 0,
  speed: 3,
  total: 0,
  timestamps: [],

  start: (total) => set({
    active: true,
    playing: false,
    total,
    index: Math.max(10, Math.floor(total * 0.6)),
  }),

  exit: () => set({ active: false, playing: false, timestamps: [] }),

  play:  () => set({ playing: true }),
  pause: () => set({ playing: false }),
  step:  () => set((s) => ({ index: Math.min(s.total, s.index + 1) })),

  setSpeed: (speed) => set({ speed }),

  setIndex: (index) => set((s) => ({ index: Math.max(2, Math.min(s.total, index)) })),

  // Called from ChartView whenever candles are (re)loaded — on replay start AND
  // whenever lazy-loading prepends older candles.  Updates total from the actual
  // candle count so the scrubber covers the full loaded history, and keeps the
  // user's relative position in the timeline.
  setTimestamps: (timestamps) => set((s) => {
    const newTotal = timestamps.length;
    if (newTotal === 0) return { timestamps };

    // Preserve the user's relative position; default to 60% on first call.
    const newIndex = s.total > 0
      ? Math.max(2, Math.min(newTotal, Math.round((s.index / s.total) * newTotal)))
      : Math.max(2, Math.floor(newTotal * 0.6));

    return { timestamps, total: newTotal, index: newIndex };
  }),
}));
