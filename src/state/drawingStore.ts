import { create } from 'zustand';
import { DEFAULT_STYLE, type Drawing, type DrawingType, type DStyle } from '../drawings/types';
import type { IconName } from '../icons/Icon';
import { apiFetch, isAuthenticated } from '../api/client';
import { usePanelId } from './PanelContext';
import { usePanelsStore } from './panelsStore';

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
  toolType?: string;   // tool this template was saved from (TradingView scopes per type)
}

/**
 * Drawings are kept per `${symbol}:${interval}` key, not in one flat array.
 * A drawing's `logical` point is a bar index — meaningless on a different
 * timeframe — so split-screen panels showing different symbols/intervals
 * must never share the same in-memory drawing set, or a line drawn on a
 * 1m chart ends up mis-projected onto a 5m chart's bar spacing.
 */

// ─── Persistence helpers (per key) ─────────────────────────────────────────

const syncTimers: Record<string, ReturnType<typeof setTimeout>> = {};

const syncToApi = (key: string, drawings: Drawing[]) => {
  if (syncTimers[key]) { clearTimeout(syncTimers[key]); }
  syncTimers[key] = setTimeout(() => {
    delete syncTimers[key];
    if (!isAuthenticated()) return;
    apiFetch('/api/drawings', {
      method: 'PUT',
      body: JSON.stringify({ key, drawings }),
    }).catch(console.error);
  }, 800);
};

const persist = (key: string, drawings: Drawing[]) => {
  try { localStorage.setItem(`draw:${key}`, JSON.stringify(drawings)); } catch { /* ignore */ }
  syncToApi(key, drawings);
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

// ─── Raw (per-key) state ────────────────────────────────────────────────────

interface RawDrawingState {
  // ── Global UI / tool state — shared across every panel ──
  activeTool: Tool;
  defaultStyle: DStyle;
  magnet: boolean;
  stayInDrawing: boolean;
  locked: boolean;
  hidden: boolean;
  pendingText: string | null;
  favorites: FavDef[];
  templates: StyleTemplate[];
  clipboard: Drawing | null;

  // ── Per-key drawing data — keyed by `${symbol}:${interval}` ──
  drawingsByKey: Record<string, Drawing[]>;
  selectedIdByKey: Record<string, string | null>;
  multiSelectedByKey: Record<string, string[]>;
  historyByKey: Record<string, Drawing[][]>;
  futureByKey: Record<string, Drawing[][]>;

  setTool: (t: Tool, pendingText?: string | null) => void;
  consumePendingText: () => string | null;
  toggleMagnet: () => void;
  toggleStay: () => void;
  toggleLocked: () => void;
  toggleHidden: () => void;

  addDrawing: (key: string, d: Drawing) => void;
  updateDrawing: (key: string, id: string, patch: Partial<Drawing>) => void;
  removeDrawing: (key: string, id: string) => void;
  removeMultiSelected: (key: string) => void;
  clearAll: (key: string) => void;

  pushHistory: (key: string) => void;
  undo: (key: string) => void;
  redo: (key: string) => void;

  select: (key: string, id: string | null) => void;
  addToMultiSelect: (key: string, id: string) => void;
  clearMultiSelect: (key: string) => void;

  setStyle: (key: string, id: string, patch: Partial<DStyle>) => void;
  setDefaultStyle: (patch: Partial<DStyle>) => void;

  toggleHideDrawing: (key: string, id: string) => void;
  renameDrawing: (key: string, id: string, name: string) => void;
  bringToFront: (key: string, id: string) => void;
  sendToBack: (key: string, id: string) => void;
  duplicateDrawing: (key: string, id: string) => void;

  copySelected: (key: string) => void;
  paste: (key: string) => void;

  toggleFavorite: (def: FavDef) => void;
  isFavorite: (label: string) => boolean;
  setFavorites: (favs: FavDef[]) => void;

  saveTemplate: (name: string, style: DStyle, toolType?: string) => void;
  applyTemplate: (key: string, id: string) => void;
  deleteTemplate: (id: string) => void;

  loadFor: (key: string) => void;
  setDrawings: (key: string, drawings: Drawing[]) => void;
}

let idSeq = 1;
const newId = () => `d${Date.now()}_${idSeq++}`;
const tmplId = () => `tmpl_${Date.now()}`;

// Deep-clone drawings for history (avoids aliasing issues)
const cloneDrawings = (arr: Drawing[]): Drawing[] =>
  arr.map((d) => ({ ...d, points: d.points.map((p) => ({ ...p })), style: { ...d.style } }));

const MAX_HISTORY = 50;

const drawingsOf = (s: RawDrawingState, key: string) => s.drawingsByKey[key] ?? [];
const historyOf  = (s: RawDrawingState, key: string) => s.historyByKey[key] ?? [];
const futureOf   = (s: RawDrawingState, key: string) => s.futureByKey[key] ?? [];

/** export for the few app-level (non-panel) consumers that need direct store access. */
export const useDrawingStoreRaw = create<RawDrawingState>((set, get) => ({
  activeTool: 'cursor',
  defaultStyle: { ...DEFAULT_STYLE },
  magnet: false,
  stayInDrawing: false,
  locked: false,
  hidden: false,
  pendingText: null,
  favorites: loadFavs(),
  templates: loadTmpls(),
  clipboard: null,

  drawingsByKey: {},
  selectedIdByKey: {},
  multiSelectedByKey: {},
  historyByKey: {},
  futureByKey: {},

  setTool: (t, pendingText = null) => set({ activeTool: t, pendingText }),
  consumePendingText: () => { const t = get().pendingText; set({ pendingText: null }); return t; },
  toggleMagnet: () => set((s) => ({ magnet: !s.magnet })),
  toggleStay:   () => set((s) => ({ stayInDrawing: !s.stayInDrawing })),
  toggleLocked: () => set((s) => ({ locked: !s.locked })),
  toggleHidden: () => set((s) => ({ hidden: !s.hidden })),

  addDrawing: (key, d) =>
    set((s) => {
      const arr = [...drawingsOf(s, key), d];
      persist(key, arr);
      return {
        drawingsByKey: { ...s.drawingsByKey, [key]: arr },
        selectedIdByKey: { ...s.selectedIdByKey, [key]: d.id },
        historyByKey: { ...s.historyByKey, [key]: [...historyOf(s, key).slice(-MAX_HISTORY + 1), cloneDrawings(drawingsOf(s, key))] },
        futureByKey: { ...s.futureByKey, [key]: [] },
      };
    }),

  // updateDrawing is called during drag — does NOT push history (caller uses pushHistory first)
  updateDrawing: (key, id, patch) =>
    set((s) => {
      const arr = drawingsOf(s, key).map((d) => (d.id === id ? { ...d, ...patch } : d));
      persist(key, arr);
      return { drawingsByKey: { ...s.drawingsByKey, [key]: arr } };
    }),

  removeDrawing: (key, id) =>
    set((s) => {
      const arr = drawingsOf(s, key).filter((d) => d.id !== id);
      persist(key, arr);
      return {
        drawingsByKey: { ...s.drawingsByKey, [key]: arr },
        selectedIdByKey: { ...s.selectedIdByKey, [key]: s.selectedIdByKey[key] === id ? null : s.selectedIdByKey[key] },
        historyByKey: { ...s.historyByKey, [key]: [...historyOf(s, key).slice(-MAX_HISTORY + 1), cloneDrawings(drawingsOf(s, key))] },
        futureByKey: { ...s.futureByKey, [key]: [] },
      };
    }),

  removeMultiSelected: (key) =>
    set((s) => {
      const ids = new Set([...(s.multiSelectedByKey[key] ?? []), ...(s.selectedIdByKey[key] ? [s.selectedIdByKey[key]!] : [])]);
      const arr = drawingsOf(s, key).filter((d) => !ids.has(d.id));
      persist(key, arr);
      return {
        drawingsByKey: { ...s.drawingsByKey, [key]: arr },
        selectedIdByKey: { ...s.selectedIdByKey, [key]: null },
        multiSelectedByKey: { ...s.multiSelectedByKey, [key]: [] },
        historyByKey: { ...s.historyByKey, [key]: [...historyOf(s, key).slice(-MAX_HISTORY + 1), cloneDrawings(drawingsOf(s, key))] },
        futureByKey: { ...s.futureByKey, [key]: [] },
      };
    }),

  clearAll: (key) => set((s) => {
    persist(key, []);
    return {
      drawingsByKey: { ...s.drawingsByKey, [key]: [] },
      selectedIdByKey: { ...s.selectedIdByKey, [key]: null },
      multiSelectedByKey: { ...s.multiSelectedByKey, [key]: [] },
      historyByKey: { ...s.historyByKey, [key]: [...historyOf(s, key).slice(-MAX_HISTORY + 1), cloneDrawings(drawingsOf(s, key))] },
      futureByKey: { ...s.futureByKey, [key]: [] },
    };
  }),

  pushHistory: (key) => set((s) => ({
    historyByKey: { ...s.historyByKey, [key]: [...historyOf(s, key).slice(-MAX_HISTORY + 1), cloneDrawings(drawingsOf(s, key))] },
    futureByKey: { ...s.futureByKey, [key]: [] },
  })),

  undo: (key) => set((s) => {
    const hist = historyOf(s, key);
    if (!hist.length) return {};
    const prev = hist[hist.length - 1];
    persist(key, prev);
    return {
      drawingsByKey: { ...s.drawingsByKey, [key]: prev },
      historyByKey: { ...s.historyByKey, [key]: hist.slice(0, -1) },
      futureByKey: { ...s.futureByKey, [key]: [cloneDrawings(drawingsOf(s, key)), ...futureOf(s, key).slice(0, MAX_HISTORY - 1)] },
      selectedIdByKey: { ...s.selectedIdByKey, [key]: null },
      multiSelectedByKey: { ...s.multiSelectedByKey, [key]: [] },
    };
  }),

  redo: (key) => set((s) => {
    const fut = futureOf(s, key);
    if (!fut.length) return {};
    const next = fut[0];
    persist(key, next);
    return {
      drawingsByKey: { ...s.drawingsByKey, [key]: next },
      historyByKey: { ...s.historyByKey, [key]: [...historyOf(s, key).slice(-MAX_HISTORY + 1), cloneDrawings(drawingsOf(s, key))] },
      futureByKey: { ...s.futureByKey, [key]: fut.slice(1) },
      selectedIdByKey: { ...s.selectedIdByKey, [key]: null },
      multiSelectedByKey: { ...s.multiSelectedByKey, [key]: [] },
    };
  }),

  select: (key, id) => set((s) => ({ selectedIdByKey: { ...s.selectedIdByKey, [key]: id } })),
  addToMultiSelect: (key, id) =>
    set((s) => {
      const cur = s.multiSelectedByKey[key] ?? [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      return { multiSelectedByKey: { ...s.multiSelectedByKey, [key]: next } };
    }),
  clearMultiSelect: (key) => set((s) => ({ multiSelectedByKey: { ...s.multiSelectedByKey, [key]: [] } })),

  setStyle: (key, id, patch) =>
    set((s) => {
      const arr = drawingsOf(s, key).map((d) => (d.id === id ? { ...d, style: { ...d.style, ...patch } } : d));
      persist(key, arr);
      return {
        drawingsByKey: { ...s.drawingsByKey, [key]: arr },
        historyByKey: { ...s.historyByKey, [key]: [...historyOf(s, key).slice(-MAX_HISTORY + 1), cloneDrawings(drawingsOf(s, key))] },
        futureByKey: { ...s.futureByKey, [key]: [] },
      };
    }),
  setDefaultStyle: (patch) => set((s) => ({ defaultStyle: { ...s.defaultStyle, ...patch } })),

  toggleHideDrawing: (key, id) =>
    set((s) => {
      const arr = drawingsOf(s, key).map((d) => (d.id === id ? { ...d, hidden: !d.hidden } : d));
      persist(key, arr);
      return { drawingsByKey: { ...s.drawingsByKey, [key]: arr } };
    }),

  renameDrawing: (key, id, name) =>
    set((s) => {
      const arr = drawingsOf(s, key).map((d) => (d.id === id ? { ...d, name } : d));
      persist(key, arr);
      return { drawingsByKey: { ...s.drawingsByKey, [key]: arr } };
    }),

  bringToFront: (key, id) =>
    set((s) => {
      const cur = drawingsOf(s, key);
      const d = cur.find((x) => x.id === id); if (!d) return {};
      const arr = [...cur.filter((x) => x.id !== id), d];
      persist(key, arr);
      return { drawingsByKey: { ...s.drawingsByKey, [key]: arr } };
    }),

  sendToBack: (key, id) =>
    set((s) => {
      const cur = drawingsOf(s, key);
      const d = cur.find((x) => x.id === id); if (!d) return {};
      const arr = [d, ...cur.filter((x) => x.id !== id)];
      persist(key, arr);
      return { drawingsByKey: { ...s.drawingsByKey, [key]: arr } };
    }),

  duplicateDrawing: (key, id) => {
    const cur = drawingsOf(get(), key);
    const d = cur.find((x) => x.id === id);
    if (!d) return;
    const copy: Drawing = {
      ...d,
      id: newId(),
      points: d.points.map((p) => ({ logical: p.logical + 3, price: p.price })),
      name: d.name ? `${d.name} copy` : undefined,
    };
    set((s) => {
      const arr = [...drawingsOf(s, key), copy];
      persist(key, arr);
      return { drawingsByKey: { ...s.drawingsByKey, [key]: arr }, selectedIdByKey: { ...s.selectedIdByKey, [key]: copy.id } };
    });
  },

  copySelected: (key) => {
    const s = get();
    const id = s.selectedIdByKey[key];
    if (!id) return;
    const d = drawingsOf(s, key).find((x) => x.id === id);
    if (d) set({ clipboard: { ...d, points: d.points.map((p) => ({ ...p })) } });
  },

  paste: (key) => {
    const cb = get().clipboard;
    if (!cb) return;
    const copy: Drawing = {
      ...cb,
      id: newId(),
      points: cb.points.map((p) => ({ logical: p.logical + 3, price: p.price * 1.001 })),
      locked: false,
    };
    set((s) => {
      const arr = [...drawingsOf(s, key), copy];
      persist(key, arr);
      return { drawingsByKey: { ...s.drawingsByKey, [key]: arr }, selectedIdByKey: { ...s.selectedIdByKey, [key]: copy.id } };
    });
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

  saveTemplate: (name, style, toolType) => {
    const t: StyleTemplate = { id: tmplId(), name, style: { ...style }, toolType };
    set((s) => { const arr = [...s.templates, t]; saveTmpls(arr); return { templates: arr }; });
  },

  applyTemplate: (key, templateId) => {
    const s = get();
    const t = s.templates.find((x) => x.id === templateId);
    const id = s.selectedIdByKey[key];
    if (!t || !id) return;
    s.setStyle(key, id, t.style);
  },

  deleteTemplate: (id) =>
    set((s) => { const arr = s.templates.filter((t) => t.id !== id); saveTmpls(arr); return { templates: arr }; }),

  loadFor: (key) => {
    let arr: Drawing[] = [];
    try { arr = JSON.parse(localStorage.getItem(`draw:${key}`) || '[]'); } catch { arr = []; }
    set((s) => ({
      drawingsByKey: { ...s.drawingsByKey, [key]: arr },
      selectedIdByKey: { ...s.selectedIdByKey, [key]: null },
      multiSelectedByKey: { ...s.multiSelectedByKey, [key]: [] },
    }));

    // Async: fetch from API (shows localStorage immediately, then overrides with server data)
    if (isAuthenticated()) {
      apiFetch(`/api/drawings?key=${encodeURIComponent(key)}`).then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const apiDrawings: Drawing[] = data.drawings || [];
        try { localStorage.setItem(`draw:${key}`, JSON.stringify(apiDrawings)); } catch { /* */ }
        set((s) => ({ drawingsByKey: { ...s.drawingsByKey, [key]: apiDrawings } }));
      }).catch(console.error);
    }
  },

  setDrawings: (key, drawings) => {
    persist(key, drawings);
    set((s) => ({ drawingsByKey: { ...s.drawingsByKey, [key]: drawings }, selectedIdByKey: { ...s.selectedIdByKey, [key]: null }, multiSelectedByKey: { ...s.multiSelectedByKey, [key]: [] } }));
  },
}));

// ─── Panel-key resolution helpers ──────────────────────────────────────────

const DEFAULT_KEY = 'NIFTY:1D';

/** The current panel's drawing key — for components rendered inside a ChartView/PanelProvider subtree. */
export function usePanelDrawingKey(): string {
  const panelId = usePanelId();
  return usePanelsStore((s) => {
    const p = s.panels.find((x) => x.id === panelId);
    return p ? `${p.symbol.symbol}:${p.interval}` : DEFAULT_KEY;
  });
}

/** The active panel's drawing key — for app-level (non-panel-scoped) components/hooks. */
export function useActiveDrawingKey(): string {
  return usePanelsStore((s) => {
    const p = s.panels.find((x) => x.id === s.activeId) ?? s.panels[0];
    return p ? `${p.symbol.symbol}:${p.interval}` : DEFAULT_KEY;
  });
}

/** Non-reactive lookup of the active panel's drawing key (event handlers, etc). */
export function getActiveDrawingKey(): string {
  const s = usePanelsStore.getState();
  const p = s.panels.find((x) => x.id === s.activeId) ?? s.panels[0];
  return p ? `${p.symbol.symbol}:${p.interval}` : DEFAULT_KEY;
}

// ─── Curried view — the public API every panel-scoped component already uses ──

export interface DrawingView {
  drawings: Drawing[];
  selectedId: string | null;
  multiSelected: string[];
  history: Drawing[][];
  future: Drawing[][];
  defaultStyle: DStyle;
  activeTool: Tool;
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

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

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

  saveTemplate: (name: string, style: DStyle, toolType?: string) => void;
  applyTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;

  loadFor: (key: string) => void;
  setDrawings: (drawings: Drawing[]) => void;
}

function buildView(key: string, raw: RawDrawingState): DrawingView {
  return {
    drawings: raw.drawingsByKey[key] ?? [],
    selectedId: raw.selectedIdByKey[key] ?? null,
    multiSelected: raw.multiSelectedByKey[key] ?? [],
    history: raw.historyByKey[key] ?? [],
    future: raw.futureByKey[key] ?? [],
    defaultStyle: raw.defaultStyle,
    activeTool: raw.activeTool,
    magnet: raw.magnet,
    stayInDrawing: raw.stayInDrawing,
    locked: raw.locked,
    hidden: raw.hidden,
    pendingText: raw.pendingText,
    favorites: raw.favorites,
    templates: raw.templates,
    clipboard: raw.clipboard,

    // Switching tools deselects this panel's current drawing (matches the old
    // single-store behavior of clearing selectedId on any non-cursor tool pick).
    setTool: (t, pendingText = null) => {
      raw.setTool(t, pendingText);
      if (t !== 'cursor') raw.select(key, null);
    },
    consumePendingText: raw.consumePendingText,
    toggleMagnet: raw.toggleMagnet,
    toggleStay: raw.toggleStay,
    toggleLocked: raw.toggleLocked,
    toggleHidden: raw.toggleHidden,
    setDefaultStyle: raw.setDefaultStyle,
    toggleFavorite: raw.toggleFavorite,
    isFavorite: raw.isFavorite,
    setFavorites: raw.setFavorites,
    saveTemplate: raw.saveTemplate,
    deleteTemplate: raw.deleteTemplate,
    loadFor: raw.loadFor,

    addDrawing: (d) => raw.addDrawing(key, d),
    updateDrawing: (id, patch) => raw.updateDrawing(key, id, patch),
    removeDrawing: (id) => raw.removeDrawing(key, id),
    removeMultiSelected: () => raw.removeMultiSelected(key),
    clearAll: () => raw.clearAll(key),
    pushHistory: () => raw.pushHistory(key),
    undo: () => raw.undo(key),
    redo: () => raw.redo(key),
    select: (id) => raw.select(key, id),
    addToMultiSelect: (id) => raw.addToMultiSelect(key, id),
    clearMultiSelect: () => raw.clearMultiSelect(key),
    setStyle: (id, patch) => raw.setStyle(key, id, patch),
    toggleHideDrawing: (id) => raw.toggleHideDrawing(key, id),
    renameDrawing: (id, name) => raw.renameDrawing(key, id, name),
    bringToFront: (id) => raw.bringToFront(key, id),
    sendToBack: (id) => raw.sendToBack(key, id),
    duplicateDrawing: (id) => raw.duplicateDrawing(key, id),
    copySelected: () => raw.copySelected(key),
    paste: () => raw.paste(key),
    applyTemplate: (id) => raw.applyTemplate(key, id),
    setDrawings: (drawings) => raw.setDrawings(key, drawings),
  };
}

/**
 * Drop-in replacement for the old flat-array hook. Components that render
 * inside a panel's tree (DrawingLayer, DrawingToolbarState, ObjectTree,
 * DrawingSettingsModal) keep calling this exactly as before — `drawings`,
 * `selectedId`, `addDrawing(d)`, etc. — and it now transparently resolves to
 * THIS panel's own symbol+interval slice instead of one shared global array.
 */
export function useDrawingStore<T = DrawingView>(selector?: (s: DrawingView) => T): T {
  const key = usePanelDrawingKey();
  const raw = useDrawingStoreRaw();
  const view = buildView(key, raw);
  return (selector ? selector(view) : view) as T;
}
