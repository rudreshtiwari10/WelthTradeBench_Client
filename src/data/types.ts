// Shared data types for candles, quotes, and the live feed.

export type Interval =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1H' | '2H' | '4H'
  | '1D' | '1W' | '1M';

export type ChartType =
  | 'candles' | 'hollow' | 'bars' | 'line' | 'area' | 'baseline' | 'heikin' | 'columns';

/** A single OHLCV bar. `time` is a UNIX timestamp in seconds (UTC). */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Normalized live tick relayed from the backend. */
export interface Tick {
  symbol: string;
  ltp: number;
  volume?: number;
  ts: number; // seconds
}

export interface SymbolInfo {
  symbol: string;       // e.g. "NIFTY" | "NIFTY24NOV24000CE"
  name: string;         // e.g. "Nifty 50 Index" | "NIFTY 24000 CE 28 Nov"
  exchange: string;     // e.g. "NSE" | "NSE_FO"
  instrumentKey?: string; // Upstox key OR "MOCK:option:..." for derivatives
  kind?: 'index' | 'stock' | 'future' | 'option' | 'crypto';
}
