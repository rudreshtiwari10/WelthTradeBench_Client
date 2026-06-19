import { FIB_COLORS, FIB_LEVELS, EW_LABELS, DEFAULT_FIB_LEVELS, type Drawing, type DStyle, type FibLevelConfig } from './types';
import { renderAnchoredVwap, renderVolumeProfile, type RenderEnv } from './volumeTools';
import { renderExtra, hitTestExtra, EXTRA_TYPES } from './extraTools';

export interface Pt { x: number; y: number; }
export type { RenderEnv } from './volumeTools';

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

function dash(ctx: CanvasRenderingContext2D, style: DStyle) {
  ctx.setLineDash(style.style === 'dashed' ? [6, 4] : style.style === 'dotted' ? [2, 3] : []);
}

export function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Extend the segment a→b to the canvas bounds; `both` extends behind a too.
export function extend(a: Pt, b: Pt, w: number, h: number, both: boolean): [Pt, Pt] {
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
  env?: RenderEnv,
) {
  const s = d.style;
  // Data-driven tools render entirely from OHLCV; bail early if no env yet.
  if (d.type === 'anchored_vwap' || d.type === 'fixed_vp' || d.type === 'anchored_vp') {
    if (env) {
      if (d.type === 'anchored_vwap') renderAnchoredVwap(ctx, d, env);
      else renderVolumeProfile(ctx, d, env);
    }
    return;
  }
  if (EXTRA_TYPES.has(d.type)) { renderExtra(ctx, d, pts, w, h, prices, env); return; }
  ctx.save();
  if (s.opacity != null && s.opacity < 1) ctx.globalAlpha = s.opacity;
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.fill;
  ctx.lineWidth = s.width;
  dash(ctx, s);
  const line = (a: Pt, b: Pt) => { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); };

  switch (d.type) {
    case 'trendline': {
      if (!pts[1]) break;
      let p1 = pts[0], p2 = pts[1];
      if (s.extendLeft) [p1] = extend(pts[1], pts[0], w, h, false);
      if (s.extendRight) [, p2] = extend(pts[0], pts[1], w, h, false);
      line(p1, p2);
      if (s.showPriceLabel !== false) priceTag(ctx, w, p2.y, prices[1] ?? prices[0], s);
      break;
    }
    case 'arrow':
      if (pts[1]) { line(pts[0], pts[1]); ctx.setLineDash([]); arrowHead(ctx, pts[0], pts[1], 12 + s.width * 2); }
      break;
    case 'ray': if (pts[1]) { const [a, b] = extend(pts[0], pts[1], w, h, false); line(a, b); if (s.showPriceLabel !== false) priceTag(ctx, w, b.y, prices[0], s); } break;
    case 'extended': if (pts[1]) { const [a, b] = extend(pts[0], pts[1], w, h, true); line(a, b); } break;
    case 'hline': line({ x: 0, y: pts[0].y }, { x: w, y: pts[0].y }); if (s.showPriceLabel !== false) priceTag(ctx, w, pts[0].y, prices[0], s); break;
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
    case 'fib': if (pts[1]) renderFib(ctx, pts[0], pts[1], prices, s, w); break;
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
    case 'highlighter':
    case 'brush':
    case 'polyline':
      if (d.type === 'highlighter') { ctx.globalAlpha = (s.opacity ?? 1) * 0.35; ctx.lineWidth = (s.width || 2) * 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]); }
      if (pts.length > 1) {
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
      if (d.type === 'polyline') for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill(); }
      break;
    case 'xabcd':
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

  // Generic user text label for tools that don't render their own text.
  // Lets any line/shape carry a label set from the settings dialog.
  if (d.text && d.type !== 'text' && d.type !== 'callout' && d.type !== 'emoji' && pts.length) {
    drawTextLabel(ctx, d, pts);
  }

  ctx.restore();
}

// Draw a multi-line text label centered on a drawing's anchor span.
function drawTextLabel(ctx: CanvasRenderingContext2D, d: Drawing, pts: Pt[]) {
  const s = d.style;
  const anchor = pts.length > 1
    ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
    : { x: pts[0].x, y: pts[0].y };
  ctx.save();
  ctx.globalAlpha = s.opacity != null && s.opacity < 1 ? s.opacity : 1;
  ctx.setLineDash([]);
  ctx.fillStyle = s.textColor || s.color;
  ctx.font = `${s.fontSize || 14}px var(--font, sans-serif)`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = d.text!.split('\n');
  const lh = (s.fontSize || 14) * 1.3;
  const y0 = anchor.y - ((lines.length - 1) * lh) / 2;
  lines.forEach((ln, i) => ctx.fillText(ln, anchor.x, y0 + i * lh));
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

function renderFib(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, prices: number[], s: DStyle, w: number) {
  const levels: FibLevelConfig[] = s.fibLevels ?? DEFAULT_FIB_LEVELS;
  const showPrices = s.fibShowPrices !== false;       // default true
  const showLevels = s.fibShowLevels !== false;       // default true
  const showBg     = s.fibShowBackground !== false;   // default true
  const reverse    = !!s.fibReverse;
  const extendMode = s.fibExtend ?? 'none';
  const labelPos   = s.fibLabelPosition ?? 'left';
  const labelAlign = s.fibLabelAlign ?? 'top';
  const fSize      = s.fibFontSize ?? 11;

  // When reversed, swap the two anchors so 0=bottom becomes 0=top (or vice versa)
  let pa = prices[0], pb = prices[1];
  let ptA = a, ptB = b;
  if (reverse) {
    [pa, pb] = [pb, pa];
    [ptA, ptB] = [ptB, ptA];
  }

  // Horizontal extent for the level lines
  const anchorLeft  = Math.min(ptA.x, ptB.x);
  const anchorRight = Math.max(ptA.x, ptB.x);
  const xL = (extendMode === 'left' || extendMode === 'both') ? 0 : anchorLeft;
  const xR = (extendMode === 'right' || extendMode === 'both') ? w : anchorRight;

  ctx.save();
  ctx.font = `${fSize}px sans-serif`;
  ctx.textBaseline = labelAlign === 'top' ? 'bottom' : labelAlign === 'bottom' ? 'top' : 'middle';

  // Draw connecting trendline between the two anchor points (like TradingView)
  ctx.strokeStyle = s.color;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(ptA.x, ptA.y);
  ctx.lineTo(ptB.x, ptB.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Collect enabled levels with their computed Y positions and prices
  const computed: { lv: number; y: number; price: number; color: string }[] = [];
  for (const lc of levels) {
    if (!lc.enabled) continue;
    const lv = lc.level;
    let y: number, price: number;
    if (lv <= 1) {
      y     = ptA.y  + (ptB.y  - ptA.y)  * lv;
      price = pa     + (pb     - pa)     * lv;
    } else {
      y     = ptA.y  - (ptB.y  - ptA.y)  * (lv - 1);
      price = pa     - (pb     - pa)     * (lv - 1);
    }
    computed.push({ lv, y, price, color: lc.color });
  }

  // Background fill bands between adjacent enabled levels (within 0-1 range)
  if (showBg) {
    const retraceLevels = computed.filter((c) => c.lv >= 0 && c.lv <= 1);
    for (let i = 1; i < retraceLevels.length; i++) {
      const prev = retraceLevels[i - 1];
      const cur  = retraceLevels[i];
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = cur.color;
      ctx.fillRect(anchorLeft, Math.min(prev.y, cur.y), anchorRight - anchorLeft, Math.abs(cur.y - prev.y));
    }
    ctx.globalAlpha = 1;
  }

  // Draw level lines and labels
  for (const { lv, y, price, color } of computed) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xL, y);
    ctx.lineTo(xR, y);
    ctx.stroke();

    // Build label text
    const parts: string[] = [];
    if (showLevels) parts.push(String(lv));
    if (showPrices) parts.push(`(${fmt(price)})`);
    const label = parts.join(' ');
    if (!label) continue;

    // Label position
    const labelPad = 4;
    let lx: number;
    if (labelPos === 'left') {
      ctx.textAlign = 'left';
      lx = anchorLeft + labelPad;
    } else if (labelPos === 'right') {
      ctx.textAlign = 'right';
      lx = anchorRight - labelPad;
    } else {
      ctx.textAlign = 'center';
      lx = (anchorLeft + anchorRight) / 2;
    }

    // Vertical offset for label alignment
    const yOff = labelAlign === 'top' ? -3 : labelAlign === 'bottom' ? 3 : 0;

    ctx.fillStyle = color;
    ctx.fillText(label, lx, y + yOff);
  }

  ctx.restore();
}


// 3 anchors stored as (entry, target, stop).
// The rendered zones span from the leftmost point to the rightmost point.
function renderPosition(
  ctx: CanvasRenderingContext2D,
  type: 'longpos' | 'shortpos',
  pts: Pt[],
  prices: number[],
  canvasW: number,
) {
  const [entry, target, stop] = pts;
  const [entryP, targetP, stopP] = prices;

  // Box bounds
  const xs = pts.map((p) => p.x);
  const xL = Math.min(...xs);
  const xR = Math.max(Math.max(...xs), xL + 60);

  const green = 'rgba(38, 166, 154, 1)', red = 'rgba(239, 83, 80, 1)';
  const profitColor = type === 'longpos' ? green : red;
  const lossColor   = type === 'longpos' ? red   : green;
  const profitFill  = type === 'longpos' ? 'rgba(38, 166, 154, 0.15)' : 'rgba(239, 83, 80, 0.15)';
  const lossFill    = type === 'longpos' ? 'rgba(239, 83, 80, 0.15)' : 'rgba(38, 166, 154, 0.15)';

  ctx.save();
  ctx.setLineDash([]);

  // Filled zones
  ctx.fillStyle = profitFill;
  ctx.fillRect(xL, Math.min(entry.y, target.y), xR - xL, Math.abs(target.y - entry.y));
  ctx.fillStyle = lossFill;
  ctx.fillRect(xL, Math.min(entry.y, stop.y), xR - xL, Math.abs(stop.y - entry.y));

  // Solid horizontal lines (at bounds)
  const levels: [Pt, string][] = [
    [entry,  '#2962ff'],
    [target, profitColor],
    [stop,   lossColor],
  ];
  for (const [p, c] of levels) {
    ctx.strokeStyle = c;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xL, p.y);
    ctx.lineTo(xR, p.y);
    ctx.stroke();
  }

  // ── Badges centered on the box ──
  const reward    = Math.abs(targetP - entryP);
  const risk      = Math.abs(entryP - stopP) || 1e-9;
  const rr        = reward / risk;
  const rewardPct = entryP ? ((targetP - entryP) / entryP) * 100 : 0;
  const riskPct   = entryP ? ((stopP   - entryP) / entryP) * 100 : 0;

  ctx.font = '12px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  const cx = (xL + xR) / 2;

  const drawBadge = (p: Pt, text: string, bg: string, above: boolean) => {
    const tw = ctx.measureText(text).width + 16;
    const h = 22;
    // Align so the badge sits neatly inside the zone near the boundary
    const by = above ? p.y + h / 2 + 2 : p.y - h / 2 - 2;
    ctx.fillStyle = bg;
    if ((ctx as any).roundRect) {
      ctx.beginPath(); (ctx as any).roundRect(cx - tw / 2, by - h / 2, tw, h, 4); ctx.fill();
    } else {
      ctx.fillRect(cx - tw / 2, by - h / 2, tw, h);
    }
    ctx.fillStyle = '#fff';
    ctx.fillText(text, cx, by);
  };

  const isLong = type === 'longpos';
  drawBadge(target, `Target: ${fmt(targetP)} (${rewardPct.toFixed(2)}%)`, profitColor, !isLong);
  drawBadge(stop,   `Stop: ${fmt(stopP)} (${riskPct.toFixed(2)}%)`,         lossColor,   isLong);

  // Middle RR Badge (centered exactly on entry)
  const rrLabel1 = `Open P&L: 0.00, Qty: 0`;
  const rrLabel2 = `Risk/reward ratio: ${rr.toFixed(2)}`;
  ctx.font = '12px sans-serif';
  const twMid = Math.max(ctx.measureText(rrLabel1).width, ctx.measureText(rrLabel2).width) + 20;
  const hMid = 36;
  ctx.fillStyle = '#ff7043'; // Standard TV orange-ish for mid badge
  if ((ctx as any).roundRect) {
    ctx.beginPath(); (ctx as any).roundRect(cx - twMid / 2, entry.y - hMid / 2, twMid, hMid, 4); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
  } else {
    ctx.fillRect(cx - twMid / 2, entry.y - hMid / 2, twMid, hMid);
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(rrLabel1, cx, entry.y - 7);
  ctx.fillText(rrLabel2, cx, entry.y + 9);

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

// ── hover highlight: glow ring around the hovered drawing ───────────────
export function renderHoverHighlight(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  pts: Pt[],
  w: number,
  h: number,
) {
  ctx.save();
  ctx.strokeStyle = d.style.color;
  ctx.lineWidth = d.style.width + 4;
  ctx.globalAlpha = 0.22;
  ctx.setLineDash([]);
  switch (d.type) {
    case 'trendline': { if (!pts[1]) break; let p1 = pts[0], p2 = pts[1]; if (d.style.extendLeft) [p1] = extend(pts[1], pts[0], w, h, false); if (d.style.extendRight) [, p2] = extend(pts[0], pts[1], w, h, false); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); break; }
    case 'arrow': case 'ray': case 'extended': case 'hline': case 'hray':
      if (pts[1] || d.type === 'hline' || d.type === 'hray') { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1]?.x ?? w, pts[0].y); ctx.stroke(); } break;
    case 'vline': ctx.beginPath(); ctx.moveTo(pts[0].x, 0); ctx.lineTo(pts[0].x, h); ctx.stroke(); break;
    case 'rect': case 'measure':
      if (pts[1]) { const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y); ctx.strokeRect(x, y, Math.abs(pts[1].x - pts[0].x), Math.abs(pts[1].y - pts[0].y)); } break;
    default:
      if (pts.length >= 2) { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y); ctx.stroke(); }
  }
  ctx.restore();
}

// ── hit testing (screen space) ──────────────────────────────────────────
export function hitTest(d: Drawing, pts: Pt[], m: Pt, w: number, h: number): boolean {
  if (EXTRA_TYPES.has(d.type)) return hitTestExtra(d, pts, m, w, h);
  const tol = 6 + d.style.width;
  switch (d.type) {
    case 'trendline': case 'arrow': return pts[1] ? distToSeg(m.x, m.y, pts[0], pts[1]) < tol : false;
    case 'ray': { if (!pts[1]) return false; const [a, b] = extend(pts[0], pts[1], w, h, false); return distToSeg(m.x, m.y, a, b) < tol; }
    case 'extended': { if (!pts[1]) return false; const [a, b] = extend(pts[0], pts[1], w, h, true); return distToSeg(m.x, m.y, a, b) < tol; }
    case 'hline': case 'hray': return Math.abs(m.y - pts[0].y) < tol && (d.type === 'hline' || m.x >= pts[0].x - tol);
    case 'vline': return Math.abs(m.x - pts[0].x) < tol;
    case 'longpos': case 'shortpos': {
      // Test proximity to the rectangular bounds of the long/short position
      if (pts.length < 2) return false;
      const xs = pts.map((p) => p.x);
      const xL = Math.min(...xs);
      const xR = Math.max(Math.max(...xs), xL + 60);
      if (m.x < xL - tol || m.x > xR + tol) return false;
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
    case 'fixed_vp': {
      // Box spanning the two anchors (vertical extent unknown without OHLCV → use full height)
      if (pts.length < 2) return false;
      const xL = Math.min(pts[0].x, pts[1].x), xR = Math.max(pts[0].x, pts[1].x);
      return m.x >= xL - tol && m.x <= xR + tol;
    }
    case 'anchored_vp': return m.x >= pts[0].x - tol;
    case 'anchored_vwap': return m.x >= pts[0].x - tol && Math.abs(m.y - pts[0].y) < 40;
    case 'flag': case 'pricelabel': return Math.abs(m.x - pts[0].x) < 30 && m.y > pts[0].y - 30 && m.y < pts[0].y + 12;
    case 'ellipse': {
      if (!pts[1]) return false;
      const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
      const rx = Math.abs(pts[1].x - pts[0].x) / 2 || 1, ry = Math.abs(pts[1].y - pts[0].y) / 2 || 1;
      const v = ((m.x - cx) ** 2) / (rx * rx) + ((m.y - cy) ** 2) / (ry * ry);
      return v > 0.7 && v < 1.4;
    }
    case 'highlighter': case 'brush': case 'polyline':
    case 'xabcd':
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
