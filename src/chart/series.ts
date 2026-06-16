import {
  CandlestickSeries, BarSeries, LineSeries, AreaSeries, BaselineSeries, HistogramSeries,
  type ISeriesApi, type IChartApi, type SeriesType,
} from 'lightweight-charts';
import type { Candle, ChartType } from '../data/types';
import { volumeColors } from './theme';
import { useSettingsStore } from '../state/settingsStore';

/**
 * Reads the user's current candle-color settings (instead of a hardcoded theme
 * default) so newly created series — e.g. after switching symbol/timeframe,
 * which destroys and recreates the price series — always pick up whatever
 * colors the user has configured, not the library default.
 */
function liveCandleColors() {
  const s = useSettingsStore.getState();
  return {
    upColor: s.upColor,
    downColor: s.downColor,
    borderUpColor: s.upColor,
    borderDownColor: s.downColor,
    wickUpColor: s.wickVisible ? s.upColor : 'rgba(0,0,0,0)',
    wickDownColor: s.wickVisible ? s.downColor : 'rgba(0,0,0,0)',
  };
}

export type PriceSeries = ISeriesApi<SeriesType>;

/** Heikin-Ashi transform of an OHLC series. */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  let prevO = candles[0]?.open ?? 0;
  let prevC = candles[0]?.close ?? 0;
  for (const c of candles) {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = out.length === 0 ? (c.open + c.close) / 2 : (prevO + prevC) / 2;
    const high = Math.max(c.high, open, close);
    const low = Math.min(c.low, open, close);
    out.push({ time: c.time, open, high, low, close, volume: c.volume });
    prevO = open;
    prevC = close;
  }
  return out;
}

/** Create the price series matching the chart type, in pane 0. */
export function createPriceSeries(chart: IChartApi, type: ChartType): PriceSeries {
  const candleColors = liveCandleColors();
  const borderVisible = useSettingsStore.getState().borderVisible;
  switch (type) {
    case 'bars':
      return chart.addSeries(BarSeries, { upColor: candleColors.upColor, downColor: candleColors.downColor, thinBars: false });
    case 'line':
      return chart.addSeries(LineSeries, { color: '#2962ff', lineWidth: 2 });
    case 'area':
      return chart.addSeries(AreaSeries, {
        lineColor: '#2962ff', topColor: 'rgba(41,98,255,0.28)', bottomColor: 'rgba(41,98,255,0.02)', lineWidth: 2,
      });
    case 'baseline':
      return chart.addSeries(BaselineSeries, {
        topLineColor: candleColors.upColor, bottomLineColor: candleColors.downColor,
        topFillColor1: 'rgba(38,166,154,0.28)', topFillColor2: 'rgba(38,166,154,0.02)',
        bottomFillColor1: 'rgba(239,83,80,0.02)', bottomFillColor2: 'rgba(239,83,80,0.28)',
      });
    case 'columns':
      return chart.addSeries(HistogramSeries, { color: '#26a69a' });
    case 'hollow': {
      // Hollow candles: up bars unfilled (transparent body, colored border).
      const s = chart.addSeries(CandlestickSeries, { ...candleColors, borderVisible: true });
      return s;
    }
    case 'candles':
    case 'heikin':
    default:
      return chart.addSeries(CandlestickSeries, { ...candleColors, borderVisible });
  }
}

/** Map candles into the data shape required by the chart type. */
export function priceData(candles: Candle[], type: ChartType) {
  const src = type === 'heikin' ? heikinAshi(candles) : candles;
  switch (type) {
    case 'line':
    case 'area':
    case 'baseline':
      return src.map((c) => ({ time: c.time as any, value: c.close }));
    case 'columns':
      return src.map((c) => ({
        time: c.time as any,
        value: c.close,
        color: c.close >= c.open ? volumeColors.up : volumeColors.down,
      }));
    case 'hollow': {
      // Hollow candle colors are baked per-bar into the data (the library lets
      // per-bar color/borderColor/wickColor override series-level options), so
      // they must be read live here too, not just at series-creation time.
      const candleColors = liveCandleColors();
      return src.map((c) => {
        const up = c.close >= c.open;
        return {
          time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close,
          color: up ? 'rgba(0,0,0,0)' : candleColors.downColor,
          borderColor: up ? candleColors.upColor : candleColors.downColor,
          wickColor: up ? candleColors.upColor : candleColors.downColor,
        };
      });
    }
    case 'bars':
    case 'candles':
    case 'heikin':
    default:
      return src.map((c) => ({ time: c.time as any, open: c.open, high: c.high, low: c.low, close: c.close }));
  }
}

export function volumeData(candles: Candle[]) {
  return candles.map((c) => ({
    time: c.time as any,
    value: c.volume,
    color: c.close >= c.open ? volumeColors.up : volumeColors.down,
  }));
}
