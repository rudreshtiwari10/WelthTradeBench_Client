import { FIB_COLORS, FIB_LEVELS, EW_LABELS, type Drawing, type DStyle } from './types';

export interface Pt { x: number; y: number; }

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function dash(ctx: CanvasRenderingContext2D, style: DStyle) {
  ctx.setLineDash(style.style === 'dashed' ? [6, 4] : style.style === 'dotted' ? [2, 3] : []);
}

function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Extend the segment a→b to the canvas bounds; `both` extends behind a too.
function extend(a: Pt, b: Pt, w: number, h: number, both: boolean): [Pt, Pt] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const far = (w + h) * 2;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const p2 = { x: b.x + ux * far, y: b.y + uy * far };
  const p1 = both ? { x: a.x - ux * far, y: a.y - uy * far } : a;
  return [p1, p2];
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, size: number) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(ang - Math.PI / 6), to.y - size * Math.sin(ang - Math.PI / 6));
  ctx.lineTo(to.x - size * Math.cos(ang + Math.PI / 6), to.y - size * Math.sin(ang + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

export function renderDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  w: number,
  h: number,
  prices: number[],
) {
  const s = d.style;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.fill;
  ctx.lineWidth = s.width;
  dash(ctx, s);
  const line = (a: Pt, b: Pt) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };

  switch (d.type) {
    case 'trendline': if (pts[1]) line(pts[0], pts[1]); break;
    case 'arrow':
      if (pts[1]) { line(pts[0], pts[1]); ctx.setLineDash([]); arrowHead(ctx, pts[0], pts[1], 12 + s.width * 2); }
      break;
    case 'ray': if (pts[1]) { const [a, b] = extend(pts[0], pts[1], w, h, false); line(a, b); } break;
    case 'extended': if (pts[1]) { const [a, b] = extend(pts[0], pts[1], w, h, true); line(a, b); } break;
    case 'hline': line({ x: 0, y: pts[0].y }, { x: w, y: pts[0].y }); priceTag(ctx, w, pts[0].y, prices[0], s); break;
    case 'hray': line(pts[0], { x: w, y: pts[0].y }); break;
    case 'vline': line({ x: pts[0].x, y: 0 }, { x: pts[0].x, y: h }); break;
    case 'rect':
    case 'measure':
      if (pts[1]) {
        const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
        const rw = Math.abs(pts[1].x - pts[0].x), rh = Math.abs(pts[1].y - pts[0].y);
        ctx.globalAlpha = s.fillOpacity; ctx.fillRect(x, y, rw, rh); ctx.globalAlpha = 1;
        ctx.strokeRect(x, y, rw, rh);
        if (d.type === 'measure') {
          const bars = Math.abs(Math.round((d.points[1]?.logical ?? 0) - (d.points[0]?.logical ?? 0)));
          measureLabel(ctx, pts[0], pts[1], prices, bars);
        }
      }
      break;
    case 'ellipse':
      if (pts[1]) {
        const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
        const rx = Math.abs(pts[1].x - pts[0].x) / 2, ry = Math.abs(pts[1].y - pts[0].y) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.globalAlpha = s.fillOpacity; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      }
      break;
    case 'fib': if (pts[1]) renderFib(ctx, pts[0], pts[1], prices, s); break;
    case 'fibext': if (pts[2]) renderFibExt(ctx, pts, prices, w); break;
    case 'triangle':
      if (pts[2]) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.closePath();
        ctx.globalAlpha = s.fillOpacity; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      } else if (pts[1]) line(pts[0], pts[1]);
      break;
    case 'gannfan': if (pts[1]) renderGannFan(ctx, pts[0], pts[1], w, h, s); break;
    case 'pitchfork': if (pts[2]) renderPitchfork(ctx, pts, w, h); break;
    case 'pchannel': if (pts[2]) renderChannel(ctx, pts, s); else if (pts[1]) line(pts[0], pts[1]); break;
    case 'pricerange': if (pts[1]) { const bars = Math.abs(Math.round((d.points[1]?.logical ?? 0) - (d.points[0]?.logical ?? 0))); renderPriceRange(ctx, pts[0], pts[1], prices, s, bars); } break;
    case 'flag': renderFlag(ctx, pts[0], s); break;
    case 'pricelabel': renderPriceLabel(ctx, pts[0], prices[0], s); break;
    case 'brush':
    case 'polyline':
      if (pts.length > 1) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      if (d.type === 'polyline') for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill(); }
      break;
    case 'ew_impulse':
    case 'ew_correction':
    case 'ew_triangle':
    case 'ew_double':
    case 'ew_triple':
      renderElliottWave(ctx, d.type, pts, s);
      break;
    case 'emoji':
      ctx.setLineDash([]); ctx.font = `${(d.style.fontSize || 14) * 1.6}px sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      ctx.fillText(d.text || '😀', pts[0].x, pts[0].y);
      break;
    case 'longpos':
    case 'shortpos':
      if (pts[2]) renderPosition(ctx, d.type, pts, prices, w);
      else if (pts[1]) line(pts[0], pts[1]);
      break;
    case 'text':
    case 'callout':
      ctx.setLineDash([]); ctx.fillStyle = s.textColor; ctx.font = `${s.fontSize}px var(--font, sans-serif)`;
      ctx.textBaseline = 'top';
      ctx.fillText(d.text || 'Text', pts[0].x + 4, pts[0].y);
      break;
  }
  ctx.restore();
}

// ── Elliott Wave renderer ─────────────────────────────────────────────────
function renderElliottWave(
  ctx: CanvasRenderingContext2D,
  type: string,
  pts: Pt[],
  s: DStyle,
) {
  if (pts.length < 2) return;
  const labels = EW_LABELS[type] ?? [];

  // Wave-number colours: odd waves (up legs in impulse) vs even (corrections)
  // For correction/triangle types, alternate colours
  const WAVE_COLORS: Record<string, string> = {
    '1': '#26a69a', '2': '#ef5350', '3': '#26a69a', '4': '#ef5350', '5': '#26a69a',
    'A': '#ef5350', 'B': '#26a69a', 'C': '#ef5350',
    'D': '#26a69a', 'E': '#ef5350',
    'W': '#26a69a', 'X': '#ef5350', 'Y': '#26a69a', 'Z': '#26a69a',
    '0': s.color,
  };

  ctx.save();
  ctx.lineWidth = s.width;
  ctx.setLineDash([]);

  // Draw segments with per-wave colour
  for (let i = 1; i < pts.length; i++) {
    const label = labels[i] ?? String(i);
    const wc = WAVE_COLORS[label] ?? s.color;
    ctx.strokeStyle = wc;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // Draw anchor dots and wave labels at each point
  ctx.font = 'bold 13px sans-serif';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const label = labels[i] ?? String(i);
    const wc = WAVE_COLORS[label] ?? s.color;

    // Dot
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = wc;
    ctx.fill();
    ctx.strokeStyle = '#131722';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label badge above/below the dot (above for odd indices, below for even)
    const above = i % 2 === 0;
    const bx = p.x;
    const by = above ? p.y - 16 : p.y + 16;

    const tw = ctx.measureText(label).width;
    const pw = tw + 8, ph = 16;
    ctx.fillStyle = wc;
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(bx - pw / 2, by - ph / 2, pw, ph, 3);
    } else {
      ctx.rect(bx - pw / 2, by - ph / 2, pw, ph);
    }
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(label, bx, by);
  }

  ctx.restore();
}

function priceTag(ctx: CanvasRenderingContext2D, w: number, y: number, price: number, s: DStyle) {
  const label = fmt(price);
  ctx.save(); ctx.setLineDash([]); ctx.font = '11px sans-serif';
  const tw = ctx.measureText(label).width + 10;
  ctx.fillStyle = s.color; ctx.fillRect(w - tw - 2, y - 9, tw, 18);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.fillText(label, w - tw + 3, y);
  ctx.restore();
}

function renderFib(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, prices: number[], s: DStyle) {
  const [pa, pb] = prices;
  const xL = Math.min(a.x, b.x), xR = Math.max(a.x, b.x);
  ctx.save(); ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
  let prevY: number | null = null;
  for (const lv of FIB_LEVELS) {
    const price = pa + (pb - pa) * lv;
    const y = a.y + (b.y - a.y) * lv;
    const c = FIB_COLORS[lv] || s.color;
    if (prevY != null) { ctx.globalAlpha = 0.06; ctx.fillStyle = c; ctx.fillRect(xL, Math.min(prevY, y), xR - xL, Math.abs(y - prevY)); ctx.globalAlpha = 1; }
    ctx.strokeStyle = c; ctx.setLineDash([]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xL, y); ctx.lineTo(xR, y); ctx.stroke();
    ctx.fillStyle = c; ctx.fillText(`${lv}  ${fmt(price)}`, xL + 4, y - 7);
    prevY = y;
  }
  ctx.restore();
}

// 3 anchors stored as (entry, target, stop) — all share the same logical X
// (the bar where the user clicked).  The rendered zones span the full canvas
// width, just like TradingView.
function renderPosition(
  ctx: CanvasRenderingContext2D,
  type: 'longpos' | 'shortpos',
  pts: Pt[],
  prices: number[],
  canvasW: number,
) {
  const [entry, target, stop] = pts;
  const [entryP, targetP, stopP] = prices;

  // Always span full canvas width so zones are visible even when the anchor
  // bar is at the edge of the visible range.
  const xL = 0;
  const xR = canvasW;

  const green = '#26a69a', red = '#ef5350';
  const profitColor = type === 'longpos' ? green : red;
  const lossColor   = type === 'longpos' ? red   : green;

  ctx.save();
  ctx.setLineDash([]);

  // Filled zones
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = profitColor;
  ctx.fillRect(xL, Math.min(entry.y, target.y), xR - xL, Math.abs(target.y - entry.y));
  ctx.fillStyle = lossColor;
  ctx.fillRect(xL, Math.min(entry.y, stop.y), xR - xL, Math.abs(stop.y - entry.y));
  ctx.globalAlpha = 1;

  // Dashed horizontal lines
  ctx.setLineDash([6, 4]);
  const levels: [Pt, string, string][] = [
    [entry,  '#2962ff',   'Entry'],
    [target, profitColor, 'Target'],
    [stop,   lossColor,   'Stop'],
  ];
  for (const [p, c] of levels) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xL, p.y);
    ctx.lineTo(xR, p.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Labels on the right edge (before price axis)
  const reward    = Math.abs(targetP - entryP);
  const risk      = Math.abs(entryP - stopP) || 1e-9;
  const rr        = reward / risk;
  const rewardPct = entryP ? ((targetP - entryP) / entryP) * 100 : 0;
  const riskPct   = entryP ? ((stopP   - entryP) / entryP) * 100 : 0;

  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const tag = (p: Pt, text: string, c: string) => {
    const tw = ctx.measureText(text).width + 12;
    const tx = xR - tw - 72;  // sit just left of the price scale
    if ((ctx as any).roundRect) {
      ctx.fillStyle = c;
      (ctx as any).roundRect(tx, p.y - 9, tw, 18, 3);
      ctx.fill();
    } else {
      ctx.fillStyle = c;
      ctx.fillRect(tx, p.y - 9, tw, 18);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(text, tx + 6, p.y);
  };

  tag(entry,  `Entry  ${fmt(entryP)}`,                                           '#2962ff');
  tag(target, `Target  ${fmt(targetP)}  (${rewardPct >= 0 ? '+' : ''}${rewardPct.toFixed(2)}%)`, profitColor);
  tag(stop,   `Stop  ${fmt(stopP)}  (${riskPct >= 0 ? '+' : ''}${riskPct.toFixed(2)}%)`,         lossColor);

  // R:R badge centred on the entry line
  const rrLabel = `R:R  1 : ${rr.toFixed(2)}`;
  ctx.textAlign = 'center';
  const cx  = xR / 2;
  const rtw = ctx.measureText(rrLabel).width + 14;
  ctx.fillStyle = 'rgba(15,18,30,0.92)';
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(cx - rtw / 2, entry.y - 10, rtw, 20, 4);
    ctx.fill();
  } else {
    ctx.fillRect(cx - rtw / 2, entry.y - 10, rtw, 20);
  }
  ctx.fillStyle = '#d1d4dc';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(rrLabel, cx, entry.y);

  ctx.restore();
}

function measureLabel(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, prices: number[], bars: number) {
  const dp = prices[1] - prices[0];
  const pct = prices[0] ? (dp / prices[0]) * 100 : 0;
  const up = dp >= 0;
  const l1 = `${up ? '+' : ''}${fmt(dp)} (${up ? '+' : ''}${pct.toFixed(2)}%)`;
  const l2 = `${bars} bar${bars === 1 ? '' : 's'}`;
  ctx.save(); ctx.setLineDash([]); ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 22;
  const tw = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 16;
  ctx.fillStyle = up ? 'rgba(38,166,154,0.95)' : 'rgba(239,83,80,0.95)';
  ctx.fillRect(mx - tw / 2, my - 4, tw, 34);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
  ctx.fillText(l1, mx, my + 6);
  ctx.fillText(l2, mx, my + 22);
  // direction arrow between the two points
  ctx.strokeStyle = up ? '#26a69a' : '#ef5350'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo((a.x + b.x) / 2, a.y); ctx.lineTo((a.x + b.x) / 2, b.y); ctx.stroke();
  arrowHead(ctx, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, 8);
  ctx.restore();
}

function renderFibExt(ctx: CanvasRenderingContext2D, pts: Pt[], prices: number[], w: number) {
  const [a, b, c] = pts;
  const range = prices[1] - prices[0];
  ctx.save(); ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
  ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeStyle = '#787b86';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  const xR = Math.max(c.x + 120, w);
  for (const lv of FIB_LEVELS) {
    const price = prices[2] + range * lv;
    const y = c.y + (b.y - a.y) * lv;
    const col = FIB_COLORS[lv] || '#2962ff';
    ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(c.x, y); ctx.lineTo(xR, y); ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(`${lv}  ${fmt(price)}`, c.x + 4, y - 7);
  }
  ctx.restore();
}

const GANN_RATIOS = [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8];
function renderGannFan(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, w: number, h: number, s: DStyle) {
  const dx = b.x - a.x, dy = b.y - a.y;
  ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = s.color; dash(ctx, s);
  const far = (w + h) * 2;
  for (const r of GANN_RATIOS) {
    const vx = dx, vy = dy * r;
    const len = Math.hypot(vx, vy) || 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x + (vx / len) * far, a.y + (vy / len) * far); ctx.stroke();
  }
  ctx.restore();
}

function renderPitchfork(ctx: CanvasRenderingContext2D, pts: Pt[], w: number, h: number) {
  const [a, b, c] = pts;
  const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  const dir = { x: mid.x - a.x, y: mid.y - a.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const far = (w + h) * 2;
  const ext = (p: Pt) => ({ x: p.x + (dir.x / len) * far, y: p.y + (dir.y / len) * far });
  ctx.save(); ctx.strokeStyle = '#2962ff'; ctx.lineWidth = 1.5;
  // handle line b-c
  ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  // median + two tines
  for (const p of [mid, b, c]) { const e = ext(p); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(e.x, e.y); ctx.stroke(); }
  ctx.restore();
}

function renderChannel(ctx: CanvasRenderingContext2D, pts: Pt[], s: DStyle) {
  const [a, b, c] = pts;
  // perpendicular offset of c from line a-b
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((c.x - a.x) * dx + (c.y - a.y) * dy) / len2;
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  const off = { x: c.x - proj.x, y: c.y - proj.y };
  const a2 = { x: a.x + off.x, y: a.y + off.y }, b2 = { x: b.x + off.x, y: b.y + off.y };
  ctx.save();
  ctx.globalAlpha = s.fillOpacity; ctx.fillStyle = s.color;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1; ctx.strokeStyle = s.color; ctx.lineWidth = s.width; dash(ctx, s);
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
  ctx.restore();
}

function renderPriceRange(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, prices: number[], s: DStyle, bars: number) {
  const dp = prices[1] - prices[0];
  const pct = prices[0] ? (dp / prices[0]) * 100 : 0;
  ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = s.color; ctx.fillStyle = s.color;
  ctx.globalAlpha = s.fillOpacity;
  ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  ctx.globalAlpha = 1;
  const mx = (a.x + b.x) / 2;
  ctx.beginPath(); ctx.moveTo(mx, a.y); ctx.lineTo(mx, b.y); ctx.stroke();
  const label = `${dp >= 0 ? '+' : ''}${fmt(dp)} (${pct.toFixed(2)}%)  ·  ${bars} bars`;
  ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width + 12;
  ctx.fillStyle = dp >= 0 ? '#26a69a' : '#ef5350'; ctx.fillRect(mx - tw / 2, (a.y + b.y) / 2 - 10, tw, 20);
  ctx.fillStyle = '#fff'; ctx.fillText(label, mx, (a.y + b.y) / 2);
  ctx.restore();
}

function renderFlag(ctx: CanvasRenderingContext2D, p: Pt, s: DStyle) {
  ctx.save(); ctx.setLineDash([]); ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.x, p.y - 22); ctx.lineTo(p.x + 16, p.y - 18); ctx.lineTo(p.x, p.y - 12); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function renderPriceLabel(ctx: CanvasRenderingContext2D, p: Pt, price: number, s: DStyle) {
  const label = fmt(price);
  ctx.save(); ctx.setLineDash([]); ctx.font = '12px sans-serif'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width + 14;
  ctx.fillStyle = s.color; ctx.beginPath();
  if ((ctx as any).roundRect) (ctx as any).roundRect(p.x, p.y - 11, tw, 22, 4); else ctx.rect(p.x, p.y - 11, tw, 22);
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 7, p.y); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillText(label, p.x + 7, p.y);
  ctx.restore();
}

// ── hit testing (screen space) ──────────────────────────────────────────
export function hitTest(d: Drawing, pts: Pt[], m: Pt, w: number, h: number): boolean {
  const tol = 6 + d.style.width;
  switch (d.type) {
    case 'trendline': case 'arrow': return pts[1] ? distToSeg(m.x, m.y, pts[0], pts[1]) < tol : false;
    case 'ray': { if (!pts[1]) return false; const [a, b] = extend(pts[0], pts[1], w, h, false); return distToSeg(m.x, m.y, a, b) < tol; }
    case 'extended': { if (!pts[1]) return false; const [a, b] = extend(pts[0], pts[1], w, h, true); return distToSeg(m.x, m.y, a, b) < tol; }
    case 'hline': case 'hray': return Math.abs(m.y - pts[0].y) < tol && (d.type === 'hline' || m.x >= pts[0].x - tol);
    case 'vline': return Math.abs(m.x - pts[0].x) < tol;
    case 'longpos': case 'shortpos': {
      // All 3 points share the same X, so test proximity to any of the
      // 3 horizontal price lines (entry, target, stop) across full width.
      if (pts.length < 2) return false;
      return pts.some((p) => Math.abs(m.y - p.y) < tol);
    }
    case 'rect': case 'measure': case 'fib': case 'pricerange':
    case 'triangle': case 'pchannel': case 'pitchfork': case 'fibext': case 'gannfan': {
      if (pts.length < 2) return false;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      const rw = Math.max(...xs) - x, rh = Math.max(...ys) - y;
      return m.x >= x - tol && m.x <= x + rw + tol && m.y >= y - tol && m.y <= y + rh + tol;
    }
    case 'flag': case 'pricelabel': return Math.abs(m.x - pts[0].x) < 30 && m.y > pts[0].y - 30 && m.y < pts[0].y + 12;
    case 'ellipse': {
      if (!pts[1]) return false;
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
      const rx = Math.abs(pts[1].x - pts[0].x) / 2 || 1, ry = Math.abs(pts[1].y - pts[0].y) / 2 || 1;
      const v = ((m.x - cx) ** 2) / (rx * rx) + ((m.y - cy) ** 2) / (ry * ry);
      return v > 0.7 && v < 1.4;
    }
    case 'brush': case 'polyline':
    case 'ew_impulse': case 'ew_correction': case 'ew_triangle': case 'ew_double': case 'ew_triple':
      { for (let i = 1; i < pts.length; i++) if (distToSeg(m.x, m.y, pts[i - 1], pts[i]) < tol) return true; return false; }
    case 'text': case 'callout': return Math.abs(m.x - pts[0].x) < 60 && Math.abs(m.y - pts[0].y) < 16;
    case 'emoji': return Math.hypot(m.x - pts[0].x, m.y - pts[0].y) < 18;
  }
  return false;
}

export function handleHit(pts: Pt[], m: Pt): number {
  for (let i = 0; i < pts.length; i++) if (Math.hypot(m.x - pts[i].x, m.y - pts[i].y) < 8) return i;
  return -1;
}
