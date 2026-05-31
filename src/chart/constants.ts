import type { ChartType, Interval } from '../data/types';
import type { IconName } from '../icons/Icon';

export const INTERVAL_GROUPS: { title: string; items: { value: Interval; label: string }[] }[] = [
  { title: 'MINUTES', items: [
    { value: '1m', label: '1 minute' }, { value: '3m', label: '3 minutes' },
    { value: '5m', label: '5 minutes' }, { value: '15m', label: '15 minutes' }, { value: '30m', label: '30 minutes' },
  ] },
  { title: 'HOURS', items: [
    { value: '1H', label: '1 hour' }, { value: '2H', label: '2 hours' }, { value: '4H', label: '4 hours' },
  ] },
  { title: 'DAYS', items: [
    { value: '1D', label: '1 day' }, { value: '1W', label: '1 week' }, { value: '1M', label: '1 month' },
  ] },
];

export const CHART_TYPES: { value: ChartType; label: string; icon: IconName }[] = [
  { value: 'candles', label: 'Candles', icon: 'candles' },
  { value: 'hollow', label: 'Hollow candles', icon: 'hollow' },
  { value: 'bars', label: 'Bars', icon: 'bars' },
  { value: 'line', label: 'Line', icon: 'line' },
  { value: 'area', label: 'Area', icon: 'area' },
  { value: 'baseline', label: 'Baseline', icon: 'baseline' },
  { value: 'heikin', label: 'Heikin Ashi', icon: 'heikin' },
  { value: 'columns', label: 'Columns', icon: 'candles' },
];

export const chartTypeIcon = (t: ChartType): IconName =>
  CHART_TYPES.find((c) => c.value === t)?.icon ?? 'candles';
