import { create } from 'zustand';
import { DEFAULT_STYLE, type Drawing, type DrawingType, type DStyle } from '../drawings/types';

export type Tool = 'cursor' | 'dot' | 'arrowcursor' | 'eraser' | DrawingType;

interface DrawingState {
  drawings: Drawing[];
  activeTool: Tool;
  selectedId: string | null;
  defaultStyle: DStyle;
  magnet: boolean;
  stayInDrawing: boolean;   // keep tool active after finishing a drawing
  locked: boolean;          // lock all drawings
  hidden: boolean;          // hide all drawings
  pendingText: string | null; // preset text/emoji for the next placement

  setTool: (t: Tool, pendingText?: string | null) => void;
  consumePendingText: () => string | null;
  addDrawing: (d: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  select: (id: string | null) => void;
  clearAll: () => void;
  setStyle: (id: string, patch: Partial<DStyle>) => void;
  setDefaultStyle: (patch: Partial<DStyle>) => void;
  toggleMagnet: () => void;
  toggleStay: () => void;
  toggleLocked: () => void;
  toggleHidden: () => void;
  loadFor: (key: string) => void;   // load persisted drawings for a symbol+interval
  setDrawings: (drawings: Drawing[]) => void;  // bulk set (undo/redo, layouts)
}

let storageKey = 'draw:NIFTY:1D';
const persist = (drawings: Drawing[]) => {
  try { localStorage.setItem(storageKey, JSON.stringify(drawings)); } catch { /* ignore */ }
};

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawings: [],
  activeTool: 'cursor',
  selectedId: null,
  defaultStyle: { ...DEFAULT_STYLE },
  magnet: false,
  stayInDrawing: false,
  locked: false,
  hidden: false,
  pendingText: null,

  setTool: (t, pendingText = null) => set({ activeTool: t, pendingText, selectedId: t === 'cursor' ? get().selectedId : null }),
  consumePendingText: () => { const t = get().pendingText; set({ pendingText: null }); return t; },
  addDrawing: (d) => set((s) => { const arr = [...s.drawings, d]; persist(arr); return { drawings: arr, selectedId: d.id }; }),
  updateDrawing: (id, patch) => set((s) => {
    const arr = s.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d));
    persist(arr); return { drawings: arr };
  }),
  removeDrawing: (id) => set((s) => {
    const arr = s.drawings.filter((d) => d.id !== id);
    persist(arr); return { drawings: arr, selectedId: s.selectedId === id ? null : s.selectedId };
  }),
  select: (id) => set({ selectedId: id }),
  clearAll: () => set(() => { persist([]); return { drawings: [], selectedId: null }; }),
  setStyle: (id, patch) => set((s) => {
    const arr = s.drawings.map((d) => (d.id === id ? { ...d, style: { ...d.style, ...patch } } : d));
    persist(arr); return { drawings: arr };
  }),
  setDefaultStyle: (patch) => set((s) => ({ defaultStyle: { ...s.defaultStyle, ...patch } })),
  toggleMagnet: () => set((s) => ({ magnet: !s.magnet })),
  toggleStay: () => set((s) => ({ stayInDrawing: !s.stayInDrawing })),
  toggleLocked: () => set((s) => ({ locked: !s.locked })),
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),
  loadFor: (key) => {
    storageKey = `draw:${key}`;
    let arr: Drawing[] = [];
    try { arr = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { arr = []; }
    set({ drawings: arr, selectedId: null });
  },
  setDrawings: (drawings) => { persist(drawings); set({ drawings, selectedId: null }); },
}));
