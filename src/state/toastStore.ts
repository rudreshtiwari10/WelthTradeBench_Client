import { create } from 'zustand';

export interface Toast { id: string; text: string; kind: 'info' | 'alert'; }

interface ToastState {
  toasts: Toast[];
  push: (text: string, kind?: 'info' | 'alert') => void;
  remove: (id: string) => void;
}

let seq = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (text, kind = 'info') => set((s) => ({ toasts: [...s.toasts, { id: `t${seq++}`, text, kind }] })),
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
