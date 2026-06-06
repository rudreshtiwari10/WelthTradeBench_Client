import { create } from 'zustand';
import { DEFAULT_STYLE, type Drawing, type DrawingType, type DStyle } from '../drawings/types';
import type { IconName } from '../icons/Icon';
import { apiFetch, isAuthenticated } from '../api/client';

export type Tool = 'cursor' | 'dot' | 'arrowcursor' | 'eraser' | DrawingType;

export interface FavDef {
  label: string;
  tool: Tool;
  icon: IconName;
  text?: string;
}

export interface StyleTemplate {
  id: string;
  name: string;
  style: DStyle;
}

// ─── Persistence helpers ──────────────────────────────────────────────────
let currentKey = 'NIFTY:1D';
let storageKey = 'draw:NIFTY:1D';

let syncTimer: ReturnType<typeof setTimeout> | null = null;

const syncToApi = (key: string, drawings: Drawing[]) => {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  syncTimer = setTimeout(() => {
    if (!isAuthenticated()) return;
    apiFetch('/api/drawings', {
      method: 'PUT',
      body: JSON.stringify({ key, drawings }),
    }).catch(console.error);
  }, 800);
};

const persist = (drawings: Drawing[]) => {
  try { localStorage.setItem(storageKey, JSON.stringify(drawings)); } catch { /* ignore */ }
  syncToApi(currentKey, drawings);
};

const FAV_KEY  = 'welthwest:drawFavorites';
const TMPL_KEY = 'welthwest:drawTemplates';

const loadFavs = (): FavDef[] => {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch { return []; }
};
const saveFavs = (f: FavDef[]) => {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch { /* */ }
};
const loadTmpls = (): StyleTemplate[] => {
  try { return JSON.parse(localStorage.getItem(TMPL_KEY) || '[]'); } catch { return []; }
};
const saveTmpls = (t: StyleTemplate[]) => {
  try { localStorage.setItem(TMPL_KEY, JSON.stringify(t)); } catch { /* */ }
};

// ─── State ────────────────────────────────────────────────────────────────
interface DrawingState {
  drawings: Drawing[];
  activeTool: Tool;
  selectedId: string | null;
  multiSelected: string[];
  defaultStyle: DStyle;
  magnet: boolean;
  stayInDrawing: boolean;
  locked: boolean;
  hidden: boolean;
  pendingText: string | null;
  favorites: FavDef[];
  templates: StyleTemplate[];
  clipboard: Drawing | null;

  setTool: (t: Tool, pendingText?: string | null) => void;
  consumePendingText: () => string | null;
  toggleMagnet: () => void;
  toggleStay: () => void;
  toggleLocked: () => void;
  toggleHidden: () => void;

  addDrawing: (d: Drawing) => void;
  updateDrawing: (id: string, patch: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  removeMultiSelected: () => void;
  clearAll: () => void;

  select: (id: string | null) => void;
  addToMultiSelect: (id: string) => void;
  clearMultiSelect: () => void;

  setStyle: (id: string, patch: Partial<DStyle>) => void;
  setDefaultStyle: (patch: Partial<DStyle>) => void;

  toggleHideDrawing: (id: string) => void;
  renameDrawing: (id: string, name: string) => void;
  bringToFront: (id: string) => void;
  sendToBack: (id: string) => void;
  duplicateDrawing: (id: string) => void;

  copySelected: () => void;
  paste: () => void;

  toggleFavorite: (def: FavDef) => void;
  isFavorite: (label: string) => boolean;
  setFavorites: (favs: FavDef[]) => void;

  saveTemplate: (name: string) => void;
  applyTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;

  loadFor: (key: string) => void;
  setDrawings: (drawings: Drawing[]) => void;
}

let idSeq = 1;
const newId = () => `d${Date.now()}_${idSeq++}`;
const tmplId = () => `tmpl_${Date.now()}`;

export const useDrawingStore = create<DrawingState>((set, get) => ({
  drawings: [],
  activeTool: 'cursor',
  selectedId: null,
  multiSelected: [],
  defaultStyle: { ...DEFAULT_STYLE },
  magnet: false,
  stayInDrawing: false,
  locked: false,
  hidden: false,
  pendingText: null,
  favorites: loadFavs(),
  templates: loadTmpls(),
  clipboard: null,

  setTool: (t, pendingText = null) =>
    set({ activeTool: t, pendingText, selectedId: t === 'cursor' ? get().selectedId : null }),
  consumePendingText: () => { const t = get().pendingText; set({ pendingText: null }); return t; },
  toggleMagnet: () => set((s) => ({ magnet: !s.magnet })),
  toggleStay:   () => set((s) => ({ stayInDrawing: !s.stayInDrawing })),
  toggleLocked: () => set((s) => ({ locked: !s.locked })),
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),

  addDrawing: (d) =>
    set((s) => { const arr = [...s.drawings, d]; persist(arr); return { drawings: arr, selectedId: d.id }; }),

  updateDrawing: (id, patch) =>
    set((s) => { const arr = s.drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)); persist(arr); return { drawings: arr }; }),

  removeDrawing: (id) =>
    set((s) => {
      const arr = s.drawings.filter((d) => d.id !== id);
      persist(arr);
      return { drawings: arr, selectedId: s.selectedId === id ? null : s.selectedId };
    }),

  removeMultiSelected: () =>
    set((s) => {
      const ids = new Set([...s.multiSelected, ...(s.selectedId ? [s.selectedId] : [])]);
      const arr = s.drawings.filter((d) => !ids.has(d.id));
      persist(arr);
      return { drawings: arr, selectedId: null, multiSelected: [] };
    }),

  clearAll: () => set(() => { persist([]); return { drawings: [], selectedId: null, multiSelected: [] }; }),

  select: (id) => set({ selectedId: id }),
  addToMultiSelect: (id) =>
    set((s) => ({ multiSelected: s.multiSelected.includes(id) ? s.multiSelected.filter((x) => x !== id) : [...s.multiSelected, id] })),
  clearMultiSelect: () => set({ multiSelected: [] }),

  setStyle: (id, patch) =>
    set((s) => { const arr = s.drawings.map((d) => (d.id === id ? { ...d, style: { ...d.style, ...patch } } : d)); persist(arr); return { drawings: arr }; }),
  setDefaultStyle: (patch) => set((s) => ({ defaultStyle: { ...s.defaultStyle, ...patch } })),

  toggleHideDrawing: (id) =>
    set((s) => { const arr = s.drawings.map((d) => (d.id === id ? { ...d, hidden: !d.hidden } : d)); persist(arr); return { drawings: arr }; }),

  renameDrawing: (id, name) =>
    set((s) => { const arr = s.drawings.map((d) => (d.id === id ? { ...d, name } : d)); persist(arr); return { drawings: arr }; }),

  bringToFront: (id) =>
    set((s) => { const d = s.drawings.find((x) => x.id === id); if (!d) return {}; const arr = [...s.drawings.filter((x) => x.id !== id), d]; persist(arr); return { drawings: arr }; }),

  sendToBack: (id) =>
    set((s) => { const d = s.drawings.find((x) => x.id === id); if (!d) return {}; const arr = [d, ...s.drawings.filter((x) => x.id !== id)]; persist(arr); return { drawings: arr }; }),

  duplicateDrawing: (id) => {
    const d = get().drawings.find((x) => x.id === id);
    if (!d) return;
    const copy: Drawing = {
      ...d,
      id: newId(),
      points: d.points.map((p) => ({ logical: p.logical + 3, price: p.price })),
      name: d.name ? `${d.name} copy` : undefined,
    };
    set((s) => { const arr = [...s.drawings, copy]; persist(arr); return { drawings: arr, selectedId: copy.id }; });
  },

  copySelected: () => {
    const id = get().selectedId;
    if (!id) return;
    const d = get().drawings.find((x) => x.id === id);
    if (d) set({ clipboard: { ...d, points: d.points.map((p) => ({ ...p })) } });
  },

  paste: () => {
    const cb = get().clipboard;
    if (!cb) return;
    const copy: Drawing = {
      ...cb,
      id: newId(),
      points: cb.points.map((p) => ({ logical: p.logical + 3, price: p.price * 1.001 })),
      locked: false,
    };
    set((s) => { const arr = [...s.drawings, copy]; persist(arr); return { drawings: arr, selectedId: copy.id }; });
  },

  toggleFavorite: (def) =>
    set((s) => {
      const exists = s.favorites.some((f) => f.label === def.label);
      const favs = exists ? s.favorites.filter((f) => f.label !== def.label) : [...s.favorites, def];
      saveFavs(favs);
      return { favorites: favs };
    }),
  isFavorite: (label) => get().favorites.some((f) => f.label === label),
  setFavorites: (favs) => { saveFavs(favs); set({ favorites: favs }); },

  saveTemplate: (name) => {
    const style = { ...get().defaultStyle };
    const t: StyleTemplate = { id: tmplId(), name, style };
    set((s) => { const arr = [...s.templates, t]; saveTmpls(arr); return { templates: arr }; });
  },

  applyTemplate: (templateId) => {
    const t = get().templates.find((x) => x.id === templateId);
    const id = get().selectedId;
    if (!t || !id) return;
    get().setStyle(id, t.style);
  },

  deleteTemplate: (id) =>
    set((s) => { const arr = s.templates.filter((t) => t.id !== id); saveTmpls(arr); return { templates: arr }; }),

  loadFor: (key) => {
    // Cancel any pending API sync from previous key
    if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }

    currentKey = key;
    storageKey = `draw:${key}`;
    let arr: Drawing[] = [];
    try { arr = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { arr = []; }
    set({ drawings: arr, selectedId: null, multiSelected: [] });

    // Async: fetch from API (shows localStorage immediately, then overrides with server data)
    if (isAuthenticated()) {
      apiFetch(`/api/drawings?key=${encodeURIComponent(key)}`).then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const apiDrawings: Drawing[] = data.drawings || [];
        try { localStorage.setItem(storageKey, JSON.stringify(apiDrawings)); } catch { /* */ }
        // Only update if this key is still active (user hasn't switched away)
        if (currentKey === key) {
          set({ drawings: apiDrawings, selectedId: null, multiSelected: [] });
        }
      }).catch(console.error);
    }
  },

  setDrawings: (drawings) => { persist(drawings); set({ drawings, selectedId: null, multiSelected: [] }); },
}));
