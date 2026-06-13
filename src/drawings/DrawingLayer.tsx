import { useEffect, useRef, useState } from 'react';
import { useChartApi } from '../chart/ChartContext';
import { useDrawingStore, type Tool } from '../state/drawingStore';
import { useUiStore } from '../state/uiStore';
import { useChartStore } from '../state/chartStore';
import { renderDrawing, renderHoverHighlight, hitTest, handleHit, type Pt } from './geometry';
import { POINT_COUNT, EW_LABELS, type DPoint, type Drawing, type DrawingType } from './types';
import { TOOL_GROUPS, groupTools } from './tools';
import { DrawingSettingsModal } from './DrawingSettingsModal';
import './DrawingLayer.css';

const EW_TYPES = new Set<DrawingType>(['ew_impulse','ew_correction','ew_triangle','ew_double','ew_triple']);

// Flat map from tool DrawingType → first matching ToolDef (for context menu favorites)
const _ALL_TOOL_DEFS = TOOL_GROUPS.flatMap((g) => groupTools(g));
const toolDefByType = (type: string) => _ALL_TOOL_DEFS.find((t) => t.tool === type);

const CURSOR_TOOLS: Tool[] = ['cursor', 'dot', 'arrowcursor', 'eraser'];
const isDrawTool = (t: Tool): t is DrawingType => !CURSOR_TOOLS.includes(t);

let idSeq = 1;
const newId = () => `d${Date.now()}_${idSeq++}`;

interface CtxMenu { x: number; y: number; drawingId: string }

export function DrawingLayer() {
  const { chartRef, seriesRef, candlesRef, ready } = useChartApi();
  const store = useDrawingStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capture, setCapture] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);
  // Inline text editor state: set when the user clicks with text/callout tool.
  const [textInput, setTextInput] = useState<{
    dp: DPoint; x: number; y: number; type: 'text' | 'callout';
  } | null>(null);
  // Ref so event handlers (which close over stale state) can read current value.
  const textInputRef = useRef(textInput);
  textInputRef.current = textInput;

  // Interaction state in refs — no re-render churn.
  const draft = useRef<{ type: DrawingType; points: DPoint[] } | null>(null);
  const cursorPt = useRef<DPoint | null>(null);
  const drag = useRef<{ id: string; handle: number; start: Pt; orig: DPoint[]; cloned?: boolean } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const shiftRef = useRef(false);
  const altRef = useRef(false);
  // Canvas-relative pixel position of the mouse — used to draw the TV-style crosshair
  const mousePx = useRef<Pt | null>(null);
  // ID of drawing currently under the mouse (for hover highlight)
  const hoveredId = useRef<string | null>(null);

  // Keep latest store values for event handlers without re-binding listeners.
  const s = useRef(store); s.current = store;

  // ── Shift-constrain helper ────────────────────────────────────────────
  // Snaps the cursor pixel to the nearest 45° from the anchor pixel.
  function constrainToAngle(anchorPx: Pt, cursorPx: Pt): Pt {
    const dx = cursorPx.x - anchorPx.x;
    const dy = cursorPx.y - anchorPx.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return cursorPx;
    const angle  = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return { x: anchorPx.x + dist * Math.cos(snapped), y: anchorPx.y + dist * Math.sin(snapped) };
  }

  // ── coordinate conversion ────────────────────────────────────────────
  const toX = (logical: number): number | null => {
    const x = chartRef.current?.timeScale().logicalToCoordinate(logical as any);
    return x == null ? null : x;
  };
  const toY = (price: number): number | null => {
    const y = seriesRef.current?.priceToCoordinate(price);
    return y == null ? null : y;
  };
  const project = (p: DPoint): Pt | null => {
    const x = toX(p.logical), y = toY(p.price);
    return x == null || y == null ? null : { x, y };
  };
  const unproject = (clientX: number, clientY: number): DPoint | null => {
    const c = canvasRef.current; if (!c) return null;
    const r = c.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const ts = chartRef.current?.timeScale();
    const logical = ts?.coordinateToLogical(x);
    let price = seriesRef.current?.coordinateToPrice(y as any) as number | undefined;
    if (logical == null || price == null) return null;
    if (s.current.magnet) {
      const idx = Math.round(logical as number);
      const bar = candlesRef.current[idx];
      if (bar) {
        const target = price;
        const cands = [bar.open, bar.high, bar.low, bar.close];
        price = cands.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
      }
    }
    return { logical: logical as number, price };
  };

  // ── render loop ──────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) {
        const parent = c.parentElement!;
        const dpr = window.devicePixelRatio || 1;
        const w = parent.clientWidth, h = parent.clientHeight;
        if (sizeRef.current.w !== w || sizeRef.current.h !== h || sizeRef.current.dpr !== dpr) {
          c.width = w * dpr; c.height = h * dpr;
          c.style.width = w + 'px'; c.style.height = h + 'px';
          sizeRef.current = { w, h, dpr };
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        if (!s.current.hidden) {
          const multiSet = new Set(s.current.multiSelected);
          const currentInterval = useChartStore.getState().interval;
          for (const d of s.current.drawings) {
            if (d.hidden) continue;                    // ← per-drawing hide
            // Timeframe visibility: if set, skip if current interval not included
            if (d.timeframeVisibility?.length && !d.timeframeVisibility.includes(currentInterval)) continue;
            const pts = d.points.map(project).filter(Boolean) as Pt[];
            if (pts.length < d.points.length) continue;
            // Hover highlight — subtle glow before the actual drawing
            if (d.id === hoveredId.current && d.id !== s.current.selectedId) {
              renderHoverHighlight(ctx, d, pts, w, h);
            }
            renderDrawing(ctx, d, pts, w, h, d.points.map((p) => p.price));
            const isSel = d.id === s.current.selectedId || multiSet.has(d.id);
            if (isSel) drawHandles(ctx, pts, d.locked);
          }
        }

        // In-progress draft
        if (draft.current) {
          const pts = [...draft.current.points];
          if (cursorPt.current) pts.push(cursorPt.current);
          const screen = pts.map(project).filter(Boolean) as Pt[];
          if (screen.length >= 1) {
            const tmp: Drawing = { id: 'draft', type: draft.current.type, points: pts, style: s.current.defaultStyle };
            renderDrawing(ctx, tmp, screen, w, h, pts.map((p) => p.price));
          }
        }

        // ── TradingView-style dotted crosshair cursor ─────────────────
        const mp = mousePx.current;
        if (mp && isDrawTool(s.current.activeTool)) {
          ctx.save();
          ctx.strokeStyle = 'rgba(201, 203, 211, 0.72)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(0, mp.y); ctx.lineTo(w, mp.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(mp.x, 0); ctx.lineTo(mp.x, h); ctx.stroke();
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.arc(mp.x, mp.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(201, 203, 211, 0.9)'; ctx.fill();

          // ── Elliott Wave step hint: show next label near cursor ──
          if (draft.current && EW_TYPES.has(draft.current.type as DrawingType)) {
            const ewLabels = EW_LABELS[draft.current.type] ?? [];
            const nextIdx  = draft.current.points.length;
            const nextLabel = ewLabels[nextIdx];
            const total     = POINT_COUNT[draft.current.type as DrawingType] ?? 0;
            if (nextLabel) {
              ctx.font = 'bold 13px sans-serif';
              const hint = `${nextLabel}  (${nextIdx}/${total - 1})`;
              const tw   = ctx.measureText(hint).width + 10;
              ctx.fillStyle = 'rgba(30,34,45,0.85)';
              ctx.beginPath();
              if ((ctx as any).roundRect) (ctx as any).roundRect(mp.x + 12, mp.y - 12, tw, 22, 4);
              else ctx.rect(mp.x + 12, mp.y - 12, tw, 22);
              ctx.fill();
              ctx.fillStyle = '#f0f3fa';
              ctx.textBaseline = 'middle';
              ctx.textAlign = 'left';
              ctx.fillText(hint, mp.x + 17, mp.y);
            }
          }

          ctx.restore();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function drawHandles(ctx: CanvasRenderingContext2D, pts: Pt[], locked?: boolean) {
    ctx.save();
    for (const p of pts) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = locked ? '#ff9800' : '#fff'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = locked ? '#ff9800' : '#2962ff'; ctx.stroke();
    }
    ctx.restore();
  }

  // ── hover → toggle canvas pointer-events ─────────────────────────────
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const parent = c.parentElement!;
    const onParentMove = (e: MouseEvent) => {
      shiftRef.current = e.shiftKey;
      altRef.current = e.altKey;
      const tool = s.current.activeTool;
      const r = c.getBoundingClientRect();
      // Always track for crosshair rendering
      mousePx.current = { x: e.clientX - r.left, y: e.clientY - r.top };

      if (isDrawTool(tool) || draft.current || drag.current) {
        setCapture(true);
        parent.style.cursor = 'none';   // canvas renders its own crosshair
        return;
      }
      const m = { x: e.clientX - r.left, y: e.clientY - r.top };
      let hitId: string | null = null;
      for (let i = s.current.drawings.length - 1; i >= 0; i--) {
        const d = s.current.drawings[i];
        if (d.hidden) continue;
        const pts = d.points.map(project).filter(Boolean) as Pt[];
        if (pts.length === d.points.length && hitTest(d, pts, m, sizeRef.current.w, sizeRef.current.h)) {
          hitId = d.id;
          break;
        }
      }
      hoveredId.current = hitId;
      setCapture(hitId !== null);
      parent.style.cursor = hitId ? (tool === 'eraser' ? 'pointer' : 'move') : '';
    };
    const onParentLeave = () => { mousePx.current = null; hoveredId.current = null; parent.style.cursor = ''; };
    parent.addEventListener('mousemove', onParentMove);
    parent.addEventListener('mouseleave', onParentLeave);
    return () => {
      parent.removeEventListener('mousemove', onParentMove);
      parent.removeEventListener('mouseleave', onParentLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ── pointer down: draw / select / drag ─────────────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    // If the inline text editor is open, let its onBlur commit/cancel it first.
    if (textInputRef.current) return;
    setCtxMenu(null);
    const tool = s.current.activeTool;
    const dp = unproject(e.clientX, e.clientY); if (!dp) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    // Drawing mode
    if (isDrawTool(tool)) {
      // ── Long/Short position: single click → immediate drawing ───────────
      // Defaults: SL = −1.5 % below entry (long) or +1.5 % above (short)
      //           TP = +3 %  above entry (long) or −3 %  below (short)
      // All 3 points share the same logical X so zones span the full canvas.
      // The user then drags the 3 handles to fine-tune levels.
      // ── Text / Callout: open inline editor at click position ────────────
      if (tool === 'text' || tool === 'callout') {
        const c = canvasRef.current; if (!c) return;
        const r = c.getBoundingClientRect();
        setTextInput({ dp, x: e.clientX - r.left, y: e.clientY - r.top, type: tool });
        e.preventDefault(); e.stopPropagation();
        return;
      }

      if (tool === 'longpos' || tool === 'shortpos') {
        const isLong  = tool === 'longpos';
        const entry   = dp.price;
        const slPrice = parseFloat((entry * (isLong ? 0.985 : 1.015)).toFixed(2));
        const tpPrice = parseFloat((entry * (isLong ? 1.030 : 0.970)).toFixed(2));
        const drawing: Drawing = {
          id: newId(),
          type: tool,
          points: [
            { logical: dp.logical, price: entry   },       // [0] entry
            { logical: dp.logical + 15, price: tpPrice },  // [1] target
            { logical: dp.logical + 15, price: slPrice },  // [2] stop
          ],
          style: { ...s.current.defaultStyle },
        };
        s.current.addDrawing(drawing);
        if (!s.current.stayInDrawing) s.current.setTool('cursor');
        return;
      }

      if (tool === 'brush') { draft.current = { type: 'brush', points: [dp] }; return; }
      if (!draft.current) draft.current = { type: tool, points: [dp] };
      else draft.current.points.push(dp);
      const need = POINT_COUNT[tool];
      if (need >= 1 && draft.current.points.length >= need) finishDraft();
      return;
    }

    // Cursor / select
    const r = canvasRef.current!.getBoundingClientRect();
    const m = { x: e.clientX - r.left, y: e.clientY - r.top };
    const w = sizeRef.current.w, h = sizeRef.current.h;

    // Handle drag on currently-selected drawing
    const sel = s.current.drawings.find((d) => d.id === s.current.selectedId);
    if (sel && !s.current.locked && !sel.locked) {
      const pts = sel.points.map(project).filter(Boolean) as Pt[];
      const hi = handleHit(pts, m);
      if (hi >= 0) {
        s.current.pushHistory();
        drag.current = { id: sel.id, handle: hi, start: m, orig: sel.points.map((p) => ({ ...p })) };
        return;
      }
    }

    // Hit any drawing
    for (let i = s.current.drawings.length - 1; i >= 0; i--) {
      const d = s.current.drawings[i];
      if (d.hidden) continue;
      const pts = d.points.map(project).filter(Boolean) as Pt[];
      if (pts.length === d.points.length && hitTest(d, pts, m, w, h)) {
        if (tool === 'eraser') { s.current.removeDrawing(d.id); return; }

        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          // Shift/Ctrl+click: multi-select
          s.current.addToMultiSelect(d.id);
          s.current.select(d.id);
          return;
        }

        s.current.select(d.id);
        s.current.clearMultiSelect();
        if (!s.current.locked && !d.locked) {
          s.current.pushHistory();
          drag.current = { id: d.id, handle: -1, start: m, orig: d.points.map((p) => ({ ...p })) };
        }
        return;
      }
    }
    s.current.select(null);
    s.current.clearMultiSelect();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    shiftRef.current = e.shiftKey;
    // Update canvas-relative mouse position for the crosshair renderer
    const c = canvasRef.current;
    if (c) {
      const r = c.getBoundingClientRect();
      mousePx.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    let dp = unproject(e.clientX, e.clientY); if (!dp) return;

    // ── Shift-constrain to 0° / 45° / 90° ────────────────────────────
    // Applies to two-point line tools when ≥ 1 point is already placed.
    const LINE_TOOLS: DrawingType[] = ['trendline', 'ray', 'extended', 'arrow', 'fib', 'fibext'];
    if (
      e.shiftKey &&
      draft.current &&
      draft.current.points.length >= 1 &&
      LINE_TOOLS.includes(draft.current.type)
    ) {
      const anchorPx = project(draft.current.points[0]);
      if (anchorPx && c) {
        const r = c.getBoundingClientRect();
        const rawPx = { x: e.clientX - r.left, y: e.clientY - r.top };
        const snapPx = constrainToAngle(anchorPx, rawPx);
        const snapped = unproject(snapPx.x + r.left, snapPx.y + r.top);
        if (snapped) dp = snapped;
      }
    }

    if (draft.current) {
      if (draft.current.type === 'brush') draft.current.points.push(dp);
      else cursorPt.current = dp;
      return;
    }
    if (drag.current) {
      // Alt+drag: clone the drawing on first move and drag the clone
      if (e.altKey && !drag.current.cloned && drag.current.handle < 0) {
        const orig = s.current.drawings.find((x) => x.id === drag.current!.id);
        if (orig) {
          const clone = { ...orig, id: newId(), points: orig.points.map((p) => ({ ...p })), locked: false };
          s.current.addDrawing(clone);
          drag.current = { ...drag.current, id: clone.id, cloned: true };
        }
      }
      const d = s.current.drawings.find((x) => x.id === drag.current!.id); if (!d) return;
      const r = canvasRef.current!.getBoundingClientRect();
      const m = { x: e.clientX - r.left, y: e.clientY - r.top };
      const startDp = unproject(drag.current.start.x + r.left, drag.current.start.y + r.top);
      if (drag.current.handle >= 0) {
        const pts = drag.current.orig.map((p) => ({ ...p }));
        pts[drag.current.handle] = dp;
        s.current.updateDrawing(d.id, { points: pts });
      } else if (startDp) {
        const dl = dp.logical - startDp.logical, dpr = dp.price - startDp.price;
        const pts = drag.current.orig.map((p) => ({ logical: p.logical + dl, price: p.price + dpr }));
        s.current.updateDrawing(d.id, { points: pts });
      }
    }
  };

  const onPointerUp = () => {
    if (draft.current?.type === 'brush' && draft.current.points.length > 1) finishDraft();
    drag.current = null;
  };

  // ── context menu on right-click ───────────────────────────────────────
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const r = canvasRef.current!.getBoundingClientRect();
    const m = { x: e.clientX - r.left, y: e.clientY - r.top };
    const w = sizeRef.current.w, h = sizeRef.current.h;
    for (let i = s.current.drawings.length - 1; i >= 0; i--) {
      const d = s.current.drawings[i];
      if (d.hidden) continue;
      const pts = d.points.map(project).filter(Boolean) as Pt[];
      if (pts.length === d.points.length && hitTest(d, pts, m, w, h)) {
        s.current.select(d.id);
        setCtxMenu({ x: e.clientX, y: e.clientY, drawingId: d.id });
        return;
      }
    }
  };

  // Commit an inline text/callout drawing from the floating editor.
  const commitText = (value: string) => {
    const ti = textInputRef.current; if (!ti) return;
    setTextInput(null);
    const trimmed = value.trim();
    if (!trimmed) { if (!s.current.stayInDrawing) s.current.setTool('cursor'); return; }
    const drawing: Drawing = {
      id: newId(), type: ti.type, points: [ti.dp],
      style: { ...s.current.defaultStyle }, text: trimmed,
    };
    s.current.addDrawing(drawing);
    if (!s.current.stayInDrawing) s.current.setTool('cursor');
  };

  function finishDraft() {
    const d = draft.current; if (!d) return;
    const style = { ...s.current.defaultStyle };
    const preset = s.current.consumePendingText();
    const text: string | undefined = preset ?? undefined;
    const drawing: Drawing = { id: newId(), type: d.type, points: d.points, style, text };
    s.current.addDrawing(drawing);
    draft.current = null; cursorPt.current = null;
    if (!s.current.stayInDrawing) s.current.setTool('cursor');
  }


  // ── keyboard shortcuts in layer context ──────────────────────────────
  const openDrawingSettings = useUiStore((ui) => ui.openDrawingSettings);
  useEffect(() => {
    // TradingView tool-activation key → DrawingType mapping
    const TOOL_KEYS: Record<string, Tool> = {
      l: 'trendline', h: 'hline', v: 'vline', t: 'text',
      r: 'rect', f: 'fib', m: 'measure', b: 'brush', p: 'pchannel',
    };
    const onKey = (e: KeyboardEvent) => {
      shiftRef.current = e.shiftKey;
      altRef.current = e.altKey;
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // Escape
      if (e.key === 'Escape') {
        if (textInputRef.current) { setTextInput(null); s.current.setTool('cursor'); return; }
        draft.current = null; cursorPt.current = null;
        s.current.setTool('cursor'); s.current.select(null); s.current.clearMultiSelect();
        setCtxMenu(null);
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.current.multiSelected.length > 0) { s.current.removeMultiSelected(); return; }
        if (s.current.selectedId) { s.current.removeDrawing(s.current.selectedId); }
        return;
      }

      // Ctrl / Meta combos
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); s.current.undo(); return; }
        if (e.key === 'z' && e.shiftKey)  { e.preventDefault(); s.current.redo(); return; }
        if (e.key === 'y')                { e.preventDefault(); s.current.redo(); return; }
        if (e.key === 'c')                { s.current.copySelected(); return; }
        if (e.key === 'v')                { s.current.paste(); return; }
        if (e.key === 'd') { e.preventDefault(); if (s.current.selectedId) s.current.duplicateDrawing(s.current.selectedId); return; }
        return;
      }

      // Tab / Shift+Tab: cycle through drawings
      if (e.key === 'Tab') {
        e.preventDefault();
        const drawings = s.current.drawings.filter((d) => !d.hidden);
        if (!drawings.length) return;
        const idx = drawings.findIndex((d) => d.id === s.current.selectedId);
        const next = e.shiftKey
          ? (idx <= 0 ? drawings.length - 1 : idx - 1)
          : (idx >= drawings.length - 1 ? 0 : idx + 1);
        s.current.select(drawings[next].id);
        return;
      }

      // Tool activation shortcuts (single letters, no modifier)
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool) { s.current.setTool(tool); return; }
    };
    const onKeyUp = (e: KeyboardEvent) => { shiftRef.current = e.shiftKey; altRef.current = e.altKey; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [openDrawingSettings]);

  const hasSelection = !!store.selectedId || store.multiSelected.length > 0;
  const drawingSettingsId = useUiStore((st) => st.drawingSettingsId);
  const closeDrawingSettings = useUiStore((st) => st.closeDrawingSettings);

  return (
    <>
      {/* Invisible backdrop: clears selection when the user clicks empty chart space
          while a drawing is selected. Only mounted when something is selected so it
          doesn't eat every chart click. */}
      {hasSelection && (
        <div
          className="draw-deselect-backdrop"
          onPointerDown={() => {
            s.current.select(null);
            s.current.clearMultiSelect();
          }}
        />
      )}
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        style={{ pointerEvents: capture ? 'auto' : 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        onDoubleClick={(e) => {
          if (draft.current?.type === 'polyline' && draft.current.points.length >= 2) { finishDraft(); return; }
          // Open settings modal for double-clicked drawing
          if (!isDrawTool(s.current.activeTool)) {
            const r = canvasRef.current!.getBoundingClientRect();
            const m = { x: e.clientX - r.left, y: e.clientY - r.top };
            for (let i = s.current.drawings.length - 1; i >= 0; i--) {
              const d = s.current.drawings[i];
              if (d.hidden) continue;
              const pts = d.points.map(project).filter(Boolean) as Pt[];
              if (pts.length === d.points.length && hitTest(d, pts, m, sizeRef.current.w, sizeRef.current.h)) {
                s.current.select(d.id);
                openDrawingSettings(d.id);
                return;
              }
            }
          }
        }}
      />

      {/* ── Context menu ── */}
      {ctxMenu && <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />}

      {/* ── Drawing settings modal (double-click or Settings button) ── */}
      {drawingSettingsId && <DrawingSettingsModal drawingId={drawingSettingsId} onClose={closeDrawingSettings} />}

      {/* ── Inline text / callout editor ── */}
      {textInput && (
        <input
          key={`${textInput.x}-${textInput.y}`}
          ref={(el) => { if (el) setTimeout(() => el.focus(), 10); }}
          className="draw-text-input"
          placeholder="Type text, Enter to confirm"
          style={{ left: textInput.x, top: textInput.y }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { commitText((e.target as HTMLInputElement).value); }
            if (e.key === 'Escape') { setTextInput(null); s.current.setTool('cursor'); }
          }}
          onBlur={(e) => commitText(e.target.value)}
        />
      )}
    </>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────

function ContextMenu({ menu, onClose }: { menu: CtxMenu; onClose: () => void }) {
  const { drawings, selectedId, updateDrawing, removeDrawing, duplicateDrawing,
    bringToFront, sendToBack, toggleHideDrawing, toggleFavorite, isFavorite } = useDrawingStore();
  const d = drawings.find((x) => x.id === menu.drawingId);
  if (!d) return null;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const el = document.getElementById('draw-ctx-menu');
      if (el && !el.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [onClose]);

  const act = (fn: () => void) => { fn(); onClose(); };

  return (
    <div
      id="draw-ctx-menu"
      className="draw-ctx-menu"
      style={{ left: menu.x, top: menu.y }}
    >
      {(d.type === 'text' || d.type === 'callout') && (
        <button className="ctx-item" onClick={() => act(() => {
          const t = window.prompt('Text:', d.text); if (t != null) updateDrawing(d.id, { text: t });
        })}>✏ Edit text</button>
      )}
      <button className="ctx-item" onClick={() => act(() => duplicateDrawing(d.id))}>⧉ Duplicate</button>
      <button className="ctx-item" onClick={() => act(() => updateDrawing(d.id, { locked: !d.locked }))}>
        {d.locked ? '🔓 Unlock' : '🔒 Lock'}
      </button>
      <button className="ctx-item" onClick={() => act(() => toggleHideDrawing(d.id))}>
        {d.hidden ? '👁 Show' : '🙈 Hide'}
      </button>
      <div className="ctx-sep" />
      <button className="ctx-item" onClick={() => act(() => bringToFront(d.id))}>↑ Bring to front</button>
      <button className="ctx-item" onClick={() => act(() => sendToBack(d.id))}>↓ Send to back</button>
      <div className="ctx-sep" />
      {(() => {
        const def = toolDefByType(d.type);
        if (!def) return null;
        const faved = isFavorite(def.label);
        return (
          <button className="ctx-item" onClick={() => act(() => toggleFavorite({ label: def.label, tool: def.tool, icon: def.icon, text: def.text }))}>
            {faved ? '★ Remove from favorites' : '☆ Add to favorites'}
          </button>
        );
      })()}
      <div className="ctx-sep" />
      <button className="ctx-item danger" onClick={() => act(() => removeDrawing(d.id))}>🗑 Delete</button>
    </div>
  );
}
