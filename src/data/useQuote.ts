import { useEffect, useMemo, useState } from 'react';
import { fetchHistory, liveFeed } from './dataService';

interface QuoteState {
  last: number | null;
  prevClose: number | null;
  closes: number[];
  times: number[];
}

export interface PerfCell { label: string; val: string; dir: 'up' | 'down'; }

export interface Quote {
  last: number | null;
  prevClose: number | null;
  chg: number;
  pct: number;
  dir: 'up' | 'down';
  perf: PerfCell[];
  loading: boolean;
}

const PERF_DEFS: { label: string; bars: number | 'ytd' }[] = [
  { label: '1D', bars: 1 }, { label: '5D', bars: 5 }, { label: '1M', bars: 21 },
  { label: '6M', bars: 126 }, { label: 'YTD', bars: 'ytd' }, { label: '1Y', bars: 252 },
];

/** Loads daily history once, then tracks the live last price over the feed.
 *  `withPerf` also computes the performance grid (uses a larger window). */
export function useQuote(symbol: string, withPerf = false): Quote {
  const [st, setSt] = useState<QuoteState>({ last: null, prevClose: null, closes: [], times: [] });
  const count = withPerf ? 320 : 2;

  useEffect(() => {
    let cancelled = false;
    setSt({ last: null, prevClose: null, closes: [], times: [] });
    fetchHistory(symbol, '1D', count).then((res) => {
      if (cancelled) return;
      const cs = res.candles;
      setSt({
        last: cs[cs.length - 1]?.close ?? null,
        prevClose: cs[cs.length - 2]?.close ?? null,
        closes: cs.map((c) => c.close),
        times: cs.map((c) => c.time),
      });
    }).catch(() => {});
    const unsub = liveFeed.subscribe(symbol, (t) => setSt((s) => ({ ...s, last: t.ltp })));
    return () => { cancelled = true; unsub(); };
  }, [symbol, count]);

  return useMemo(() => {
    const last = st.last;
    const prevClose = st.prevClose;
    const chg = last != null && prevClose != null ? last - prevClose : 0;
    const pct = prevClose ? (chg / prevClose) * 100 : 0;
    const dir: 'up' | 'down' = chg >= 0 ? 'up' : 'down';

    let perf: PerfCell[] = [];
    if (withPerf && last != null && st.closes.length > 1) {
      const cl = st.closes, n = cl.length;
      const yearStart = (() => {
        const y = new Date().getUTCFullYear();
        for (let i = 0; i < st.times.length; i++) if (new Date(st.times[i] * 1000).getUTCFullYear() === y) return cl[i];
        return cl[0];
      })();
      perf = PERF_DEFS.map(({ label, bars }) => {
        const base = bars === 'ytd' ? yearStart : cl[n - 1 - (bars as number)];
        const p = base ? ((last - base) / base) * 100 : 0;
        return { label, val: `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}%`, dir: (p >= 0 ? 'up' : 'down') as 'up' | 'down' };
      });
    }
    return { last, prevClose, chg, pct, dir, perf, loading: last == null };
  }, [st, withPerf]);
}
