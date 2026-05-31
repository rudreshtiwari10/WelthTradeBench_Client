import { useEffect } from 'react';
import { useDrawingStore, type Tool } from '../state/drawingStore';
import { useUiStore } from '../state/uiStore';
import { useHistoryStore } from '../state/historyStore';

// TradingView-style hotkeys (Alt + key) for drawing tools and dialogs.
const ALT_MAP: Record<string, Tool> = {
  t: 'trendline', h: 'hline', v: 'vline', f: 'fib', r: 'rect', e: 'ellipse', b: 'brush', a: 'arrow',
};

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useHistoryStore.getState().redo();
        else useHistoryStore.getState().undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); useHistoryStore.getState().redo(); return; }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (ALT_MAP[k]) { e.preventDefault(); useDrawingStore.getState().setTool(ALT_MAP[k]); }
        else if (k === 'i') { e.preventDefault(); useUiStore.getState().openIndicators(); }
        else if (k === 'w') { e.preventDefault(); useDrawingStore.getState().setTool('cursor'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
