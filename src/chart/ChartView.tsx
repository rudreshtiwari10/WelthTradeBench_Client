import { useEffect, useRef, useState } from 'react';
import {
  createChart, HistogramSeries, type IChartApi, type ISeriesApi, type SeriesType,
  type MouseEventParams,
} from 'lightweight-charts';
import { chartOptions, chartThemeOptions } from './theme';
import { useUiStore } from '../state/uiStore';
import { useSettingsStore } from '../state/settingsStore';
import { useChartBridge } from '../state/chartBridge';
import { createPriceSeries, priceData, volumeData, type PriceSeries } from './series';
import { useChartStore } from '../state/chartStore';
import { useDrawingStore } from '../state/drawingStore';
import { useReplayStore } from '../state/replayStore';
import { fetchHistory, liveFeed } from '../data/dataService';
import type { Candle } from '../data/types';
import { ChartContext } from './ChartContext';
import { DrawingLayer } from '../drawings/DrawingLayer';
import { DrawingToolbarState } from '../drawings/DrawingProperties';
import { IndicatorsRenderer } from '../indicators/IndicatorsRenderer';
import { IndicatorLegend } from '../indicators/IndicatorLegend';
import { CompareRenderer } from './CompareRenderer';
import { useCompareStore } from '../state/compareStore';
import { TradeButtons } from '../components/TradeButtons';
import { AlertsRenderer } from '../components/AlertsRenderer';
import { ReplayBar } from '../components/ReplayBar';
import { ObjectTree } from '../components/ObjectTree';
import { ChartWidgets } from '../components/ChartWidgets';
import { PositionLines } from '../components/PositionLines';
import './ChartView.css';

interface LegendData {
  open: number; high: number; low: number; close: number;
  prevClose: number; volume: number;
}

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVol = (n: number) =>
  n >= 1e7 ? (n / 1e7).toFixed(2) + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(2) + 'L' : n.toLocaleString('en-IN');

export function ChartView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<PriceSeries | null>(null);
  const volSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  const { symbol, interval, chartType } = useChartStore();
  const loadDrawings = useDrawingStore((s) => s.loadFor);
  const [ready, setReady] = useState(false);
  const [legend, setLegend] = useState<LegendData | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const resetView = () => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.timeScale().fitContent();
    priceSeriesRef.current?.priceScale().applyOptions({ autoScale: true });
    setMenu(null);
  };

  // Create chart once.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...chartOptions,
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });
    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.resize(width, height);
    });
    ro.observe(containerRef.current);

    const onMove = (param: MouseEventParams) => {
      const series = priceSeriesRef.current;
      const candles = candlesRef.current;
      if (!series) return;
      let idx = candles.length - 1;
      if (param.time != null && param.seriesData.has(series)) {
        idx = candles.findIndex((c) => c.time === (param.time as number));
        if (idx < 0) idx = candles.length - 1;
      }
      const c = candles[idx];
      const prev = candles[idx - 1];
      if (c) setLegend({ open: c.open, high: c.high, low: c.low, close: c.close, prevClose: prev?.close ?? c.open, volume: c.volume });
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
      // Series belong to the removed chart — drop refs so the data effect
      // recreates them against the next chart (handles StrictMode remount).
      priceSeriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, []);

  // Keep current chart type available to the (long-lived) tick handler.
  const chartTypeRef = useRef(chartType);
  chartTypeRef.current = chartType;

  // (Re)build series for the chart type and (re)load history from the backend.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let cancelled = false;

    // Recreate price series for the chart type.
    if (priceSeriesRef.current) chart.removeSeries(priceSeriesRef.current);
    const priceSeries = createPriceSeries(chart, chartType);
    priceSeriesRef.current = priceSeries;

    // Volume overlay in the bottom 20% of the main pane (matches TV default).
    if (!volSeriesRef.current) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volSeriesRef.current = vol;
    }
    setReady(true);
    loadDrawings(`${symbol.symbol}:${interval}`);

    (async () => {
      const res = await fetchHistory(symbol.symbol, interval, 600, symbol.instrumentKey);
      if (cancelled || priceSeriesRef.current !== priceSeries) return;
      const candles = res.candles;
      candlesRef.current = candles;
      priceSeries.setData(priceData(candles, chartType) as any);
      volSeriesRef.current!.setData(volumeData(candles) as any);
      chart.timeScale().fitContent();
      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      if (last) setLegend({ open: last.open, high: last.high, low: last.low, close: last.close, prevClose: prev?.close ?? last.open, volume: last.volume });
      useChartStore.getState().setBarCount(candles.length);
      useChartStore.getState().bumpData();
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, symbol.symbol, interval]);

  // Re-skin the chart when the app theme changes.
  const theme = useUiStore((st) => st.theme);
  useEffect(() => {
    chartRef.current?.applyOptions(chartThemeOptions(theme));
  }, [theme, ready]);

  // Apply chart appearance settings (the gear dialog).
  const settings = useSettingsStore();
  useEffect(() => {
    const chart = chartRef.current; if (!chart) return;
    chart.applyOptions({
      grid: { vertLines: { visible: settings.gridVisible }, horzLines: { visible: settings.gridVisible } },
      crosshair: { vertLine: { color: settings.crosshairColor }, horzLine: { color: settings.crosshairColor } },
      ...(settings.background ? { layout: { background: { color: settings.background } } } : {}),
    });
    volSeriesRef.current?.applyOptions({ visible: settings.showVolume });
    const series = priceSeriesRef.current;
    if (series && ['candles', 'hollow', 'heikin'].includes(chartType)) {
      series.applyOptions({
        upColor: settings.upColor, downColor: settings.downColor,
        borderVisible: settings.borderVisible,
        borderUpColor: settings.upColor, borderDownColor: settings.downColor,
        wickUpColor: settings.wickVisible ? settings.upColor : 'rgba(0,0,0,0)',
        wickDownColor: settings.wickVisible ? settings.downColor : 'rgba(0,0,0,0)',
      } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, ready, chartType]);

  // Register chart actions for the top toolbar (snapshot, reset).
  useEffect(() => {
    const takeSnapshot = async (): Promise<Blob | null> => {
      const chart = chartRef.current; if (!chart) return null;
      const base = chart.takeScreenshot();
      const out = document.createElement('canvas');
      out.width = base.width; out.height = base.height;
      const ctx = out.getContext('2d'); if (!ctx) return null;
      ctx.drawImage(base, 0, 0);
      const overlay = containerRef.current?.parentElement?.querySelector('.draw-canvas') as HTMLCanvasElement | null;
      if (overlay && overlay.width) ctx.drawImage(overlay, 0, 0, out.width, out.height);
      return new Promise((res) => out.toBlob((b) => res(b), 'image/png'));
    };
    useChartBridge.getState().register({ takeSnapshot, resetView });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Bottom-bar timeframe quick-select → set visible logical range.
  const rangeReq = useChartStore((st) => st.rangeReq);
  useEffect(() => {
    if (!rangeReq) return;
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || candles.length === 0) return;
    const stepSec = (candles[1]?.time ?? candles[0].time + 86400) - candles[0].time;
    const DAYS: Record<string, number> = { '1D': 1, '5D': 5, '1M': 22, '3M': 66, '6M': 132, YTD: 0, '1Y': 252, '5Y': 1260, All: 1e9 };
    const len = candles.length;
    if (rangeReq.label === 'All') { chart.timeScale().fitContent(); return; }
    let bars: number;
    if (rangeReq.label === 'YTD') {
      const y = new Date().getUTCFullYear();
      const idx = candles.findIndex((c) => new Date(c.time * 1000).getUTCFullYear() === y);
      bars = idx >= 0 ? len - idx : Math.round((365 * 86400) / stepSec);
    } else {
      bars = Math.max(2, Math.round((DAYS[rangeReq.label] * 86400) / stepSec));
    }
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, len - bars), to: len + 4 } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeReq?.nonce]);

  // ── Bar Replay ────────────────────────────────────────────────────────
  const replayActive = useReplayStore((st) => st.active);
  const replayIndex = useReplayStore((st) => st.index);
  const replayPlaying = useReplayStore((st) => st.playing);
  const replaySpeed = useReplayStore((st) => st.speed);

  // Reveal candles[0..index] while replaying; restore full data on exit.
  useEffect(() => {
    const series = priceSeriesRef.current, vol = volSeriesRef.current;
    const candles = candlesRef.current;
    if (!series || !vol || candles.length === 0) return;
    if (replayActive) {
      const slice = candles.slice(0, replayIndex);
      series.setData(priceData(slice, chartTypeRef.current) as any);
      vol.setData(volumeData(slice) as any);
    } else {
      series.setData(priceData(candles, chartTypeRef.current) as any);
      vol.setData(volumeData(candles) as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayActive, replayIndex]);

  useEffect(() => {
    if (!replayActive || !replayPlaying) return;
    const id = setInterval(() => {
      const st = useReplayStore.getState();
      if (st.index >= st.total) { st.pause(); return; }
      st.step();
    }, 1000 / replaySpeed);
    return () => clearInterval(id);
  }, [replayActive, replayPlaying, replaySpeed]);

  // Compares belong to the main symbol — clear them when it changes.
  const compares = useCompareStore((st) => st.compares);
  const removeCompare = useCompareStore((st) => st.remove);
  useEffect(() => { useCompareStore.getState().clear(); }, [symbol.symbol]);

  // Live ticks: update the forming (last) candle in real time.
  useEffect(() => {
    const unsub = liveFeed.subscribe(symbol.symbol, (tick) => {
      if (useReplayStore.getState().active) return;
      const candles = candlesRef.current;
      const series = priceSeriesRef.current;
      if (!series || candles.length === 0) return;
      const last = candles[candles.length - 1];
      last.close = tick.ltp;
      last.high = Math.max(last.high, tick.ltp);
      last.low = Math.min(last.low, tick.ltp);
      series.update(priceData([last], chartTypeRef.current)[0] as any);
      const prev = candles[candles.length - 2];
      setLegend({ open: last.open, high: last.high, low: last.low, close: last.close, prevClose: prev?.close ?? last.open, volume: last.volume });
      useChartStore.getState().bumpData();
    });
    return unsub;
  }, [symbol.symbol]);

  const up = legend ? legend.close >= legend.prevClose : true;
  const chg = legend ? legend.close - legend.prevClose : 0;
  const chgPct = legend && legend.prevClose ? (chg / legend.prevClose) * 100 : 0;
  const cls = up ? 'up' : 'down';

  return (
    <ChartContext.Provider value={{ chartRef, seriesRef: priceSeriesRef, candlesRef, containerRef, ready }}>
    <div className="chart-view">
      <div className="chart-legend">
        <div className="legend-row">
          <span className="legend-symbol">{symbol.name}</span>
          <span className="legend-dot">·</span>
          <span className="legend-meta">{interval}</span>
          <span className="legend-dot">·</span>
          <span className="legend-meta">{symbol.exchange}</span>
          {legend && (
            <span className="legend-ohlc">
              <span>O<b className={cls}>{fmt(legend.open)}</b></span>
              <span>H<b className={cls}>{fmt(legend.high)}</b></span>
              <span>L<b className={cls}>{fmt(legend.low)}</b></span>
              <span>C<b className={cls}>{fmt(legend.close)}</b></span>
              <span className={cls}>{chg >= 0 ? '+' : '−'}{fmt(Math.abs(chg))} ({chgPct >= 0 ? '+' : '−'}{Math.abs(chgPct).toFixed(2)}%)</span>
            </span>
          )}
        </div>
        <div className="legend-row legend-vol">
          <span className="legend-meta">Vol · {symbol.exchange}</span>
          {legend && <span className={cls}>{fmtVol(legend.volume)}</span>}
        </div>
        {compares.map((c) => (
          <div className="legend-row compare-row" key={c.symbol}>
            <span className="cmp-dot" style={{ background: c.color }} />
            <span className="cmp-name" style={{ color: c.color }}>{c.symbol}</span>
            <span className="legend-meta">{c.name}</span>
            <button className="cmp-remove" title="Remove comparison" onClick={() => removeCompare(c.symbol)}>×</button>
          </div>
        ))}
      </div>

      <div
        ref={containerRef}
        className="chart-canvas"
        onDoubleClick={resetView}
        onContextMenu={(e) => {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: e.clientX - r.left, y: e.clientY - r.top });
        }}
      />

      <IndicatorLegend />
      <TradeButtons symbol={symbol.symbol} />
      {ready && <IndicatorsRenderer />}
      {ready && <CompareRenderer />}
      {ready && <AlertsRenderer />}
      {ready && <DrawingLayer />}
      <DrawingToolbarState />
      <ReplayBar />
      <ObjectTree />
      {ready && <PositionLines />}
      <ChartWidgets />

      <div className="chart-watermark"><span className="wm-logo">◧</span> TradingView</div>

      {menu && (
        <>
          <div className="ctx-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
            <button className="ctx-item" onClick={resetView}>Reset chart view</button>
            <div className="ctx-sep" />
            <button className="ctx-item" onClick={() => { priceSeriesRef.current?.priceScale().applyOptions({ autoScale: true }); setMenu(null); }}>Auto (fit data to screen)</button>
            <button className="ctx-item" onClick={() => setMenu(null)}>Reset price scale</button>
            <div className="ctx-sep" />
            <button className="ctx-item disabled" disabled>Settings…</button>
          </div>
        </>
      )}
    </div>
    </ChartContext.Provider>
  );
}
