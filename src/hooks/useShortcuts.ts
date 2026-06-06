import { useEffect, useRef } from 'react';
import { useDrawingStore, type Tool } from '../state/drawingStore';
import { useUiStore } from '../state/uiStore';
import { useHistoryStore } from '../state/historyStore';
import { useChartStore } from '../state/chartStore';
import { useChartBridge } from '../state/chartBridge';
import { useLayoutStore } from '../state/layoutStore';
import { useToastStore } from '../state/toastStore';
import type { Interval } from '../data/types';

// Single printable characters that are reserved for other actions and
// must NOT trigger the search bar.
const RESERVED_CHARS = new Set(['h', 'd', 'w', 'm']);
// Characters that map to drawing tool shortcuts via Alt — we open search for
// non-Alt presses of printable chars that aren't reserved or digits.
const DIGIT_CHARS = new Set(['0','1','2','3','4','5','6','7','8','9']);

// ── Alt + key → drawing tool ──────────────────────────────────────────────
const ALT_TOOL: Record<string, Tool> = {
  t: 'trendline',
  h: 'hline',
  r: 'ray',
  f: 'fib',
  c: 'rect',       // C for "Channel / Rectangle"
  a: 'arrow',
  x: 'text',
  l: 'longpos',
  s: 'shortpos',
  v: 'vline',
  e: 'ellipse',
  b: 'brush',
  p: 'pitchfork',
};

// ── Single-key letter → interval (no modifier) ────────────────────────────
const LETTER_INTERVAL: Record<string, Interval> = {
  d: '1D',
  w: '1W',
  m: '1M',
};

// ── Number buffer → interval (no modifier, e.g. "15" → 15m) ─────────────
const NUM_INTERVAL: Record<string, Interval> = {
  '1':  '1m',
  '3':  '3m',
  '5':  '5m',
  '15': '15m',
  '30': '30m',
  '60': '1H',
  '2':  '2H',
  '4':  '4H',
};

export function useShortcuts() {
  // Buffer for multi-digit number intervals ("1" → wait → "15m" or "1m")
  const numBuf  = useRef('');
  const numTimer = useRef<number | null>(null);

  useEffect(() => {
    const dispatch = (interval: Interval) => {
      useChartStore.getState().setInterval(interval);
    };

    const flushNum = () => {
      const buf = numBuf.current;
      numBuf.current = '';
      const iv = NUM_INTERVAL[buf];
      if (iv) dispatch(iv);
    };

    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const mod  = e.ctrlKey || e.metaKey;
      const key  = e.key;
      const klo  = key.toLowerCase();

      // ── Ctrl / Meta combos ───────────────────────────────────────────
      if (mod) {
        if (klo === 'z') {
          e.preventDefault();
          if (e.shiftKey) useHistoryStore.getState().redo();
          else             useHistoryStore.getState().undo();
          return;
        }
        if (klo === 'y') { e.preventDefault(); useHistoryStore.getState().redo(); return; }
        if (klo === 's') {
          e.preventDefault();
          useLayoutStore.getState().saveCurrent();
          useToastStore.getState().push('Layout saved');
          return;
        }
        if (klo === 'c' && !e.shiftKey) { e.preventDefault(); useDrawingStore.getState().copySelected(); return; }
        if (klo === 'v' && !e.shiftKey) { e.preventDefault(); useDrawingStore.getState().paste(); return; }
        if (klo === 'd') { e.preventDefault(); const id = useDrawingStore.getState().selectedId; if (id) useDrawingStore.getState().duplicateDrawing(id); return; }
        return;
      }

      // ── Alt + key → drawing tool ─────────────────────────────────────
      if (e.altKey) {
        e.preventDefault();
        if (ALT_TOOL[klo]) { useDrawingStore.getState().setTool(ALT_TOOL[klo]); return; }
        if (klo === 'i')   { useUiStore.getState().openIndicators(); return; }
        if (klo === 'w')   { useDrawingStore.getState().setTool('cursor'); return; }
        return;
      }

      // ── Single-key shortcuts (no modifier) ───────────────────────────

      // Escape: cancel draft / deselect
      if (key === 'Escape') {
        useDrawingStore.getState().setTool('cursor');
        useDrawingStore.getState().select(null);
        useDrawingStore.getState().clearMultiSelect();
        return;
      }

      // Delete / Backspace: remove selected drawing(s)
      if (key === 'Delete' || key === 'Backspace') {
        const st = useDrawingStore.getState();
        if (st.multiSelected.length > 0) { st.removeMultiSelected(); return; }
        if (st.selectedId) { st.removeDrawing(st.selectedId); }
        return;
      }

      // Space: switch to crosshair cursor
      if (key === ' ') { e.preventDefault(); useDrawingStore.getState().setTool('cursor'); return; }

      // H: reset chart view
      if (klo === 'h' && !e.shiftKey) {
        e.preventDefault();
        useChartBridge.getState().resetView?.();
        return;
      }

      // Letter interval shortcuts (d, w, m)
      if (LETTER_INTERVAL[klo] && !e.shiftKey) {
        e.preventDefault();
        dispatch(LETTER_INTERVAL[klo]);
        return;
      }

      // Numeric buffer for interval shortcuts (1→1m, 15→15m, 30→30m, 60→1H)
      if (/^\d$/.test(key)) {
        e.preventDefault();
        if (numTimer.current) { clearTimeout(numTimer.current); numTimer.current = null; }
        numBuf.current += key;
        const def = NUM_INTERVAL[numBuf.current];
        const canGrow = Object.keys(NUM_INTERVAL).some(
          (k) => k !== numBuf.current && k.startsWith(numBuf.current),
        );
        if (!canGrow && def) { flushNum(); return; }
        numTimer.current = window.setTimeout(flushNum, 500);
        return;
      }

      // Any other printable character (letters A-Z not reserved/handled above):
      // open the symbol search pre-filled with that character — TradingView behaviour.
      if (
        key.length === 1 &&
        !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey &&
        /^[a-zA-Z]$/.test(key) &&
        !RESERVED_CHARS.has(klo) &&
        !DIGIT_CHARS.has(key)
      ) {
        e.preventDefault();
        useUiStore.getState().openSearch(key.toUpperCase());
        return;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (numTimer.current) clearTimeout(numTimer.current);
    };
  }, []);
}
