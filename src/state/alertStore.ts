import { create } from 'zustand';

export interface Alert {
  id: string;
  symbol: string;
  price: number;
  fired: boolean;
}

interface AlertState {
  alerts: Alert[];
  add: (symbol: string, price: number) => void;
  remove: (id: string) => void;
  markFired: (id: string) => void;
}

let seq = 1;

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  add: (symbol, price) => set((s) => ({ alerts: [...s.alerts, { id: `a${seq++}`, symbol, price, fired: false }] })),
  remove: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
  markFired: (id) => set((s) => ({ alerts: s.alerts.map((a) => (a.id === id ? { ...a, fired: true } : a)) })),
}));
