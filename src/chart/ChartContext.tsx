import { createContext, useContext, type MutableRefObject } from 'react';
import type { IChartApi, ISeriesApi, SeriesType } from 'lightweight-charts';
import type { Candle } from '../data/types';

export interface ChartApi {
  chartRef: MutableRefObject<IChartApi | null>;
  seriesRef: MutableRefObject<ISeriesApi<SeriesType> | null>;
  candlesRef: MutableRefObject<Candle[]>;
  /** The `.chart-canvas` div — used by PositionLines for coordinate conversion. */
  containerRef: MutableRefObject<HTMLDivElement | null>;
  ready: boolean;
}

export const ChartContext = createContext<ChartApi | null>(null);

export function useChartApi(): ChartApi {
  const ctx = useContext(ChartContext);
  if (!ctx) throw new Error('useChartApi must be used within ChartContext');
  return ctx;
}
