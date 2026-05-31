import type { Candle } from '../data/types';
import {
  atr, bollinger, ema, macd, rsi, sma, stochastic, toPoints, vwap, type LinePoint,
} from './calc';

export interface PlotSpec {
  id: string;
  kind: 'line' | 'histogram';
  data: (LinePoint | { time: number; value: number; color: string })[];
  color: string;
  lineWidth?: number;
}

export interface IndicatorInput {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
}

export interface IndicatorDef {
  id: string;
  name: string;
  short: string;            // legend short name template
  category: 'Moving Averages' | 'Bands' | 'Oscillators' | 'Volume';
  overlay: boolean;         // true = main pane, false = own pane
  inputs: IndicatorInput[];
  guides?: number[];        // horizontal guide levels (for oscillators)
  build: (candles: Candle[], inputs: Record<string, number>) => PlotSpec[];
}

export const INDICATORS: IndicatorDef[] = [
  {
    id: 'sma', name: 'Moving Average', short: 'MA', category: 'Moving Averages', overlay: true,
    inputs: [{ key: 'length', label: 'Length', default: 9, min: 1, max: 500 }],
    build: (c, i) => [{ id: 'ma', kind: 'line', color: '#2962ff', lineWidth: 2, data: toPoints(c, sma(c.map((x) => x.close), i.length)) }],
  },
  {
    id: 'ema', name: 'Moving Average Exponential', short: 'EMA', category: 'Moving Averages', overlay: true,
    inputs: [{ key: 'length', label: 'Length', default: 21, min: 1, max: 500 }],
    build: (c, i) => [{ id: 'ema', kind: 'line', color: '#ff6d00', lineWidth: 2, data: toPoints(c, ema(c.map((x) => x.close), i.length)) }],
  },
  {
    id: 'bb', name: 'Bollinger Bands', short: 'BB', category: 'Bands', overlay: true,
    inputs: [{ key: 'length', label: 'Length', default: 20 }, { key: 'mult', label: 'StdDev', default: 2 }],
    build: (c, i) => {
      const b = bollinger(c, i.length, i.mult);
      return [
        { id: 'upper', kind: 'line', color: '#2962ff', lineWidth: 1, data: toPoints(c, b.upper) },
        { id: 'basis', kind: 'line', color: '#ff6d00', lineWidth: 1, data: toPoints(c, b.basis) },
        { id: 'lower', kind: 'line', color: '#2962ff', lineWidth: 1, data: toPoints(c, b.lower) },
      ];
    },
  },
  {
    id: 'vwap', name: 'VWAP', short: 'VWAP', category: 'Volume', overlay: true,
    inputs: [],
    build: (c) => [{ id: 'vwap', kind: 'line', color: '#26c6da', lineWidth: 2, data: toPoints(c, vwap(c)) }],
  },
  {
    id: 'rsi', name: 'Relative Strength Index', short: 'RSI', category: 'Oscillators', overlay: false,
    inputs: [{ key: 'length', label: 'Length', default: 14 }], guides: [30, 70],
    build: (c, i) => [{ id: 'rsi', kind: 'line', color: '#7e57c2', lineWidth: 2, data: toPoints(c, rsi(c, i.length)) }],
  },
  {
    id: 'macd', name: 'MACD', short: 'MACD', category: 'Oscillators', overlay: false,
    inputs: [{ key: 'fast', label: 'Fast', default: 12 }, { key: 'slow', label: 'Slow', default: 26 }, { key: 'signal', label: 'Signal', default: 9 }],
    guides: [0],
    build: (c, i) => {
      const m = macd(c, i.fast, i.slow, i.signal);
      const hist = c.map((cc, idx) => (m.hist[idx] == null ? null : { time: cc.time, value: m.hist[idx] as number, color: (m.hist[idx] as number) >= 0 ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)' }))
        .filter(Boolean) as { time: number; value: number; color: string }[];
      return [
        { id: 'hist', kind: 'histogram', color: '#26a69a', data: hist },
        { id: 'macd', kind: 'line', color: '#2962ff', lineWidth: 2, data: toPoints(c, m.macdLine) },
        { id: 'signal', kind: 'line', color: '#ff6d00', lineWidth: 2, data: toPoints(c, m.signal) },
      ];
    },
  },
  {
    id: 'stoch', name: 'Stochastic', short: 'Stoch', category: 'Oscillators', overlay: false,
    inputs: [{ key: 'k', label: '%K', default: 14 }, { key: 'd', label: '%D', default: 3 }], guides: [20, 80],
    build: (c, i) => {
      const s = stochastic(c, i.k, i.d);
      return [
        { id: 'k', kind: 'line', color: '#2962ff', lineWidth: 2, data: toPoints(c, s.k) },
        { id: 'd', kind: 'line', color: '#ff6d00', lineWidth: 1, data: toPoints(c, s.d) },
      ];
    },
  },
  {
    id: 'atr', name: 'Average True Range', short: 'ATR', category: 'Oscillators', overlay: false,
    inputs: [{ key: 'length', label: 'Length', default: 14 }],
    build: (c, i) => [{ id: 'atr', kind: 'line', color: '#ef5350', lineWidth: 2, data: toPoints(c, atr(c, i.length)) }],
  },
];

export const getIndicator = (id: string) => INDICATORS.find((d) => d.id === id);
