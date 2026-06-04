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
import { usePanelsStore } from '../state/panelsStore';
import { usePanelId } from '../state/PanelContext';
import { useDrawingStore } from '../state/drawingStore';
import { useReplayStore } from '../state/replayStore';
import { fetchHistory, liveFeed } from '../data/dataService';
import { useToastStore } from '../state/toastStore';
import { useBrokerStore } from '../state/brokerStore';
import type { Candle, SymbolInfo, Interval, ChartType } from '../data/types';
import { ChartContext } from './ChartContext';
import { PanelHeader } from '../components/PanelHeader';
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
import { CandleTimer } from './CandleTimer';
import { isMarketOpen } from './marketHours';
import './ChartView.css';

interface LegendData {
  open: number; high: number; low: number; close: number;
  prevClose: number; volume: number;
}

const DEFAULT_SYMBOL: SymbolInfo = { symbol: 'NIFTY', name: 'Nifty 50 Index', exchange: 'NSE', kind: 'index' };

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVol = (n: number) =>
  n >= 1e7 ? (n / 1e7).toFixed(2) + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(2) + 'L' : n.toLocaleString('en-IN');

export function ChartView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const priceSeriesRef = useRef<PriceSeries | null>(null);
  const volSeriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const candlesRef = useRef<Candle[]>([]);

  const panelId = usePanelId();
  const symbol   = usePanelsStore((s) => s.panels.find((p) => p.id === panelId)?.symbol   ?? DEFAULT_SYMBOL);
  const interval = usePanelsStore((s) => s.panels.find((p) => p.id === panelId)?.interval ?? '1D') as Interval;
  const chartType = usePanelsStore((s) => s.panels.find((p) => p.id === panelId)?.chartType ?? 'candles') as ChartType;
  const layout = usePanelsStore((s) => s.layout);
  const isSplit = layout !== 'single';
  const loadDrawings = useDrawingStore((s) => s.loadFor);
  const pushToast = useToastStore((s) => s.push);
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

  // Intraday intervals need time shown on the X-axis; daily/weekly/monthly don't.
  const INTRADAY = new Set(['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H']);
  useEffect(() => {
    if (!ready) return;
    chartRef.current?.applyOptions({
      timeScale: { timeVisible: INTRADAY.has(interval), secondsVisible: false },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, ready]);

  // Keep current chart type and interval available to the (long-lived) tick handler.
  // Using refs instead of deps avoids resubscribing on every timeframe switch;
  // when interval changes the data-load effect clears candlesRef anyway so
  // in-flight ticks are dropped by the candles.length === 0 guard.
  const chartTypeRef = useRef(chartType);
  chartTypeRef.current = chartType;
  const intervalRef = useRef(interval);
  intervalRef.current = interval;

  // (Re)build price/volume series on symbol/interval/chartType change.
  //
  // Historical candles are fetched for ALL instruments so the chart shows data
  // immediately instead of starting empty.  Live instruments (indices, stocks,
  // MCX commodities) additionally receive WebSocket ticks that update the latest
  // bar in real-time on top of this history.  MOCK derivatives have no live tick
  // stream, so they rely entirely on the static history returned here.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Clear stale candles immediately — the tick handler checks this array.
    candlesRef.current = [];
    setLegend(null);

    // Recreate price series for the chart type.
    if (priceSeriesRef.current) chart.removeSeries(priceSeriesRef.current);
    const priceSeries = createPriceSeries(chart, chartType);
    priceSeriesRef.current = priceSeries;

    // Volume overlay in the bottom 20% of the main pane.
    if (!volSeriesRef.current) {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol' });
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      volSeriesRef.current = vol;
    }

    setReady(true);
    loadDrawings(`${symbol.symbol}:${interval}`);
    if (usePanelsStore.getState().activeId === panelId) useChartStore.getState().setBarCount(0);
    useChartStore.getState().bumpData();

    // Fetch history for all instruments so the chart is never blank on load.
    // Live instruments will continue receiving ticks on top of this data.
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetchHistory(symbol.symbol, interval, 300, symbol.instrumentKey, ac.signal);
        if (ac.signal.aborted || priceSeriesRef.current !== priceSeries) return;
        const candles = res.candles;
        if (!candles.length) return;
        candlesRef.current = candles;
        priceSeries.setData(priceData(candles, chartType) as any);
        volSeriesRef.current!.setData(volumeData(candles) as any);
        chart.timeScale().fitContent();
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        if (last) setLegend({ open: last.open, high: last.high, low: last.low, close: last.close, prevClose: prev?.close ?? last.open, volume: last.volume });
        if (usePanelsStore.getState().activeId === panelId) useChartStore.getState().setBarCount(candles.length);
        useChartStore.getState().bumpData();
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('[ChartView] history fetch failed:', e);
      }
    })();
    return () => { ac.abort(); };
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
  // Uses actual candle timestamps so "1D" always means 1 calendar day of real bars,
  // regardless of interval (75 bars on 5m, 375 on 1m, 1 bar on 1D, etc.).
  const rangeReq = useChartStore((st) => st.rangeReq);
  useEffect(() => {
    if (!rangeReq || usePanelsStore.getState().activeId !== panelId) return;
    const chart = chartRef.current;
    const candles = candlesRef.current;
    if (!chart || candles.length === 0) return;
    const len = candles.length;
    if (rangeReq.label === 'All') { chart.timeScale().fitContent(); return; }

    const CALENDAR_DAYS: Record<string, number> = {
      '1D': 1, '5D': 5, '1M': 30, '3M': 91, '6M': 182, '1Y': 365, '5Y': 1825,
    };
    let bars: number;
    if (rangeReq.label === 'YTD') {
      const yearStart = new Date(new Date().getUTCFullYear(), 0, 1).getTime() / 1000;
      const idx = candles.findIndex((c) => c.time >= yearStart);
      bars = idx >= 0 ? len - idx : len;
    } else {
      // Find the first candle at or after (now − N calendar days).
      const cutoffSec = Date.now() / 1000 - (CALENDAR_DAYS[rangeReq.label] ?? 30) * 86400;
      const idx = candles.findIndex((c) => c.time >= cutoffSec);
      bars = idx >= 0 ? len - idx : len;
    }
    bars = Math.max(2, bars);
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

  // ── Pure real-time tick → candle engine ────────────────────────────────
  //
  // No REST history is fetched for live instruments.  Every candle on the chart
  // is built from arriving WebSocket ticks:
  //
  //  • First tick ever  → creates the first bar (open = close = ltp).
  //  • Same bar period  → updates high / low / close of the current bar.
  //  • New bar period   → opens bar with previous close as open, scrolls
  //                       chart rightward so the advancing bar is always visible.
  //
  // Bar boundaries are anchored to 09:15 IST (MOPEN_UTC = 13500 s from midnight UTC)
  // to match Upstox's candle timestamp convention for every interval and exchange:
  //   barTs = floor((tick.ts − 13500) / intervalSec) * intervalSec + 13500
  //
  // MOCK derivatives (MOCK:option:… / MOCK:future:…) skip this subscription —
  // they have no live tick stream and use static REST history instead.
  useEffect(() => {
    if (symbol.instrumentKey?.startsWith('MOCK:')) return;

    const INTERVAL_SEC: Record<string, number> = {
      '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
      '1H': 3600, '2H': 7200, '4H': 14400,
      '1D': 86400, '1W': 604800, '1M': 2592000,
    };
    // 09:15 IST = 03:45 UTC = 13500 s from midnight UTC.
    // Upstox timestamps ALL candle intervals (1m through 1M) relative to this anchor.
    const MOPEN_UTC = 13500;

    // Single anchor for every interval: 09:15 IST = 03:45 UTC = 13500 s from midnight UTC.
    // Upstox timestamps ALL candles (1m → 1M) relative to this market-open anchor,
    // so using it here makes live barTs() match historical candle timestamps exactly.
    const barTs = (tickTs: number): number => {
      const sec = INTERVAL_SEC[intervalRef.current] ?? 86400;
      return Math.floor((tickTs - MOPEN_UTC) / sec) * sec + MOPEN_UTC;
    };

    // ── Shared helper: push a new bar onto candles + update chart ──────────
    const openNewBar = (ts: number, openPrice: number) => {
      const series = priceSeriesRef.current;
      if (!series) return;
      const candles = candlesRef.current;
      const newBar: Candle = {
        time: ts,
        open: openPrice,
        high: openPrice,
        low:  openPrice,
        close: openPrice,
        volume: 0,
      };
      candles.push(newBar);
      series.update(priceData([newBar], chartTypeRef.current)[0] as any);
      volSeriesRef.current?.update({ time: ts as any, value: 0, color: 'rgba(120,120,120,0.35)' });
      chartRef.current?.timeScale().scrollToRealTime();
      useChartStore.getState().setBarCount(candles.length);
      const prev = candles[candles.length - 2];
      setLegend({
        open: openPrice, high: openPrice, low: openPrice, close: openPrice,
        prevClose: prev?.close ?? openPrice, volume: 0,
      });
      useChartStore.getState().bumpData();
    };

    // ── Wall-clock bar-boundary enforcer ────────────────────────────────────
    // Brokers (e.g. Upstox ltpc mode) may send ticks only every ~15 s.
    // Without this, the new candle would open 0–15 s late depending on when
    // the next tick arrives.  Instead we schedule a setTimeout that fires at
    // the exact IST-aligned boundary and pre-opens the new bar; any ticks that
    // arrive afterwards simply update its OHLC in the normal path below.
    let boundaryTimer: ReturnType<typeof setTimeout>;

    const scheduleBoundary = () => {
      const nowMs  = Date.now();
      const nowSec = nowMs / 1000;
      const sec    = INTERVAL_SEC[intervalRef.current] ?? 86400;
      const nextBarStart = (Math.floor((nowSec - MOPEN_UTC) / sec) + 1) * sec + MOPEN_UTC;
      const delay  = Math.max(50, (nextBarStart - nowSec) * 1000);

      boundaryTimer = setTimeout(() => {
        if (!useReplayStore.getState().active && isMarketOpen(symbol.kind)) {
          const candles = candlesRef.current;
          const ts = barTs(Math.floor(Date.now() / 1000));
          if (candles.length && ts > candles[candles.length - 1].time) {
            openNewBar(ts, candles[candles.length - 1].close);
          }
        }
        scheduleBoundary(); // re-arm for the next boundary
      }, delay);
    };

    scheduleBoundary();

    const unsub = liveFeed.subscribe(symbol.symbol, (tick) => {
      if (useReplayStore.getState().active) return;
      const series = priceSeriesRef.current;
      if (!series) return;
      const candles = candlesRef.current;
      const ts = barTs(tick.ts);

      if (candles.length === 0 || ts > candles[candles.length - 1].time) {
        // ── New bar (first ever, or boundary enforcer hasn't fired yet) ────
        const openPrice = candles.length > 0 ? candles[candles.length - 1].close : tick.ltp;
        openNewBar(ts, openPrice);
        // Update close/high/low with actual tick price
        const last = candles[candles.length - 1];
        last.close = tick.ltp;
        last.high  = Math.max(last.high, tick.ltp);
        last.low   = Math.min(last.low,  tick.ltp);
        series.update(priceData([last], chartTypeRef.current)[0] as any);
      } else {
        // ── Same bar — update OHLC in place ───────────────────────────────
        const last = candles[candles.length - 1];
        last.close = tick.ltp;
        last.high  = Math.max(last.high, tick.ltp);
        last.low   = Math.min(last.low,  tick.ltp);
        series.update(priceData([last], chartTypeRef.current)[0] as any);
      }

      const cur  = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      setLegend({
        open: cur.open, high: cur.high, low: cur.low, close: cur.close,
        prevClose: prev?.close ?? cur.open, volume: cur.volume,
      });
      useChartStore.getState().bumpData();
    });

    return () => { unsub(); clearTimeout(boundaryTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol.symbol, symbol.instrumentKey]);

  const up = legend ? legend.close >= legend.prevClose : true;
  const chg = legend ? legend.close - legend.prevClose : 0;
  const chgPct = legend && legend.prevClose ? (chg / legend.prevClose) * 100 : 0;
  const cls = up ? 'up' : 'down';

  return (
    <ChartContext.Provider value={{ chartRef, seriesRef: priceSeriesRef, candlesRef, containerRef, ready }}>
      <div className={`chart-view${isSplit ? ' has-panel-header' : ''}`}>
        {isSplit && <PanelHeader />}
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

        {/* Awaiting first live tick — shown only for non-MOCK live instruments */}
        {ready && !legend && !symbol.instrumentKey?.startsWith('MOCK:') && (
          <div className="chart-awaiting">
            <span className="chart-awaiting-dot" />
            Awaiting live data for {symbol.symbol}…
          </div>
        )}

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
        {ready && <CandleTimer />}
        {panelId === 'p1' && <ChartWidgets />}

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
