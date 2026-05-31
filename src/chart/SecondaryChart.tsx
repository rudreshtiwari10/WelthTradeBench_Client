import { useEffect, useRef, useState } from 'react';
import { createChart, HistogramSeries, type IChartApi, type ISeriesApi, type SeriesType } from 'lightweight-charts';
import { chartOptions, chartThemeOptions } from './theme';
import { createPriceSeries, priceData, volumeData, type PriceSeries } from './series';
import { fetchHistory, liveFeed } from '../data/dataService';
import { useUiStore } from '../state/uiStore';
import { TradeButtons } from '../components/TradeButtons';
import type { Candle } from '../data/types';
import type { Panel } from '../state/panelsStore';
import './ChartView.css';

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lightweight independent chart for non-active split-screen panels:
 *  candles + volume + crosshair + zoom/pan + live ticks. Click to activate. */
export function SecondaryChart({ panel, onActivate }: { panel: Panel; onActivate: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceRef = useRef<PriceSeries | null>(null);
  const volRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const [last, setLast] = useState<number | null>(null);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...chartOptions, ...chartThemeOptions(theme),
      width: containerRef.current.clientWidth, height: containerRef.current.clientHeight,
    });
    chartRef.current = chart;
    const ro = new ResizeObserver((e) => chart.resize(e[0].contentRect.width, e[0].contentRect.height));
    ro.observe(containerRef.current);
    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; priceRef.current = null; volRef.current = null; };
  }, []);

  useEffect(() => { chartRef.current?.applyOptions(chartThemeOptions(theme)); }, [theme]);

  // (Re)build series + load data on config change.
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    let cancelled = false;
    if (priceRef.current) chart.removeSeries(priceRef.current);
    const ps = createPriceSeries(chart, panel.chartType);
    priceRef.current = ps;
    if (!volRef.current) {
      const v = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
      v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volRef.current = v;
    }
    (async () => {
      const res = await fetchHistory(panel.symbol.symbol, panel.interval, 600);
      if (cancelled || priceRef.current !== ps) return;
      candlesRef.current = res.candles;
      ps.setData(priceData(res.candles, panel.chartType) as any);
      volRef.current!.setData(volumeData(res.candles) as any);
      chart.timeScale().fitContent();
      setLast(res.candles[res.candles.length - 1]?.close ?? null);
    })();
    return () => { cancelled = true; };
  }, [panel.symbol.symbol, panel.interval, panel.chartType]);

  // Live ticks.
  useEffect(() => {
    return liveFeed.subscribe(panel.symbol.symbol, (tick) => {
      const c = candlesRef.current; const ps = priceRef.current;
      if (!ps || c.length === 0) return;
      const lastC = c[c.length - 1];
      lastC.close = tick.ltp; lastC.high = Math.max(lastC.high, tick.ltp); lastC.low = Math.min(lastC.low, tick.ltp);
      ps.update(priceData([lastC], panel.chartType)[0] as any);
      setLast(tick.ltp);
    });
  }, [panel.symbol.symbol, panel.chartType]);

  return (
    <div className="chart-view secondary" onMouseDown={onActivate}>
      <div className="chart-legend">
        <div className="legend-row">
          <span className="legend-symbol">{panel.symbol.symbol}</span>
          <span className="legend-dot">·</span>
          <span className="legend-meta">{panel.interval}</span>
          <span className="legend-dot">·</span>
          <span className="legend-meta">{panel.symbol.exchange}</span>
          {last != null && <span className="legend-meta">{fmt(last)}</span>}
        </div>
      </div>
      <TradeButtons symbol={panel.symbol.symbol} />
      <div ref={containerRef} className="chart-canvas" />
    </div>
  );
}
