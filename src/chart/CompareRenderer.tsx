import { useEffect, useRef } from 'react';
import { LineSeries, type ISeriesApi, type SeriesType } from 'lightweight-charts';
import { useChartApi } from './ChartContext';
import { useChartStore } from '../state/chartStore';
import { useCompareStore } from '../state/compareStore';
import { fetchHistory } from '../data/dataService';

// Overlays compared symbols as line series, each on its own hidden price scale
// so they auto-fit and visually overlay (TradingView "compare / new scale").
export function CompareRenderer() {
  const { chartRef, ready } = useChartApi();
  const compares = useCompareStore((s) => s.compares);
  const interval = useChartStore((s) => s.interval);
  const mounted = useRef<Map<string, ISeriesApi<SeriesType>>>(new Map());

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    const live = new Set(compares.map((c) => c.symbol));

    // remove deselected
    for (const [sym, series] of mounted.current) {
      if (!live.has(sym)) { try { chart.removeSeries(series); } catch { /* */ } mounted.current.delete(sym); }
    }

    let cancelled = false;
    for (const c of compares) {
      if (mounted.current.has(c.symbol)) {
        mounted.current.get(c.symbol)!.applyOptions({ color: c.color });
        continue;
      }
      const scaleId = `cmp_${c.symbol}`;
      const series = chart.addSeries(LineSeries, {
        color: c.color, lineWidth: 2, priceScaleId: scaleId,
        lastValueVisible: true, priceLineVisible: false,
      });
      series.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.2 }, visible: false });
      mounted.current.set(c.symbol, series);
      fetchHistory(c.symbol, interval, 600).then((res) => {
        if (cancelled || !mounted.current.has(c.symbol)) return;
        series.setData(res.candles.map((k) => ({ time: k.time as any, value: k.close })));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [compares, interval, ready, chartRef]);

  // Reload compare data when interval changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    let cancelled = false;
    for (const c of compares) {
      const series = mounted.current.get(c.symbol);
      if (!series) continue;
      fetchHistory(c.symbol, interval, 600).then((res) => {
        if (!cancelled) series.setData(res.candles.map((k) => ({ time: k.time as any, value: k.close })));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  return null;
}
