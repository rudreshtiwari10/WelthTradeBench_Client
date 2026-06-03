import { create } from 'zustand';

export interface SlTpPopupData {
  posId: string;
  type: 'sl' | 'tp';
  symbol: string;
  entryPrice: number;
  side: 'buy' | 'sell';
  suggestedPrice: number;
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
