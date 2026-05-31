import { useEffect, useRef, useState } from 'react';
import { useChartApi } from '../chart/ChartContext';
import { useDrawingStore, type Tool } from '../state/drawingStore';
import { renderDrawing, hitTest, handleHit, type Pt } from './geometry';
import { POINT_COUNT, type DPoint, type Drawing, type DrawingType } from './types';
import './DrawingLayer.css';

const CURSOR_TOOLS: Tool[] = ['cursor', 'dot', 'arrowcursor', 'eraser'];
const isDrawTool = (t: Tool): t is DrawingType => !CURSOR_TOOLS.includes(t);

let idSeq = 1;
const newId = () => `d${Date.now()}_${idSeq++}`;

export function DrawingLayer() {
  const { chartRef, seriesRef, candlesRef, ready } = useChartApi();
  const store = useDrawingStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [capture, setCapture] = useState(false);

  // Interaction state kept in refs (no re-render churn).
  const draft = useRef<{ type: DrawingType; points: DPoint[] } | null>(null);
  const cursorPt = useRef<DPoint | null>(null);
  const drag = useRef<{ id: string; handle: number; start: Pt; orig: DPoint[] } | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  // Keep latest store values for event handlers without re-binding listeners.
  const s = useRef(store); s.current = store;

  // ── coordinate conversion ────────────────────────────────────────────
  const toX = (logical: number): number | null => {
    const ts = chartRef.current?.timeScale();
    const x = ts?.logicalToCoordinate(logical as any);
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
          c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px';
          sizeRef.current = { w, h, dpr };
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        if (!s.current.hidden) {
          for (const d of s.current.drawings) {
            const pts = d.points.map(project).filter(Boolean) as Pt[];
            if (pts.length < d.points.length) continue;
            renderDrawing(ctx, d, pts, w, h, d.points.map((p) => p.price));
            if (d.id === s.current.selectedId) drawHandles(ctx, pts);
          }
        }
        // in-progress draft
        if (draft.current) {
          const pts = [...draft.current.points];
          if (cursorPt.current) pts.push(cursorPt.current);
          const screen = pts.map(project).filter(Boolean) as Pt[];
          if (screen.length >= 1) {
            const tmp: Drawing = { id: 'draft', type: draft.current.type, points: pts, style: s.current.defaultStyle };
            renderDrawing(ctx, tmp, screen, w, h, pts.map((p) => p.price));
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  function drawHandles(ctx: CanvasRenderingContext2D, pts: Pt[]) {
    ctx.save();
    for (const p of pts) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#2962ff'; ctx.stroke();
    }
    ctx.restore();
  }

  // ── hover → toggle capture so chart pans when not interacting ─────────
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const parent = c.parentElement!;
    const onParentMove = (e: MouseEvent) => {
      const tool = s.current.activeTool;
      if (isDrawTool(tool) || draft.current || drag.current) { setCapture(true); return; }
      // cursor family: capture only when hovering a drawing.
      const r = c.getBoundingClientRect();
      const m = { x: e.clientX - r.left, y: e.clientY - r.top };
      const hit = s.current.drawings.some((d) => {
        const pts = d.points.map(project).filter(Boolean) as Pt[];
        return pts.length === d.points.length && hitTest(d, pts, m, sizeRef.current.w, sizeRef.current.h);
      });
      setCapture(hit);
      parent.style.cursor = hit ? (tool === 'eraser' ? 'pointer' : 'move') : '';
    };
    parent.addEventListener('mousemove', onParentMove);
    return () => parent.removeEventListener('mousemove', onParentMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // ── pointer interaction on the (capturing) canvas ─────────────────────
  const onPointerDown = (e: React.PointerEvent) => {
    const tool = s.current.activeTool;
    const dp = unproject(e.clientX, e.clientY); if (!dp) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);

    if (isDrawTool(tool)) {
      if (tool === 'brush') { draft.current = { type: 'brush', points: [dp] }; return; }
      if (!draft.current) draft.current = { type: tool, points: [dp] };
      else draft.current.points.push(dp);
      const need = POINT_COUNT[tool];
      // need >= 1: fixed-point tools finish at their count. need < 0: polyline
      // (-2) waits for a double-click; brush (-1) handled above.
      if (need >= 1 && draft.current.points.length >= need) finishDraft();
      return;
    }

    // cursor family: select / drag / erase
    const r = canvasRef.current!.getBoundingClientRect();
    const m = { x: e.clientX - r.left, y: e.clientY - r.top };
    const w = sizeRef.current.w, h = sizeRef.current.h;
    // handle of currently-selected first
    const sel = s.current.drawings.find((d) => d.id === s.current.selectedId);
    if (sel && !s.current.locked) {
      const pts = sel.points.map(project).filter(Boolean) as Pt[];
      const hi = handleHit(pts, m);
      if (hi >= 0) { drag.current = { id: sel.id, handle: hi, start: m, orig: sel.points.map((p) => ({ ...p })) }; return; }
    }
    // hit any drawing
    for (let i = s.current.drawings.length - 1; i >= 0; i--) {
      const d = s.current.drawings[i];
      const pts = d.points.map(project).filter(Boolean) as Pt[];
      if (pts.length === d.points.length && hitTest(d, pts, m, w, h)) {
        if (tool === 'eraser') { s.current.removeDrawing(d.id); return; }
        s.current.select(d.id);
        if (!s.current.locked && !d.locked) drag.current = { id: d.id, handle: -1, start: m, orig: d.points.map((p) => ({ ...p })) };
        return;
      }
    }
    s.current.select(null);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const dp = unproject(e.clientX, e.clientY);
    if (!dp) return;
    if (draft.current) {
      if (draft.current.type === 'brush') draft.current.points.push(dp);
      else cursorPt.current = dp;
      return;
    }
    if (drag.current) {
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

  function finishDraft() {
    const d = draft.current; if (!d) return;
    const style = { ...s.current.defaultStyle };
    const preset = s.current.consumePendingText();
    let text: string | undefined = preset ?? undefined;
    if (text == null && (d.type === 'text' || d.type === 'callout')) {
      text = window.prompt('Text:', 'Text') || 'Text';
    }
    const drawing: Drawing = { id: newId(), type: d.type, points: d.points, style, text };
    s.current.addDrawing(drawing);
    draft.current = null; cursorPt.current = null;
    if (!s.current.stayInDrawing) s.current.setTool('cursor');
  }

  // Esc cancels draft; Delete removes selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { draft.current = null; cursorPt.current = null; s.current.setTool('cursor'); s.current.select(null); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && s.current.selectedId) {
        if (document.activeElement?.tagName !== 'INPUT') { s.current.removeDrawing(s.current.selectedId); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="draw-canvas"
      style={{ pointerEvents: capture ? 'auto' : 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => { if (draft.current && draft.current.type === 'polyline' && draft.current.points.length >= 2) finishDraft(); }}
    />
  );
}
