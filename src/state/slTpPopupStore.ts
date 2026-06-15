import { create } from 'zustand';

export interface ExitLimitOrder {
  qty: number;
  transaction_type: 'BUY' | 'SELL';
  product: 'D' | 'I';
  segment: 'option' | 'future' | 'equity';
  underlying?: string;
  expiry?: string;
  strike?: number;
  option_type?: 'CE' | 'PE';
  tradingsymbol?: string;
  exchange?: string;
}

export interface SlTpPopupData {
  posId: string;
  type: 'sl' | 'tp' | 'exit';
  symbol: string;
  entryPrice: number;
  side: 'buy' | 'sell';
  suggestedPrice: number;
  /** Populated only for type='exit' — the LIMIT order to place on confirm */
  exitOrder?: ExitLimitOrder;
}

interface SlTpPopupState {
  popup: SlTpPopupData | null;
  editPrice: string;
  open: (data: SlTpPopupData) => void;
  close: () => void;
  setEditPrice: (p: string) => void;
}

export const useSlTpPopupStore = create<SlTpPopupState>((set) => ({
  popup: null,
  editPrice: '',
  open: (data) => set({ popup: data, editPrice: data.suggestedPrice.toFixed(2) }),
  close: () => set({ popup: null, editPrice: '' }),
  setEditPrice: (p) => set({ editPrice: p }),
}));
