import { ColorType, CrosshairMode, LineStyle, TickMarkType, type DeepPartial, type ChartOptions } from 'lightweight-charts';

// IST offset in seconds (UTC+5:30).
const IST_OFFSET = 19800;

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/**
 * Convert a UTC Unix timestamp (seconds) to a Date whose UTC methods
 * return IST wall-clock values.  e.g. getUTCHours() → IST hour.
 */
function toIST(utcSec: number): Date {
  return new Date((utcSec + IST_OFFSET) * 1000);
}

/** D Mon YYYY HH:MM in IST (time omitted for daily charts at 00:00) */
function istTimeFormatter(utcSec: number): string {
  const d = toIST(utcSec);
  const dateStr = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (h === 0 && m === 0) return dateStr;
  return `${dateStr}  ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** "D Mon YYYY" in IST */
function istDateFormatter(utcSec: number): string {
  const d = toIST(utcSec);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * x-axis tick mark labels in IST.
 * lightweight-charts calls this for every grid label; without it the library
 * falls back to UTC-based formatting, making intraday times wrong for IST users.
 */
function istTickMarkFormatter(utcSec: number, markType: TickMarkType): string {
  const d = toIST(utcSec);
  switch (markType) {
    case TickMarkType.Year:
      return String(d.getUTCFullYear());
    case TickMarkType.Month:
      return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    case TickMarkType.DayOfMonth:
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    case TickMarkType.Time:
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    case TickMarkType.TimeWithSeconds:
      return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
    default:
      return istDateFormatter(utcSec);
  }
}

// TradingView "dark" theme for the lightweight-charts instance.
export const chartOptions: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: '#131722' },
    textColor: '#b2b5be',
    fontFamily: '"Trebuchet MS", Roboto, Ubuntu, sans-serif',
    fontSize: 11,
    panes: { separatorColor: '#2a2e39', separatorHoverColor: '#363a45', enableResize: true },
    attributionLogo: false,
  },
  // Force all timestamps to display in IST regardless of browser timezone.
  localization: {
    timeFormatter: istTimeFormatter,
  },
  grid: {
    vertLines: { color: '#1e222d' },
    horzLines: { color: '#1e222d' },
  },
  crosshair: {
    mode: CrosshairMode.Normal,
    vertLine: { color: '#787b86', width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: '#363a45' },
    horzLine: { color: '#787b86', width: 1, style: LineStyle.LargeDashed, labelBackgroundColor: '#363a45' },
  },
  rightPriceScale: {
    borderColor: '#2a2e39',
    scaleMargins: { top: 0.08, bottom: 0.08 },
    entireTextOnly: true,
  },
  timeScale: {
    borderColor: '#2a2e39',
    timeVisible: false,
    secondsVisible: false,
    rightOffset: 6,
    barSpacing: 7,
    tickMarkFormatter: istTickMarkFormatter,
  },
  handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
  handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
  autoSize: false,
};

// Theme-dependent options re-applied when the user toggles light/dark.
export function chartThemeOptions(theme: 'dark' | 'light'): DeepPartial<ChartOptions> {
  const light = theme === 'light';
  return {
    layout: {
      background: { type: ColorType.Solid, color: light ? '#ffffff' : '#131722' },
      textColor: light ? '#131722' : '#b2b5be',
    },
    grid: {
      vertLines: { color: light ? '#e6e9f0' : '#1e222d' },
      horzLines: { color: light ? '#e6e9f0' : '#1e222d' },
    },
    rightPriceScale: { borderColor: light ? '#e0e3eb' : '#2a2e39' },
    timeScale: { borderColor: light ? '#e0e3eb' : '#2a2e39' },
  };
}

export const candleColors = {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderUpColor: '#26a69a',
  borderDownColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
};

export const volumeColors = {
  up: 'rgba(38, 166, 154, 0.5)',
  down: 'rgba(239, 83, 80, 0.5)',
};
