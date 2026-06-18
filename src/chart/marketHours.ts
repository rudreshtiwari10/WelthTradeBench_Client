const IST_OFFSET_MS = 5.5 * 3600 * 1000; // UTC+5:30

function istMinutes(nowMs: number): { dayOfWeek: number; totalMinutes: number } {
  const d = new Date(nowMs + IST_OFFSET_MS);
  return {
    dayOfWeek: d.getUTCDay(), // 0=Sun … 6=Sat
    totalMinutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}

/**
 * Returns true if the market for the given instrument kind is currently open.
 *
 *  Commodity (MCX)  — Mon-Fri  09:00 – 23:30 IST
 *  Everything else  — Mon-Fri  09:15 – 15:30 IST  (NSE/BSE equity, index, FO, options)
 */
export function isMarketOpen(kind: string | undefined, nowMs: number = Date.now()): boolean {
  if (kind === 'crypto') return true; // 24/7

  const { dayOfWeek, totalMinutes } = istMinutes(nowMs);

  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // weekend

  if (kind === 'commodity') {
    return totalMinutes >= 9 * 60 && totalMinutes < 23 * 60 + 30;
  }

  return totalMinutes >= 9 * 60 + 15 && totalMinutes < 15 * 60 + 30;
}
