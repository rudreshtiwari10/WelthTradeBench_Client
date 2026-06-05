/**
 * Exchange-tick time synchronization.
 *
 * Derives true market time directly from the `ts` field on every WebSocket
 * tick coming from the Upstox exchange feed — no HTTP fetches, no caching
 * delays, no reliance on the user's local PC clock.
 *
 * The offset is updated the instant the first tick arrives and recalibrated
 * whenever a tick drifts more than 500 ms from the currently assumed time,
 * keeping candle boundaries and countdown timers millisecond-accurate.
 */

/** Difference (ms) between exchange time and local Date.now(). */
export let timeOffset = 0;

/**
 * Called by the LiveFeed WebSocket handler on every incoming tick.
 * @param exchangeUnixSec Exact Unix timestamp in seconds from the exchange.
 */
export function syncTimeWithTick(exchangeUnixSec: number): void {
  if (!exchangeUnixSec) return;
  const exchangeTimeMs = exchangeUnixSec * 1000;
  // Only recalibrate when the drift exceeds 500 ms to avoid jitter from
  // ticks that arrive slightly out of order.
  const currentAssumedTime = Date.now() + timeOffset;
  if (Math.abs(exchangeTimeMs - currentAssumedTime) > 500) {
    timeOffset = exchangeTimeMs - Date.now();
  }
}

/**
 * Returns milliseconds since Unix epoch, locked to the live exchange clock.
 * Drop-in replacement for Date.now() everywhere candle timing matters.
 */
export function getSyncedTime(): number {
  return Date.now() + timeOffset;
}
