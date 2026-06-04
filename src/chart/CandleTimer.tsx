import { useEffect, useState } from 'react';
import { useChartApi } from './ChartContext';
import { useChartStore } from '../state/chartStore';

const INTERVAL_SEC: Record<string, number> = {
  '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
  '1H': 3600, '2H': 7200, '4H': 14400,
  '1D': 86400, '1W': 604800, '1M': 2592000,
};

const IST = 19800; // UTC+5:30 in seconds

function fmtRemaining(sec: number): string {
  if (sec <= 0) return '0:00';
  if (sec >= 86400) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return `${d}d ${h}h`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface TimerDisplay {
  text: string;
  y: number;
  up: boolean;
}

export function CandleTimer() {
  const { seriesRef, candlesRef } = useChartApi();
  const interval = useChartStore((s) => s.interval);
  const [display, setDisplay] = useState<TimerDisplay | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const update = () => {
      const candles = candlesRef.current;
      const series  = seriesRef.current;

      if (!candles.length || !series) {
        setDisplay(null);
      } else {
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const intervalSec = INTERVAL_SEC[interval] ?? 86400;

        // Use real-time wall clock (millisecond precision) so the countdown is
        // always computed from the true current moment, not a stale snapshot.
        const nowMs  = Date.now();
        const nowSec = Math.floor(nowMs / 1000);

        // IST-aligned bar boundary — identical to the tick handler's barTs formula.
        const barStart  = Math.floor((nowSec + IST) / intervalSec) * intervalSec - IST;
        const remaining = Math.max(0, barStart + intervalSec - nowSec);

        const text = fmtRemaining(remaining);
        const up   = last.close >= (prev?.close ?? last.open);

        try {
          const rawY = series.priceToCoordinate(last.close);
          if (rawY != null) {
            const y = Math.round(rawY);
            setDisplay((cur) => {
              if (cur && cur.text === text && Math.abs(cur.y - y) < 1 && cur.up === up) return cur;
              return { text, y, up };
            });
          } else {
            setDisplay(null);
          }
        } catch {
          setDisplay(null);
        }
      }

      // Schedule the next tick to fire at the exact start of the next wall-clock
      // second.  Computing this AFTER the update body means execution time is
      // already absorbed, so the next fire lands precisely on the second boundary
      // with no drift accumulation.
      const msToNextSec = 1000 - (Date.now() % 1000);
      timeoutId = setTimeout(update, msToNextSec);
    };

    // Fire immediately (don't wait for the first second boundary).
    update();

    return () => clearTimeout(timeoutId);
    // seriesRef / candlesRef are stable refs; only interval drives re-setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  if (!display) return null;

  return (
    <div
      className={`candle-timer ${display.up ? 'timer-up' : 'timer-down'}`}
      style={{ top: display.y + 12 }}
    >
      {display.text}
    </div>
  );
}
