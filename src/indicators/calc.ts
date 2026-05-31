import type { Candle } from '../data/types';

export type Num = number | null;
export interface LinePoint { time: number; value: number; }

const closes = (c: Candle[]) => c.map((x) => x.close);

/** Map an aligned (possibly null-padded) value array to line points. */
export function toPoints(candles: Candle[], values: Num[]): LinePoint[] {
  const out: LinePoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) out.push({ time: candles[i].time, value: v });
  }
  return out;
}

export function sma(values: number[], length: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

export function ema(values: number[], length: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  const k = 2 / (length + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    if (i === length - 1) { // seed with SMA
      let s = 0; for (let j = 0; j < length; j++) s += values[j];
      prev = s / length; out[i] = prev;
    } else if (prev != null) {
      prev = values[i] * k + prev * (1 - k); out[i] = prev;
    }
  }
  return out;
}

export function wma(values: number[], length: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  const denom = (length * (length + 1)) / 2;
  for (let i = length - 1; i < values.length; i++) {
    let s = 0;
    for (let j = 0; j < length; j++) s += values[i - j] * (length - j);
    out[i] = s / denom;
  }
  return out;
}

export function stddev(values: number[], length: number, mean: Num[]): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i++) {
    const m = mean[i]; if (m == null) continue;
    let s = 0;
    for (let j = 0; j < length; j++) s += (values[i - j] - m) ** 2;
    out[i] = Math.sqrt(s / length);
  }
  return out;
}

export function rsi(candles: Candle[], length: number): Num[] {
  const v = closes(candles);
  const out: Num[] = new Array(v.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i < v.length; i++) {
    const ch = v[i] - v[i - 1];
    const gain = Math.max(ch, 0), loss = Math.max(-ch, 0);
    if (i <= length) {
      avgGain += gain; avgLoss += loss;
      if (i === length) {
        avgGain /= length; avgLoss /= length;
        out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
      }
    } else {
      avgGain = (avgGain * (length - 1) + gain) / length;
      avgLoss = (avgLoss * (length - 1) + loss) / length;
      out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
    }
  }
  return out;
}

export function macd(candles: Candle[], fast: number, slow: number, signal: number) {
  const v = closes(candles);
  const ef = ema(v, fast), es = ema(v, slow);
  const macdLine: Num[] = v.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null));
  const macdVals = macdLine.map((x) => (x == null ? 0 : x));
  const sig = ema(macdVals, signal).map((x, i) => (macdLine[i] == null ? null : x));
  const hist: Num[] = macdLine.map((m, i) => (m != null && sig[i] != null ? m - (sig[i] as number) : null));
  return { macdLine, signal: sig, hist };
}

export function stochastic(candles: Candle[], kLen: number, dLen: number) {
  const k: Num[] = new Array(candles.length).fill(null);
  for (let i = kLen - 1; i < candles.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = 0; j < kLen; j++) { hh = Math.max(hh, candles[i - j].high); ll = Math.min(ll, candles[i - j].low); }
    k[i] = hh === ll ? 50 : ((candles[i].close - ll) / (hh - ll)) * 100;
  }
  const kVals = k.map((x) => (x == null ? 0 : x));
  const d = sma(kVals, dLen).map((x, i) => (k[i] == null ? null : x));
  return { k, d };
}

export function atr(candles: Candle[], length: number): Num[] {
  const tr: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const p = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - p), Math.abs(c.low - p));
  });
  return ema(tr, length);
}

export function vwap(candles: Candle[]): Num[] {
  const out: Num[] = new Array(candles.length).fill(null);
  let cumPV = 0, cumV = 0;
  for (let i = 0; i < candles.length; i++) {
    const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
    cumPV += tp * candles[i].volume; cumV += candles[i].volume;
    out[i] = cumV ? cumPV / cumV : null;
  }
  return out;
}

export function bollinger(candles: Candle[], length: number, mult: number) {
  const v = closes(candles);
  const basis = sma(v, length);
  const sd = stddev(v, length, basis);
  const upper: Num[] = basis.map((b, i) => (b != null && sd[i] != null ? b + mult * (sd[i] as number) : null));
  const lower: Num[] = basis.map((b, i) => (b != null && sd[i] != null ? b - mult * (sd[i] as number) : null));
  return { basis, upper, lower };
}
