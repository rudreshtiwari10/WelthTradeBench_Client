// Renderers for the long-tail drawing tools (trend/fib/gann variants, patterns,
// cycles, forecasts and extra shapes). Kept out of geometry.ts to keep that file
// focused on the core tools. Dispatched from renderDrawing() via renderExtra().
import type { Drawing, DStyle } from './types';
import type { Pt, RenderEnv } from './geometry';
import { extend, distToSeg } from './geometry';

export const EXTRA_TYPES = new Set<Drawing['type']>([
  'infoline', 'trendangle', 'crossline', 'regression', 'flatchannel', 'disjoint',
  'schiff', 'modschiff', 'inside',
  'fibchannel', 'fibtimezone', 'fibtime', 'fibfan', 'fibarcs', 'fibcircles',
  'gannbox', 'gannsquare',
  'cypher', 'hns', 'abcd', 'threedrives', 'cyclic', 'sine', 'timecycles',
  'forecast', 'barpattern', 'ghostfeed', 'sector', 'daterange',
  'circle', 'rotrect', 'arc', 'curve', 'arrowup', 'arrowdown',
]);

const FIB = [0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_TIME = [1, 2, 3, 5, 8, 13, 21, 34];
const fmtN = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function dash(ctx: CanvasRenderingContext2D, s: DStyle) {
  ctx.setLineDash(s.style === 'dashed' ? [6, 4] : s.style === 'dotted' ? [2, 3] : []);
}
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
function seg(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}
function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, bg: string, fg = '#fff') {
  ctx.save(); ctx.setLineDash([]); ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = bg; ctx.fillRect(x, y - 9, w, 18);
  ctx.fillStyle = fg; ctx.fillText(text, x + 5, y); ctx.restore();
}
function dot(ctx: CanvasRenderingContext2D, p: Pt, c: string) {
  ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill();
}

// Deterministic small PRNG (mulberry32) for ghost-feed synthetic candles.
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function renderExtra(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  w: number,
  h: number,
  prices: number[],
  env?: RenderEnv,
) {
  const s = d.style;
  ctx.save();
  if (s.opacity != null && s.opacity < 1) ctx.globalAlpha = s.opacity;
  ctx.strokeStyle = s.color; ctx.fillStyle = s.fill; ctx.lineWidth = s.width || 2;
  dash(ctx, s);
  const logicals = d.points.map((p) => p.logical);

  switch (d.type) {
    // ── Trend variants ──────────────────────────────────────────────────
    case 'infoline': {
      if (!pts[1]) break;
      seg(ctx, pts[0], pts[1]);
      const dP = (prices[1] ?? 0) - (prices[0] ?? 0);
      const pct = prices[0] ? (dP / prices[0]) * 100 : 0;
      const bars = Math.abs(Math.round((logicals[1] ?? 0) - (logicals[0] ?? 0)));
      const m = mid(pts[0], pts[1]);
      tag(ctx, m.x + 6, m.y, `${dP >= 0 ? '+' : ''}${fmtN(dP)} (${pct.toFixed(2)}%) · ${bars} bars`, s.color);
      break;
    }
    case 'trendangle': {
      if (!pts[1]) break;
      seg(ctx, pts[0], pts[1]);
      const ang = Math.atan2(-(pts[1].y - pts[0].y), pts[1].x - pts[0].x) * 180 / Math.PI;
      ctx.setLineDash([]); ctx.strokeStyle = s.color; ctx.globalAlpha = (s.opacity ?? 1) * 0.5;
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 28, 0, -Math.atan2(-(pts[1].y - pts[0].y), pts[1].x - pts[0].x), ang < 0);
      ctx.stroke(); ctx.globalAlpha = s.opacity ?? 1;
      tag(ctx, pts[0].x + 32, pts[0].y - 14, `${ang.toFixed(1)}°`, s.color);
      break;
    }
    case 'crossline': {
      ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(w, pts[0].y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pts[0].x, 0); ctx.lineTo(pts[0].x, h); ctx.stroke();
      break;
    }
    case 'regression': {
      if (!env || !pts[1]) break;
      regressionChannel(ctx, d, env, s);
      break;
    }
    case 'flatchannel': {
      if (!pts[1]) { if (pts[0] && pts[1]) seg(ctx, pts[0], pts[1]); break; }
      seg(ctx, pts[0], pts[1]);
      if (pts[2]) {
        const yFlat = pts[2].y;
        ctx.globalAlpha = (s.opacity ?? 1) * s.fillOpacity;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[1].x, yFlat); ctx.lineTo(pts[0].x, yFlat); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = s.opacity ?? 1;
        ctx.beginPath(); ctx.moveTo(pts[0].x, yFlat); ctx.lineTo(pts[1].x, yFlat); ctx.stroke();
      }
      break;
    }
    case 'disjoint': {
      if (pts[1]) seg(ctx, pts[0], pts[1]);
      if (pts[3]) {
        seg(ctx, pts[2], pts[3]);
        ctx.globalAlpha = (s.opacity ?? 1) * s.fillOpacity;
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
        ctx.lineTo(pts[3].x, pts[3].y); ctx.lineTo(pts[2].x, pts[2].y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = s.opacity ?? 1;
      } else if (pts[2]) seg(ctx, pts[1], pts[2]);
      break;
    }
    case 'schiff': case 'modschiff': case 'inside': {
      if (!pts[2]) { if (pts[1]) seg(ctx, pts[0], pts[1]); break; }
      pitchforkVariant(ctx, d.type, pts, w, h, s);
      break;
    }

    // ── Fib / Gann variants ──────────────────────────────────────────────
    case 'fibchannel': {
      if (!pts[1]) break;
      const dir = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
      const off = pts[2] ? { x: pts[2].x - pts[0].x, y: pts[2].y - pts[0].y } : { x: 0, y: 40 };
      ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle';
      for (const f of [0, ...FIB]) {
        const a = { x: pts[0].x + off.x * f, y: pts[0].y + off.y * f };
        const b = { x: a.x + dir.x, y: a.y + dir.y };
        const [ea, eb] = extend(a, b, w, h, true);
        ctx.globalAlpha = (s.opacity ?? 1) * (f === 0 || f === 1 ? 1 : 0.7);
        seg(ctx, ea, eb);
        ctx.fillStyle = s.color; ctx.fillText(f.toString(), b.x - 26, b.y - 7);
      }
      ctx.globalAlpha = s.opacity ?? 1;
      break;
    }
    case 'fibtimezone': case 'fibtime': {
      if (!env || !pts[1]) break;
      const base = (logicals[1] - logicals[0]);
      ctx.font = '10px sans-serif'; ctx.textBaseline = 'top';
      for (const m of [0, ...FIB_TIME]) {
        const lx = env.toX(logicals[0] + base * m);
        if (lx == null) continue;
        ctx.globalAlpha = (s.opacity ?? 1) * 0.85;
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke();
        ctx.fillStyle = s.color; ctx.fillText(String(m), lx + 3, 4);
      }
      ctx.globalAlpha = s.opacity ?? 1;
      break;
    }
    case 'fibfan': {
      if (!pts[1]) break;
      ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle';
      for (const f of [0, ...FIB]) {
        const yl = pts[0].y + (pts[1].y - pts[0].y) * f;
        ctx.globalAlpha = (s.opacity ?? 1) * (f === 0 || f === 1 ? 1 : 0.7);
        seg(ctx, pts[0], { x: pts[1].x, y: yl });
        ctx.fillStyle = s.color; ctx.fillText(f.toString(), pts[1].x + 3, yl);
      }
      ctx.globalAlpha = s.opacity ?? 1;
      break;
    }
    case 'fibarcs': case 'fibcircles': {
      if (!pts[1]) break;
      const c = pts[0];
      const rx = Math.abs(pts[1].x - pts[0].x) || 1, ry = Math.abs(pts[1].y - pts[0].y) || 1;
      ctx.font = '10px sans-serif'; ctx.textBaseline = 'middle';
      const full = d.type === 'fibcircles';
      for (const f of FIB) {
        ctx.globalAlpha = (s.opacity ?? 1) * 0.8;
        ctx.beginPath();
        if (full) ctx.ellipse(c.x, c.y, rx * f, ry * f, 0, 0, Math.PI * 2);
        else ctx.ellipse(c.x, c.y, rx * f, ry * f, 0, Math.PI, Math.PI * 2); // upper arc
        ctx.stroke();
        ctx.fillStyle = s.color; ctx.fillText(f.toString(), c.x + rx * f + 2, c.y);
      }
      ctx.globalAlpha = s.opacity ?? 1;
      break;
    }
    case 'gannbox': case 'gannsquare': {
      if (!pts[1]) break;
      const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
      const bw = Math.abs(pts[1].x - pts[0].x), bh = Math.abs(pts[1].y - pts[0].y);
      ctx.strokeRect(x, y, bw, bh);
      const fr = [0.25, 0.382, 0.5, 0.618, 0.75];
      ctx.globalAlpha = (s.opacity ?? 1) * 0.45;
      for (const f of fr) {
        ctx.beginPath(); ctx.moveTo(x + bw * f, y); ctx.lineTo(x + bw * f, y + bh); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y + bh * f); ctx.lineTo(x + bw, y + bh * f); ctx.stroke();
      }
      ctx.globalAlpha = s.opacity ?? 1; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(x, y + bh); ctx.lineTo(x + bw, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + bw, y + bh); ctx.stroke();
      break;
    }

    // ── Patterns / cycles ────────────────────────────────────────────────
    case 'cypher': labeledPattern(ctx, pts, ['X', 'A', 'B', 'C', 'D'], s); break;
    case 'abcd':   labeledPattern(ctx, pts, ['A', 'B', 'C', 'D'], s); break;
    case 'hns':    labeledPattern(ctx, pts, ['', 'LS', '', 'H', '', 'RS'], s); break;
    case 'threedrives': labeledPattern(ctx, pts, ['', '1', '2', '3', '4', '5'], s); break;
    case 'cyclic': {
      if (!env || !pts[1]) break;
      const span = logicals[1] - logicals[0];
      if (Math.abs(span) < 0.001) break;
      for (let k = 0; k < 60; k++) {
        const lx = env.toX(logicals[0] + span * k);
        if (lx == null) break;
        if (lx > w + 5) break;
        if (lx < -5) continue;
        ctx.globalAlpha = (s.opacity ?? 1) * (k === 0 ? 1 : 0.6);
        ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke();
      }
      ctx.globalAlpha = s.opacity ?? 1;
      break;
    }
    case 'sine': {
      if (!pts[1]) break;
      const x0 = pts[0].x, x1 = pts[1].x;
      const amp = (pts[1].y - pts[0].y) / 2, m0 = (pts[0].y + pts[1].y) / 2;
      const wl = (x1 - x0) || 1;
      ctx.beginPath();
      const stepN = 120;
      for (let i = 0; i <= stepN; i++) {
        const x = x0 + (wl) * (i / stepN);
        const y = m0 + amp * Math.sin((i / stepN) * Math.PI * 4); // 2 full waves
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case 'timecycles': {
      if (!pts[1]) break;
      const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1;
      for (let k = 1; k <= 8; k++) {
        ctx.globalAlpha = (s.opacity ?? 1) * 0.7;
        ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, r * k, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = s.opacity ?? 1;
      break;
    }

    // ── Forecast / projection / shapes ───────────────────────────────────
    case 'forecast': {
      if (!pts[1]) break;
      seg(ctx, pts[0], pts[1]);
      if (pts[2]) {
        ctx.setLineDash([6, 4]);
        seg(ctx, pts[1], pts[2]);
        ctx.setLineDash([]);
        ctx.globalAlpha = (s.opacity ?? 1) * (s.fillOpacity || 0.12);
        ctx.beginPath(); ctx.moveTo(pts[1].x, pts[1].y); ctx.lineTo(pts[2].x, pts[2].y);
        ctx.lineTo(pts[2].x, pts[1].y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = s.opacity ?? 1;
        dot(ctx, pts[2], s.color);
        tag(ctx, pts[2].x + 6, pts[2].y, `target ${fmtN(prices[2] ?? 0)}`, s.color);
      }
      break;
    }
    case 'barpattern': { if (env && pts[1]) projectedBars(ctx, d, env, false); break; }
    case 'ghostfeed':  { if (env && pts[1]) projectedBars(ctx, d, env, true); break; }
    case 'sector': {
      if (!pts[1]) break;
      const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const a0 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      const a1 = pts[2] ? Math.atan2(pts[2].y - pts[0].y, pts[2].x - pts[0].x) : a0 + 0.6;
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      ctx.arc(pts[0].x, pts[0].y, r, a0, a1, a1 < a0); ctx.closePath();
      ctx.globalAlpha = (s.opacity ?? 1) * s.fillOpacity; ctx.fill();
      ctx.globalAlpha = s.opacity ?? 1; ctx.stroke();
      const deg = Math.abs((a1 - a0) * 180 / Math.PI);
      tag(ctx, pts[0].x + 6, pts[0].y - 14, `${deg.toFixed(1)}°`, s.color);
      break;
    }
    case 'daterange': {
      if (!pts[1]) break;
      const y = Math.max(pts[0].y, pts[1].y);
      const xL = Math.min(pts[0].x, pts[1].x), xR = Math.max(pts[0].x, pts[1].x);
      ctx.beginPath(); ctx.moveTo(xL, y); ctx.lineTo(xR, y); ctx.stroke();
      for (const x of [xL, xR]) { ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke(); }
      const bars = Math.abs(Math.round(logicals[1] - logicals[0]));
      let dur = `${bars} bars`;
      if (env) {
        const c0 = env.candles[Math.round(logicals[0])], c1 = env.candles[Math.round(logicals[1])];
        if (c0 && c1) {
          const days = Math.abs(c1.time - c0.time) / 86400;
          dur = days >= 1 ? `${bars} bars · ${days.toFixed(days < 10 ? 1 : 0)}d` : `${bars} bars · ${(Math.abs(c1.time - c0.time) / 3600).toFixed(1)}h`;
        }
      }
      tag(ctx, (xL + xR) / 2 - 30, y - 16, dur, s.color);
      break;
    }
    case 'circle': {
      if (!pts[1]) break;
      const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, r, 0, Math.PI * 2);
      ctx.globalAlpha = (s.opacity ?? 1) * s.fillOpacity; ctx.fill();
      ctx.globalAlpha = s.opacity ?? 1; ctx.stroke();
      break;
    }
    case 'rotrect': {
      if (!pts[1]) break;
      if (!pts[2]) { seg(ctx, pts[0], pts[1]); break; }
      const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      // perpendicular distance from p2 to the p0-p1 line
      const t = (pts[2].x - pts[0].x) * nx + (pts[2].y - pts[0].y) * ny;
      const ox = nx * t, oy = ny * t;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
      ctx.lineTo(pts[1].x + ox, pts[1].y + oy); ctx.lineTo(pts[0].x + ox, pts[0].y + oy);
      ctx.closePath();
      ctx.globalAlpha = (s.opacity ?? 1) * s.fillOpacity; ctx.fill();
      ctx.globalAlpha = s.opacity ?? 1; ctx.stroke();
      break;
    }
    case 'arc': {
      if (!pts[2]) { if (pts[1]) seg(ctx, pts[0], pts[1]); break; }
      const a = arcThrough(pts[0], pts[1], pts[2]);
      ctx.beginPath();
      if (a) ctx.arc(a.cx, a.cy, a.r, a.start, a.end, a.ccw);
      else { ctx.moveTo(pts[0].x, pts[0].y); ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y); }
      ctx.stroke();
      break;
    }
    case 'curve': {
      if (!pts[2]) { if (pts[1]) seg(ctx, pts[0], pts[1]); break; }
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      ctx.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y); ctx.stroke();
      break;
    }
    case 'arrowup': case 'arrowdown': {
      arrowMarker(ctx, pts[0], d.type === 'arrowup', s);
      break;
    }
  }
  ctx.restore();
}

// ── helpers ──────────────────────────────────────────────────────────────────
function labeledPattern(ctx: CanvasRenderingContext2D, pts: Pt[], labels: string[], s: DStyle) {
  if (pts.length < 2) return;
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();
  // light fill of the polygon
  if (pts.length >= 3) {
    ctx.save(); ctx.globalAlpha = (s.opacity ?? 1) * (s.fillOpacity || 0.08);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.font = 'bold 12px sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  pts.forEach((p, i) => {
    dot(ctx, p, s.color);
    const lbl = labels[i];
    if (lbl) {
      ctx.fillStyle = 'rgba(20,24,33,0.85)';
      const tw = ctx.measureText(lbl).width + 8;
      ctx.fillRect(p.x - tw / 2, p.y - 22, tw, 16);
      ctx.fillStyle = s.color; ctx.fillText(lbl, p.x, p.y - 14);
    }
  });
  ctx.textAlign = 'left';
}

function regressionChannel(ctx: CanvasRenderingContext2D, d: Drawing, env: RenderEnv, s: DStyle) {
  const cs = env.candles;
  const i0 = Math.max(0, Math.round(Math.min(d.points[0].logical, d.points[1].logical)));
  const i1 = Math.min(cs.length - 1, Math.round(Math.max(d.points[0].logical, d.points[1].logical)));
  if (i1 - i0 < 2) return;
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = i0; i <= i1; i++) { const y = cs[i].close; n++; sx += i; sy += y; sxx += i * i; sxy += i * y; }
  const denom = n * sxx - sx * sx || 1;
  const slope = (n * sxy - sx * sy) / denom;
  const intc = (sy - slope * sx) / n;
  let sse = 0;
  for (let i = i0; i <= i1; i++) { const e = cs[i].close - (slope * i + intc); sse += e * e; }
  const sd = Math.sqrt(sse / n);
  const yAt = (i: number) => slope * i + intc;
  const X = (i: number) => env.toX(i), Y = (p: number) => env.toY(p);
  const x0 = X(i0), x1 = X(i1), y0 = Y(yAt(i0)), y1 = Y(yAt(i1));
  if (x0 == null || x1 == null || y0 == null || y1 == null) return;
  // bands
  ctx.setLineDash([4, 4]); ctx.globalAlpha = (s.opacity ?? 1) * 0.8;
  for (const k of [2, 1]) {
    const u0 = Y(yAt(i0) + k * sd), u1 = Y(yAt(i1) + k * sd);
    const d0 = Y(yAt(i0) - k * sd), d1 = Y(yAt(i1) - k * sd);
    if (u0 != null && u1 != null) seg(ctx, { x: x0, y: u0 }, { x: x1, y: u1 });
    if (d0 != null && d1 != null) seg(ctx, { x: x0, y: d0 }, { x: x1, y: d1 });
  }
  ctx.globalAlpha = s.opacity ?? 1; ctx.setLineDash([]);
  seg(ctx, { x: x0, y: y0 }, { x: x1, y: y1 });
  tag(ctx, x1 - 60, y1 - 14, `R ${fmtN(slope)}`, s.color);
}

function pitchforkVariant(ctx: CanvasRenderingContext2D, kind: string, pts: Pt[], w: number, h: number, s: DStyle) {
  const [P0, P1, P2] = pts;
  const M = mid(P1, P2);
  let O: Pt = P0;
  if (kind === 'schiff') O = { x: P0.x, y: (P0.y + P1.y) / 2 };
  else if (kind === 'modschiff') O = mid(P0, P1);
  // median ray O→M extended
  const [, mEnd] = extend(O, M, w, h, false);
  seg(ctx, O, mEnd);
  // dir of median
  const dir = { x: M.x - O.x, y: M.y - O.y };
  for (const P of [P1, P2]) {
    const end = { x: P.x + dir.x, y: P.y + dir.y };
    const [, e] = extend(P, end, w, h, false);
    ctx.globalAlpha = (s.opacity ?? 1) * 0.85;
    seg(ctx, P, e);
  }
  ctx.globalAlpha = (s.opacity ?? 1) * 0.12;
  ctx.beginPath();
  ctx.moveTo(P1.x, P1.y); ctx.lineTo(P1.x + dir.x, P1.y + dir.y);
  ctx.lineTo(P2.x + dir.x, P2.y + dir.y); ctx.lineTo(P2.x, P2.y); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = s.opacity ?? 1;
  // handle line P1→P2
  seg(ctx, P1, P2);
  if (kind === 'inside') { ctx.globalAlpha = (s.opacity ?? 1) * 0.6; seg(ctx, O, M); ctx.globalAlpha = s.opacity ?? 1; }
}

// Copy real candles from the selected range and draw them; for barPattern the
// copy is projected to the right of the range, for ghostFeed it's a synthetic
// random walk filling the box.
function projectedBars(ctx: CanvasRenderingContext2D, d: Drawing, env: RenderEnv, ghost: boolean) {
  const cs = env.candles;
  const i0 = Math.max(0, Math.round(Math.min(d.points[0].logical, d.points[1].logical)));
  const i1 = Math.min(cs.length - 1, Math.round(Math.max(d.points[0].logical, d.points[1].logical)));
  const count = Math.max(2, i1 - i0);
  const X = env.toX, Y = env.toY;
  const cw = Math.max(2, (env.toX(i0 + 1)! - env.toX(i0)!) * 0.6) || 4;

  let bars: { o: number; h: number; l: number; c: number }[] = [];
  if (ghost) {
    const seed = parseInt(d.id.replace(/\D/g, '').slice(-7) || '1', 10);
    const r = rng(seed);
    const p0 = d.points[0].price, p1 = d.points[1].price;
    let px = p0; const vol = Math.abs(p1 - p0) / count || p0 * 0.01;
    for (let k = 0; k < count; k++) {
      const o = px; const c = px + (r() - 0.5) * vol * 2;
      const hi = Math.max(o, c) + r() * vol; const lo = Math.min(o, c) - r() * vol;
      bars.push({ o, h: hi, l: lo, c }); px = c;
    }
  } else {
    for (let k = 0; k < count && i0 + k <= i1; k++) {
      const b = cs[i0 + k]; bars.push({ o: b.open, h: b.high, l: b.low, c: b.close });
    }
  }
  const startIdx = ghost ? i0 : i1 + 1; // ghost overlays selection, barPattern projects forward
  ctx.globalAlpha = (d.style.opacity ?? 1) * 0.9;
  bars.forEach((b, k) => {
    const x = X(startIdx + k); if (x == null) return;
    const yO = Y(b.o), yC = Y(b.c), yH = Y(b.h), yL = Y(b.l);
    if (yO == null || yC == null || yH == null || yL == null) return;
    const up = b.c >= b.o;
    ctx.strokeStyle = up ? '#26a69a' : '#ef5350'; ctx.fillStyle = up ? '#26a69a' : '#ef5350';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, yH); ctx.lineTo(x, yL); ctx.stroke();
    const top = Math.min(yO, yC); ctx.fillRect(x - cw / 2, top, cw, Math.max(1, Math.abs(yC - yO)));
  });
  ctx.globalAlpha = d.style.opacity ?? 1;
}

function arrowMarker(ctx: CanvasRenderingContext2D, p: Pt, up: boolean, s: DStyle) {
  const sz = 9 + s.width * 2;
  const dir = up ? 1 : -1;
  ctx.setLineDash([]); ctx.fillStyle = s.color; ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
  // stem
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + dir * sz * 2); ctx.stroke();
  // head
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - sz * 0.7, p.y + dir * sz);
  ctx.lineTo(p.x + sz * 0.7, p.y + dir * sz);
  ctx.closePath(); ctx.fill();
}

// circumscribed-circle arc through 3 points (null if collinear)
function arcThrough(a: Pt, b: Pt, c: Pt): { cx: number; cy: number; r: number; start: number; end: number; ccw: boolean } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-6) return null;
  const ux = ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / d;
  const uy = ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / d;
  const r = Math.hypot(a.x - ux, a.y - uy);
  const start = Math.atan2(a.y - uy, a.x - ux);
  const end = Math.atan2(c.y - uy, c.x - ux);
  // pick sweep direction that passes through b
  const angB = Math.atan2(b.y - uy, b.x - ux);
  const within = (s: number, e: number, m: number, ccw: boolean) => {
    let two = Math.PI * 2; let ds = ((e - s) % two + two) % two; let dm = ((m - s) % two + two) % two;
    return ccw ? dm >= two - ds : dm <= ds;
  };
  const ccw = !within(start, end, angB, false);
  return { cx: ux, cy: uy, r, start, end, ccw };
}

// ── hit testing for extra tools ──────────────────────────────────────────────
export function hitTestExtra(d: Drawing, pts: Pt[], m: Pt, w: number, h: number): boolean {
  const tol = 6 + d.style.width;
  switch (d.type) {
    case 'crossline': return Math.abs(m.x - pts[0].x) < tol || Math.abs(m.y - pts[0].y) < tol;
    case 'arrowup': case 'arrowdown': return Math.hypot(m.x - pts[0].x, m.y - pts[0].y) < 24;
    case 'infoline': case 'trendangle': return pts[1] ? distToSeg(m.x, m.y, pts[0], pts[1]) < tol : false;
    case 'cyclic': case 'fibtimezone': case 'fibtime':
      return pts[0] ? Math.abs(m.x - pts[0].x) < tol * 2 : false;
    case 'circle': case 'timecycles': case 'fibcircles': case 'fibarcs': case 'sector': {
      if (!pts[1]) return false;
      const r = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const dm = Math.hypot(m.x - pts[0].x, m.y - pts[0].y);
      return d.type === 'circle' || d.type === 'sector' ? dm < r + tol : Math.abs(dm - r) < tol * 2 || dm < r;
    }
    default: {
      // generic bounding-box for the rest
      if (pts.length < 2) return pts[0] ? Math.hypot(m.x - pts[0].x, m.y - pts[0].y) < tol * 2 : false;
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      const x = Math.min(...xs), y = Math.min(...ys);
      return m.x >= x - tol && m.x <= Math.max(...xs) + tol && m.y >= y - tol && m.y <= Math.max(...ys) + tol;
    }
  }
}
