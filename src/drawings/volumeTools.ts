// Data-driven drawing tools that need OHLCV: Anchored VWAP and Volume Profile
// (fixed-range + anchored). All math runs against the chart's candle array.
//
// Algorithms follow TradingView's definitions:
//  • Anchored VWAP  = Σ(typicalPrice·vol) / Σ(vol) accumulated from the anchor
//    bar, with standard-deviation bands σ = √( Σ(vol·tp²)/Σvol − VWAP² ).
//  • Volume Profile : the bar range's [minLow,maxHigh] is split into N rows; each
//    bar's volume is distributed across the rows it overlaps (proportional to the
//    price overlap) and split into up/down volume by candle direction. POC = the
//    highest-volume row; the Value Area is grown out from the POC by repeatedly
//    adding the higher-volume adjacent row until 70 % of total volume is covered.
import type { Candle } from '../data/types';
import type { Drawing, DStyle } from './types';

export interface RenderEnv {
  candles: Candle[];
  toX: (logical: number) => number | null;
  toY: (price: number) => number | null;
}

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const typical = (c: Candle) => (c.high + c.low + c.close) / 3;
const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(i)));

// ── Anchored VWAP ───────────────────────────────────────────────────────────
export function renderAnchoredVwap(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  env: RenderEnv,
) {
  const { candles, toX, toY } = env;
  if (candles.length < 2 || !d.points[0]) return;
  const s = d.style;
  const start = clampIdx(d.points[0].logical, candles.length);

  // Indices often report zero volume — fall back to equal (count) weighting so
  // the line still draws (becomes a simple average of typical price).
  let anyVol = false;
  for (let i = start; i < candles.length; i++) { if ((candles[i].volume || 0) > 0) { anyVol = true; break; } }

  let cumPV = 0, cumV = 0, cumPV2 = 0;
  type Row = { x: number; vwap: number; up: number; lo: number };
  const rows: Row[] = [];
  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    const tp = typical(c);
    const v = anyVol ? (c.volume || 0) : 1;
    cumPV += tp * v; cumV += v; cumPV2 += tp * tp * v;
    if (cumV <= 0) continue;
    const vwap = cumPV / cumV;
    const variance = Math.max(0, cumPV2 / cumV - vwap * vwap);
    const x = toX(i);
    if (x == null) continue;
    rows.push({ x, vwap, up: Math.sqrt(variance), lo: vwap });
  }
  if (rows.length < 2) return;

  ctx.save();
  // ── σ bands (drawn first, behind the VWAP line) ──
  if (s.vwapBands) {
    for (const k of [2, 1]) {
      const upPts: { x: number; y: number }[] = [];
      const dnPts: { x: number; y: number }[] = [];
      for (const r of rows) {
        const yu = toY(r.vwap + k * r.up), yd = toY(r.vwap - k * r.up);
        if (yu != null) upPts.push({ x: r.x, y: yu });
        if (yd != null) dnPts.push({ x: r.x, y: yd });
      }
      if (upPts.length < 2) continue;
      // translucent fill between +kσ and −kσ
      ctx.beginPath();
      ctx.moveTo(upPts[0].x, upPts[0].y);
      for (const p of upPts.slice(1)) ctx.lineTo(p.x, p.y);
      for (let i = dnPts.length - 1; i >= 0; i--) ctx.lineTo(dnPts[i].x, dnPts[i].y);
      ctx.closePath();
      ctx.globalAlpha = k === 1 ? 0.10 : 0.05;
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      // dashed band edges
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1;
      for (const arr of [upPts, dnPts]) {
        ctx.beginPath(); ctx.moveTo(arr[0].x, arr[0].y);
        for (const p of arr.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  }

  // ── VWAP line ──
  ctx.setLineDash([]);
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width || 2;
  ctx.beginPath();
  let started = false;
  for (const r of rows) {
    const y = toY(r.vwap);
    if (y == null) continue;
    if (!started) { ctx.moveTo(r.x, y); started = true; } else ctx.lineTo(r.x, y);
  }
  ctx.stroke();

  // anchor marker + value label
  const anchorY = toY(rows[0].vwap);
  if (anchorY != null) {
    ctx.beginPath(); ctx.arc(rows[0].x, anchorY, 4, 0, Math.PI * 2);
    ctx.fillStyle = s.color; ctx.fill();
  }
  const last = rows[rows.length - 1];
  const lastY = toY(last.vwap);
  if (lastY != null) {
    const label = `VWAP ${fmt(last.vwap)}`;
    ctx.font = '11px sans-serif'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = s.color;
    ctx.fillRect(last.x - tw, lastY - 9, tw, 18);
    ctx.fillStyle = '#fff'; ctx.fillText(label, last.x - tw + 5, lastY);
  }
  ctx.restore();
}

// ── Volume Profile (fixed-range and anchored share this) ─────────────────────
export function renderVolumeProfile(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  env: RenderEnv,
) {
  const { candles, toX, toY } = env;
  if (candles.length < 2 || !d.points[0]) return;
  const s = d.style;
  const n = candles.length;

  const i0 = clampIdx(d.points[0].logical, n);
  const i1 = d.type === 'fixed_vp' && d.points[1]
    ? clampIdx(d.points[1].logical, n)
    : n - 1;
  const lo = Math.min(i0, i1), hi = Math.max(i0, i1);
  if (hi - lo < 1) return;

  // price extent over the range
  let pMin = Infinity, pMax = -Infinity;
  for (let i = lo; i <= hi; i++) {
    pMin = Math.min(pMin, candles[i].low);
    pMax = Math.max(pMax, candles[i].high);
  }
  if (!isFinite(pMin) || pMax <= pMin) return;

  const ROWS = Math.max(6, Math.min(100, s.vpRows ?? 24));
  const rowH = (pMax - pMin) / ROWS;
  const volUp = new Array(ROWS).fill(0);
  const volDn = new Array(ROWS).fill(0);

  // Zero-volume symbols (indices) → fall back to equal weighting per bar so the
  // profile becomes a time-at-price (TPO-style) distribution instead of blank.
  let anyVol = false;
  for (let i = lo; i <= hi; i++) { if ((candles[i].volume || 0) > 0) { anyVol = true; break; } }

  for (let i = lo; i <= hi; i++) {
    const c = candles[i];
    const v = anyVol ? (c.volume || 0) : 1;
    if (v <= 0) continue;
    const up = c.close >= c.open;
    const span = c.high - c.low;
    if (span <= 0) {
      const r = clampIdx((c.close - pMin) / rowH, ROWS + 1);
      const ri = Math.max(0, Math.min(ROWS - 1, r));
      if (up) volUp[ri] += v; else volDn[ri] += v;
      continue;
    }
    
    // Body-vs-Wick Heuristic: weight candle body 4x higher than wicks
    // to prevent volume dilution across large price moves.
    const bodyMin = Math.min(c.open, c.close);
    const bodyMax = Math.max(c.open, c.close);
    const weights = new Array(ROWS).fill(0);
    let totalWeight = 0;

    for (let r = 0; r < ROWS; r++) {
      const rLo = pMin + r * rowH, rHi = rLo + rowH;
      const ov = Math.max(0, Math.min(c.high, rHi) - Math.max(c.low, rLo));
      if (ov <= 0) continue;

      const bodyOv = Math.max(0, Math.min(bodyMax, rHi) - Math.max(bodyMin, rLo));
      const wickOv = ov - bodyOv;

      const w = (bodyOv * 4.0) + (wickOv * 1.0);
      weights[r] = w;
      totalWeight += w;
    }

    if (totalWeight > 0) {
      for (let r = 0; r < ROWS; r++) {
        if (weights[r] <= 0) continue;
        const part = (weights[r] / totalWeight) * v;
        if (up) volUp[r] += part; else volDn[r] += part;
      }
    }
  }

  const totals = volUp.map((u, i) => u + volDn[i]);
  const total = totals.reduce((a, b) => a + b, 0);
  if (total <= 0) return;
  let maxVol = 0, pocRow = 0;
  totals.forEach((t, i) => { if (t > maxVol) { maxVol = t; pocRow = i; } });

  // value area: expand from POC by higher-volume adjacent side until ≥ 70 %
  const target = total * 0.7;
  let vaUp = pocRow, vaDn = pocRow, acc = totals[pocRow];
  while (acc < target && (vaDn > 0 || vaUp < ROWS - 1)) {
    const below = vaDn > 0 ? totals[vaDn - 1] : -1;
    const above = vaUp < ROWS - 1 ? totals[vaUp + 1] : -1;
    if (above >= below) { vaUp++; acc += Math.max(0, above); }
    else { vaDn--; acc += Math.max(0, below); }
  }

  const x0 = toX(lo), x1 = toX(hi);
  if (x0 == null || x1 == null) return;
  const boxL = Math.min(x0, x1), boxR = Math.max(x0, x1);
  const boxW = boxR - boxL;
  // histogram grows from the left edge of the range, rightward
  const maxBarW = Math.min(boxW * 0.32, 160);
  const upCol = s.upColor || 'rgba(38,166,154,0.55)';
  const dnCol = s.downColor || 'rgba(239,83,80,0.55)';

  ctx.save();
  // faint range box
  const yTop = toY(pMax), yBot = toY(pMin);
  if (yTop != null && yBot != null) {
    const boxY = Math.min(yTop, yBot);
    const boxH = Math.abs(yBot - yTop);

    // Semi-transparent background fill to match TradingView
    ctx.fillStyle = 'rgba(41, 98, 255, 0.04)';
    ctx.fillRect(boxL, boxY, boxW, boxH);

    ctx.strokeStyle = 'rgba(120,123,134,0.2)';
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(boxL, boxY, boxW, boxH);
    ctx.setLineDash([]);
  }

  for (let r = 0; r < ROWS; r++) {
    const rLo = pMin + r * rowH, rHi = rLo + rowH;
    const yA = toY(rHi), yB = toY(rLo);
    if (yA == null || yB == null) continue;
    const top = Math.min(yA, yB), barH = Math.max(1, Math.abs(yB - yA) - 1);
    const inVA = r >= vaDn && r <= vaUp;
    const wUp = (volUp[r] / maxVol) * maxBarW;
    const wDn = (volDn[r] / maxVol) * maxBarW;
    ctx.globalAlpha = inVA ? 1 : 0.5;
    // stacked up (green) then down (red), anchored at left edge
    ctx.fillStyle = upCol; ctx.fillRect(boxL, top, wUp, barH);
    ctx.fillStyle = dnCol; ctx.fillRect(boxL + wUp, top, wDn, barH);
  }
  ctx.globalAlpha = 1;

  // POC line (orange) + VAH / VAL (blue) across the box
  const pocPrice = pMin + (pocRow + 0.5) * rowH;
  const yPoc = toY(pocPrice);
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'middle';
  if (yPoc != null) {
    ctx.strokeStyle = '#ff9800'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(boxL, yPoc); ctx.lineTo(boxR, yPoc); ctx.stroke();
    ctx.fillStyle = '#ff9800';
    ctx.textAlign = 'right';
    ctx.fillText(`POC ${fmt(pocPrice)}`, boxR - 4, yPoc - 7);
  }
  const vah = pMin + (vaUp + 1) * rowH, val = pMin + vaDn * rowH;
  ctx.strokeStyle = 'rgba(41,98,255,0.7)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
  for (const [p, lbl] of [[vah, 'VAH'], [val, 'VAL']] as [number, string][]) {
    const y = toY(p); if (y == null) continue;
    ctx.beginPath(); ctx.moveTo(boxL, y); ctx.lineTo(boxR, y); ctx.stroke();
    ctx.fillStyle = 'rgba(41,98,255,0.9)';
    ctx.textAlign = 'right';
    ctx.fillText(`${lbl} ${fmt(p)}`, boxR - 4, y - 7);
  }
  ctx.textAlign = 'left';
  ctx.setLineDash([]);
  ctx.restore();
}
