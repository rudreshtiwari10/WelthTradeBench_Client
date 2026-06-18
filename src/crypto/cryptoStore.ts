import { create } from 'zustand';

export interface TickData {
  price: number;
  open24h: number;
  high24h: number;
  low24h: number;
  changePercent: number;
}

export interface XMAccount {
  login: number;
  name: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  leverage: number;
}

export interface XMPosition {
  ticket: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl: number;
  tp: number;
  profit: number;
  comment: string;
}

interface CryptoState {
  cryptoMode: boolean;
  ticks: Record<string, TickData>;
  xmConnected: boolean;
  xmAccount: XMAccount | null;
  positions: XMPosition[];

  toggleCryptoMode: () => void;
  setTick: (binance: string, tick: TickData) => void;
  setXmConnected: (v: boolean) => void;
  setXmAccount: (a: XMAccount | null) => void;
  setPositions: (p: XMPosition[]) => void;
}

export const useCryptoStore = create<CryptoState>((set) => ({
  cryptoMode: false,
  ticks: {},
  xmConnected: false,
  xmAccount: null,
  positions: [],

  toggleCryptoMode: () => set((s) => ({ cryptoMode: !s.cryptoMode })),
  setTick: (binance, tick) => set((s) => ({ ticks: { ...s.ticks, [binance]: tick } })),
  setXmConnected: (xmConnected) => set({ xmConnected }),
  setXmAccount: (xmAccount) => set({ xmAccount }),
  setPositions: (positions) => set({ positions }),
}));
