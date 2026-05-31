import { useEffect, useRef } from 'react';
import { LineSeries, HistogramSeries, LineStyle, type ISeriesApi, type SeriesType, type IPriceLine } from 'lightweight-charts';
import { useChartApi } from '../chart/ChartContext';
import { useChartStore } from '../state/chartStore';
import { useIndicatorStore } from '../state/indicatorStore';
import { getIndicator } from './registry';

interface Mounted {
  defId: string;
  paneIndex: number;
  series: ISeriesApi<SeriesType>[];
  priceLines: IPriceLine[];
}

/** Reconciles active indicator instances with chart series/panes and keeps
 *  their data in sync with candle updates. Renders nothing visible itself. */
export function IndicatorsRenderer() {
  const { chartRef, candlesRef, ready } = useChartApi();
  const instances = useIndicatorStore((s) => s.instances);
  const dataVersion = useChartStore((s) => s.dataVersion);
  const mounted = useRef<Map<string, Mounted>>(new Map());
  const nextPane = useRef(1);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !ready) return;
    const candles = candlesRef.current;
    const live = new Set(instances.map((i) => i.instId));

    // Remove series for instances that were deleted.
    for (const [instId, m] of mounted.current) {
      if (!live.has(instId)) {
        m.priceLines.forEach((pl, idx) => m.series[0]?.removePriceLine(pl));
        m.series.forEach((s) => { try { chart.removeSeries(s); } catch { /* gone */ } });
        mounted.current.delete(instId);
      }
    }

    // Create + update each instance.
    for (const inst of instances) {
      const def = getIndicator(inst.defId);
      if (!def) continue;
      const plots = def.build(candles, inst.inputs);
      let m = mounted.current.get(inst.instId);

      if (!m) {
        const paneIndex = def.overlay ? 0 : nextPane.current++;
        const series: ISeriesApi<SeriesType>[] = plots.map((p) =>
          p.kind === 'histogram'
            ? chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, paneIndex)
            : chart.addSeries(LineSeries, { color: p.color, lineWidth: (p.lineWidth ?? 2) as any, priceLineVisible: false, lastValueVisible: false }, paneIndex)
        );
        const priceLines: IPriceLine[] = [];
        if (def.guides && series[0]) {
          for (const g of def.guides) {
            priceLines.push(series[0].createPriceLine({ price: g, color: '#787b86', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '' }));
          }
        }
        if (!def.overlay) chart.panes()[paneIndex]?.setStretchFactor(0.25);
        m = { defId: inst.defId, paneIndex, series, priceLines };
        mounted.current.set(inst.instId, m);
      }

      // Sync data each pass.
      plots.forEach((p, idx) => {
        const s = m!.series[idx];
        if (!s) return;
        if (p.kind === 'line') s.applyOptions({ color: p.color });
        s.setData(p.data as any);
      });
    }
  }, [instances, dataVersion, ready, chartRef, candlesRef]);

  // Cleanup on unmount.
  useEffect(() => () => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const m of mounted.current.values()) m.series.forEach((s) => { try { chart.removeSeries(s); } catch { /* */ } });
    mounted.current.clear();
  }, [chartRef]);

  return null;
}
