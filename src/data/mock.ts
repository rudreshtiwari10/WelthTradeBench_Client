import type { Candle, Interval } from './types';

// Seeded PRNG so the mock series is stable across reloads (deterministic chart).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1H': 3600, '2H': 7200, '4H': 14400,
  '1D': 86400, '1W': 604800, '1M': 2592000,
};

export function intervalSeconds(interval: Interval): number {
  return INTERVAL_SECONDS[interval] ?? 86400;
}

/**
 * Generate a realistic-looking OHLCV series ending at "now", aligned to the
 * interval. Geometric-random-walk with volatility clustering + volume.
 * Phase 2 replaces this with Upstox historical candles from the backend.
 */
export function generateCandles(
  symbol: string,
  interval: Interval,
  count = 500,
  startPrice = 23900
): Candle[] {
  const seed = [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0) * 7919 + count;
  const rand = mulberry32(seed);
  const step = intervalSeconds(interval);

  // Align the last bar to the interval boundary.
  const now = Math.floor(Date.now() / 1000);
  const lastTime = now - (now % step);

  const candles: Candle[] = [];
  let price = startPrice * (0.8 + rand() * 0.1);
  let vol = 0.012; // base per-bar volatility

  for (let i = count - 1; i >= 0; i--) {
    const time = lastTime - i * step;
    // Volatility clustering.
    vol = Math.max(0.004, Math.min(0.035, vol + (rand() - 0.5) * 0.004));
    const drift = (rand() - 0.49) * vol;
    const open = price;
    const close = Math.max(1, open * (1 + drift));
    const wick = open * vol * (0.4 + rand());
    const high = Math.max(open, close) + wick * rand();
    const low = Math.min(open, close) - wick * rand();
    const volume = Math.round((0.6 + rand() * 1.8) * 1_000_000 * (1 + Math.abs(drift) * 30));
    candles.push({
      time,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    });
    price = close;
  }
  return candles;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
