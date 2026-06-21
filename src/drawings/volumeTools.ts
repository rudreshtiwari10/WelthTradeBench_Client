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
const clampIdx = (i: number, n: number) => Math.max(0, Math.min(n - 1, Math.round(i)));

const calcVwapSource = (c: Candle, source: 'close' | 'hl2' | 'hlc3' | 'ohlc4' = 'hlc3') => {
  switch (source) {
    case 'close': return c.close;
    case 'hl2': return (c.high + c.low) / 2;
    case 'ohlc4': return (c.open + c.high + c.low + c.close) / 4;
    case 'hlc3':
    default: return (c.high + c.low + c.close) / 3;
  }
};

export const DEFAULT_VWAP_BANDS = [
  { multiplier: 1, upColor: '#4caf50', dnColor: '#4caf50', fillColor: 'rgba(76,175,80,0.1)', showBand: true, showFill: true },
  { multiplier: 2, upColor: '#afb42b', dnColor: '#afb42b', fillColor: 'rgba(175,180,43,0.1)', showBand: false, showFill: false },
  { multiplier: 3, upColor: '#00897b', dnColor: '#00897b', fillColor: 'rgba(0,137,123,0.1)', showBand: false, showFill: false },
];

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

  let anyVol = false;
  for (let i = start; i < candles.length; i++) { if ((candles[i].volume || 0) > 0) { anyVol = true; break; } }

  let cumPV = 0, cumV = 0, cumPV2 = 0;
  type Row = { x: number; vwap: number; sigma: number };
  const rows: Row[] = [];
  const source = s.vwapSource || 'hlc3';

  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    const tp = calcVwapSource(c, source);
    const v = anyVol ? (c.volume || 0) : 1;
    cumPV += tp * v; cumV += v; cumPV2 += tp * tp * v;
    if (cumV <= 0) continue;
    const vwap = cumPV / cumV;
    const variance = Math.max(0, cumPV2 / cumV - vwap * vwap);
    const x = toX(i);
    if (x == null) continue;
    rows.push({ x, vwap, sigma: Math.sqrt(variance) });
  }
  if (rows.length < 2) return;

  const vwapBands = s.vwapBands || DEFAULT_VWAP_BANDS;
  const showLine = s.vwapShowLine !== false;
  const lineColor = s.vwapLineColor || s.color;

  ctx.save();

  // Draw fills and bands (highest multiplier first so it goes behind)
  const sortedBands = [...vwapBands].sort((a, b) => b.multiplier - a.multiplier);

  for (const b of sortedBands) {
    if (!b.showBand && !b.showFill) continue;

    const upPts: { x: number; y: number }[] = [];
    const dnPts: { x: number; y: number }[] = [];
    for (const r of rows) {
      const yu = toY(r.vwap + b.multiplier * r.sigma);
      const yd = toY(r.vwap - b.multiplier * r.sigma);
      if (yu != null) upPts.push({ x: r.x, y: yu });
      if (yd != null) dnPts.push({ x: r.x, y: yd });
    }

    if (upPts.length >= 2 && dnPts.length >= 2) {
      if (b.showFill) {
        ctx.beginPath();
        ctx.moveTo(upPts[0].x, upPts[0].y);
        for (const p of upPts.slice(1)) ctx.lineTo(p.x, p.y);
        for (let i = dnPts.length - 1; i >= 0; i--) ctx.lineTo(dnPts[i].x, dnPts[i].y);
        ctx.closePath();
        ctx.fillStyle = b.fillColor;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (b.showBand) {
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = b.upColor;
        ctx.beginPath();
        ctx.moveTo(upPts[0].x, upPts[0].y);
        for (const p of upPts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();

        ctx.strokeStyle = b.dnColor;
        ctx.beginPath();
        ctx.moveTo(dnPts[0].x, dnPts[0].y);
        for (const p of dnPts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
      }
    }
  }

  // ── VWAP line ──────────────────────────────────────────────────────────
  if (showLine) {
    ctx.setLineDash([]);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = s.width || 2;
    ctx.beginPath();
    let started = false;
    for (const r of rows) {
      const y = toY(r.vwap);
      if (y == null) continue;
      if (!started) { ctx.moveTo(r.x, y); started = true; } else ctx.lineTo(r.x, y);
    }
    ctx.stroke();
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
    
    // Triangular Heuristic: weight volume highest near the Typical Price,
    // tapering down to 0 at the High/Low extremes. This mimics the spiky
    // distribution of intra-day aggregation much better than uniform distribution.
    const typical = (c.high + c.low + c.close) / 3;
    const weights = new Array(ROWS).fill(0);
    let totalWeight = 0;

    for (let r = 0; r < ROWS; r++) {
      const rLo = pMin + r * rowH, rHi = rLo + rowH;
      const ov = Math.max(0, Math.min(c.high, rHi) - Math.max(c.low, rLo));
      if (ov <= 0) continue;

      const rowMid = (rLo + rHi) / 2;
      const dist = Math.abs(rowMid - typical);
      const maxDist = (rowMid > typical) ? (c.high - typical) : (typical - c.low);
      const spread = Math.max(0.0001, maxDist);
      
      const w = Math.max(0, 1 - (dist / spread)) * ov;
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

  // value area: expand from POC by higher-volume adjacent side until >= target %
  const targetPct = (s.vpValueArea ?? 70) / 100;
  const target = total * targetPct;
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

  const vpWidthPct = (s.vpWidth ?? 30) / 100;
  const maxBarW = Math.max(10, boxW * vpWidthPct);
  
  const alignRight = s.vpPlacement === 'right';

  const upColVA = s.vpUpColorVA || '#26a69a';
  const dnColVA = s.vpDownColorVA || '#ef5350';
  const upCol = s.vpUpColor || '#26a69a';
  const dnCol = s.vpDownColor || '#ef5350';

  ctx.save();
  // faint range box
  const yTop = toY(pMax), yBot = toY(pMin);
  if (yTop != null && yBot != null) {
    const boxY = Math.min(yTop, yBot);
    const boxH = Math.abs(yBot - yTop);

    ctx.fillStyle = 'rgba(41, 98, 255, 0.04)';
    ctx.fillRect(boxL, boxY, boxW, boxH);

    ctx.strokeStyle = 'rgba(120,123,134,0.2)';
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.strokeRect(boxL, boxY, boxW, boxH);
    ctx.setLineDash([]);
  }

  // Volume display mode: up/down split, single total bar, or up−down delta.
  const mode = s.vpMode ?? 'updown';
  const maxDelta = Math.max(1e-9, ...totals.map((_, i) => Math.abs(volUp[i] - volDn[i])));
  const barNorm = mode === 'delta' ? maxDelta : maxVol;

  for (let r = 0; r < ROWS; r++) {
    const rLo = pMin + r * rowH, rHi = rLo + rowH;
    const yA = toY(rHi), yB = toY(rLo);
    if (yA == null || yB == null) continue;
    const top = Math.min(yA, yB), barH = Math.max(1, Math.abs(yB - yA) - 1);
    const inVA = r >= vaDn && r <= vaUp;
    ctx.globalAlpha = inVA ? 0.8 : 0.3;

    if (mode === 'total') {
      const wT = (totals[r] / barNorm) * maxBarW;
      ctx.fillStyle = inVA ? upColVA : upCol;
      ctx.fillRect(alignRight ? boxR - wT : boxL, top, wT, barH);
    } else if (mode === 'delta') {
      const dlt = volUp[r] - volDn[r];
      const wD = (Math.abs(dlt) / barNorm) * maxBarW;
      ctx.fillStyle = dlt >= 0 ? (inVA ? upColVA : upCol) : (inVA ? dnColVA : dnCol);
      ctx.fillRect(alignRight ? boxR - wD : boxL, top, wD, barH);
    } else {
      const wUp = (volUp[r] / barNorm) * maxBarW;
      const wDn = (volDn[r] / barNorm) * maxBarW;
      ctx.fillStyle = inVA ? upColVA : upCol;
      if (alignRight) {
        ctx.fillRect(boxR - wUp, top, wUp, barH);
        ctx.fillStyle = inVA ? dnColVA : dnCol;
        ctx.fillRect(boxR - wUp - wDn, top, wDn, barH);
      } else {
        ctx.fillRect(boxL, top, wUp, barH);
        ctx.fillStyle = inVA ? dnColVA : dnCol;
        ctx.fillRect(boxL + wUp, top, wDn, barH);
      }
    }
    ctx.globalAlpha = 1;
  }

  // POC line
  const pocPrice = pMin + (pocRow + 0.5) * rowH;
  const yPoc = toY(pocPrice);
  ctx.font = '10px sans-serif';
  ctx.textBaseline = 'middle';
  if (yPoc != null && s.vpShowPOC !== false) {
    const pocCol = s.vpPocColor || '#ff9800';
    ctx.strokeStyle = pocCol; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(boxL, yPoc); ctx.lineTo(boxR, yPoc); ctx.stroke();
    ctx.fillStyle = pocCol;
    ctx.textAlign = alignRight ? 'left' : 'right';
    ctx.fillText(`POC ${fmt(pocPrice)}`, alignRight ? boxL + 4 : boxR - 4, yPoc - 7);
  }

  // VAH / VAL lines
  if (s.vpShowVA !== false) {
    const vah = pMin + (vaUp + 1) * rowH, val = pMin + vaDn * rowH;
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    
    const yVah = toY(vah);
    if (yVah != null) {
      const vahCol = s.vpVahColor || '#2962ff';
      ctx.strokeStyle = vahCol;
      ctx.beginPath(); ctx.moveTo(boxL, yVah); ctx.lineTo(boxR, yVah); ctx.stroke();
      ctx.fillStyle = vahCol;
      ctx.textAlign = alignRight ? 'left' : 'right';
      ctx.fillText(`VAH ${fmt(vah)}`, alignRight ? boxL + 4 : boxR - 4, yVah - 7);
    }

    const yVal = toY(val);
    if (yVal != null) {
      const valCol = s.vpValColor || '#2962ff';
      ctx.strokeStyle = valCol;
      ctx.beginPath(); ctx.moveTo(boxL, yVal); ctx.lineTo(boxR, yVal); ctx.stroke();
      ctx.fillStyle = valCol;
      ctx.textAlign = alignRight ? 'left' : 'right';
      ctx.fillText(`VAL ${fmt(val)}`, alignRight ? boxL + 4 : boxR - 4, yVal - 7);
    }
  }

  ctx.textAlign = 'left';
  ctx.setLineDash([]);
  ctx.restore();
}
