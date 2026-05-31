import { create } from 'zustand';

export interface Position {
  id: string;
  symbol: string;        // option contract symbol
  side: 'buy' | 'sell';
  lots: number;
  qty: number;           // lots * lotSize
  price: number;         // entry premium
  ts: number;
}

interface PositionsState {
  positions: Position[];
  add: (p: Omit<Position, 'id' | 'ts'>) => void;
  remove: (id: string) => void;
  clear: () => void;
}

let seq = 1;
const KEY = 'tradomate:positions';
const load = (): Position[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const persist = (p: Position[]) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ } };

export const usePositionsStore = create<PositionsState>((set) => ({
  positions: load(),
  add: (p) => set((s) => { const arr = [{ ...p, id: `o${seq++}_${Date.now()}`, ts: Date.now() }, ...s.positions]; persist(arr); return { positions: arr }; }),
  remove: (id) => set((s) => { const arr = s.positions.filter((x) => x.id !== id); persist(arr); return { positions: arr }; }),
  clear: () => set(() => { persist([]); return { positions: [] }; }),
}));
