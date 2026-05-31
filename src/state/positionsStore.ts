import { create } from 'zustand';

export interface Position {
  id: string;
  symbol: string;        // option contract symbol
  underlying?: string;   // e.g. "NIFTY" — used for live P&L
  strike?: number;
  optType?: 'CE' | 'PE';
  expiryDate?: number;   // Unix ms — Date.getTime() of expiry
  side: 'buy' | 'sell';
  lots: number;
  qty: number;           // lots * lotSize
  price: number;         // entry premium
  ts: number;
}

interface PositionsState {
  positions: Position[];
  /** Adds a paper position and returns its generated id. */
  add: (p: Omit<Position, 'id' | 'ts'>) => string;
  remove: (id: string) => void;
  clear: () => void;
}

let seq = 1;
const KEY = 'tradomate:positions';
const load = (): Position[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const persist = (p: Position[]) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* */ } };

export const usePositionsStore = create<PositionsState>((set) => ({
  positions: load(),
  add: (p) => {
    const id = `o${seq++}_${Date.now()}`;
    set((s) => { const arr = [{ ...p, id, ts: Date.now() }, ...s.positions]; persist(arr); return { positions: arr }; });
    return id;
  },
  remove: (id) => set((s) => { const arr = s.positions.filter((x) => x.id !== id); persist(arr); return { positions: arr }; }),
  clear: () => set(() => { persist([]); return { positions: [] }; }),
}));
