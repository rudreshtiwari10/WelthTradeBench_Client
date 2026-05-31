import { create } from 'zustand';

interface ReplayState {
  active: boolean;
  playing: boolean;
  index: number;   // number of bars revealed
  speed: number;   // bars per second
  total: number;
  start: (total: number) => void;
  exit: () => void;
  play: () => void;
  pause: () => void;
  step: () => void;
  setSpeed: (s: number) => void;
  setIndex: (i: number) => void;
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  active: false,
  playing: false,
  index: 0,
  speed: 3,
  total: 0,
  start: (total) => set({ active: true, playing: false, total, index: Math.max(10, Math.floor(total * 0.6)) }),
  exit: () => set({ active: false, playing: false }),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  step: () => set((s) => ({ index: Math.min(s.total, s.index + 1) })),
  setSpeed: (speed) => set({ speed }),
  setIndex: (index) => set((s) => ({ index: Math.max(2, Math.min(s.total, index)) })),
}));
