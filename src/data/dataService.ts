import type { Candle, Interval, SymbolInfo } from './types';
import { syncTimeWithTick } from '../utils/timeSync';

const API_BASE = import.meta.env.VITE_API_URL || '';


export interface HistoryResponse {
  symbol: string;
  interval: Interval;
  source: 'upstox' | 'mock' | 'yahoo';
  /** Advisory message — e.g. commodity USD prices in backtest mode. */
  source_warning?: string;
  info: SymbolInfo;
  candles: Candle[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  kind: SymbolInfo['kind'];
}

export async function fetchHistory(
  symbol: string,
  interval: Interval,
  count = 600,
  instrumentKey?: string,
  signal?: AbortSignal,
  beforeTs?: number,
): Promise<HistoryResponse> {
  let url = `${API_BASE}/api/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}&count=${count}`;
  if (instrumentKey) url += `&instrument_key=${encodeURIComponent(instrumentKey)}`;
  if (beforeTs != null) url += `&before_ts=${Math.floor(beforeTs)}`;
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) throw new Error(`history ${r.status}`);
  return r.json();
}

/**
 * Fetch an OLDER page of candles for lazy scroll-back — every returned bar has
 * time < beforeTs.  Returns [] when there is no more history to load.
 * Only meaningful for store-backed symbols (major indices); other symbols have
 * no server-side pagination and will return an empty page.
 */
export async function fetchHistoryPage(
  symbol: string,
  interval: Interval,
  beforeTs: number,
  count = 750,
  instrumentKey?: string,
  signal?: AbortSignal,
): Promise<Candle[]> {
  const res = await fetchHistory(symbol, interval, count, instrumentKey, signal, beforeTs);
  return res.candles ?? [];
}

/**
 * Yahoo Finance max-depth historical data — used exclusively in Backtest Mode.
 * Returns the same HistoryResponse shape as fetchHistory so ChartView works unchanged.
 * Max depth: 1m=7d · 5m/15m/30m=60d · 1H=2y · 1D=10y · 1W/1M=20y
 */
export async function fetchBacktestHistory(
  symbol: string,
  interval: Interval,
  signal?: AbortSignal,
): Promise<HistoryResponse> {
  const url = `${API_BASE}/api/backtest/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}`;
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) throw new Error(`backtest history ${r.status}`);
  return r.json();
}

export async function searchSymbols(q: string): Promise<SearchResult[]> {
  const r = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) return [];
  return (await r.json()).results;
}

export async function authStatus(): Promise<{ credentialsPresent: boolean; authenticated: boolean; mode: 'upstox' | 'mock' }> {
  try {
    const r = await fetch(`${API_BASE}/api/auth/status`);
    return await r.json();
  } catch {
    return { credentialsPresent: false, authenticated: false, mode: 'mock' };
  }
}


export interface Tick {
  type: 'tick';
  symbol: string;
  ltp: number;
  ts: number;
}

type TickHandler = (t: Tick) => void;
type KeyTickHandler = (key: string, ltp: number, ts: number) => void;

/**
 * Singleton live-feed connection to the backend `/ws`. Auto-reconnects and
 * re-subscribes. Components subscribe to a symbol and receive ticks.
 * Option contract ticks are subscribed by instrument key via subscribeKeys().
 */
class LiveFeed {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<TickHandler>>();
  private keyHandlers = new Map<string, Set<KeyTickHandler>>();
  private wanted = new Set<string>();
  private wantedKeys = new Set<string>();
  private ready = false;
  private reconnectTimer: number | null = null;

  mode: 'upstox' | 'mock' = 'mock';

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    let wsUrl: string;
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      // Convert http/https → ws/wss and append /ws
      wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws';
    } else {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      wsUrl = `${proto}://${location.host}/ws`;
      if (location.protocol === 'https:') {
        // On HTTPS without VITE_API_URL the WS will try to reach the frontend
        // host which has no /ws endpoint. Set VITE_API_URL in your deployment
        // environment (Vercel → Settings → Environment Variables).
        console.warn('[LiveFeed] VITE_API_URL is not set. WebSocket will attempt to connect to the frontend host, which will fail on Vercel/cloud. Set VITE_API_URL=https://your-backend-url in your deployment environment.');
      }
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.ready = true;
      for (const sym of this.wanted) this.send({ type: 'sub', symbol: sym });
      // Re-subscribe option keys after reconnect
      if (this.wantedKeys.size > 0) {
        this.send({ type: 'sub_options', keys: Array.from(this.wantedKeys) });
      }
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'hello') {
        this.mode = msg.mode;
      } else if (msg.type === 'tick') {
        syncTimeWithTick(msg.ts);
        this.handlers.get(msg.symbol)?.forEach((h) => h(msg));
      } else if (msg.type === 'option_tick') {
        syncTimeWithTick(msg.ts);
        this.keyHandlers.get(msg.key)?.forEach((h) => h(msg.key, msg.ltp, msg.ts));
      }
    };
    this.ws.onclose = () => {
      this.ready = false;
      this.scheduleReconnect();
    };
    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1500);
  }

  private send(obj: unknown) {
    if (this.ws && this.ready) this.ws.send(JSON.stringify(obj));
  }

  subscribe(symbol: string, handler: TickHandler): () => void {
    this.connect();
    if (!this.handlers.has(symbol)) this.handlers.set(symbol, new Set());
    this.handlers.get(symbol)!.add(handler);
    if (!this.wanted.has(symbol)) {
      this.wanted.add(symbol);
      this.send({ type: 'sub', symbol });
    }
    return () => {
      const set = this.handlers.get(symbol);
      set?.delete(handler);
      if (set && set.size === 0) {
        this.handlers.delete(symbol);
        this.wanted.delete(symbol);
        this.send({ type: 'unsub', symbol });
      }
    };
  }

  /** Subscribe to real-time LTP ticks for specific option instrument keys. */
  subscribeKeys(keys: string[], handler: KeyTickHandler): () => void {
    this.connect();
    const newKeys: string[] = [];
    for (const key of keys) {
      if (!this.keyHandlers.has(key)) this.keyHandlers.set(key, new Set());
      this.keyHandlers.get(key)!.add(handler);
      if (!this.wantedKeys.has(key)) {
        this.wantedKeys.add(key);
        newKeys.push(key);
      }
    }
    if (newKeys.length > 0) {
      this.send({ type: 'sub_options', keys: newKeys });
    }
    return () => {
      const toUnsub: string[] = [];
      for (const key of keys) {
        const set = this.keyHandlers.get(key);
        set?.delete(handler);
        if (set && set.size === 0) {
          this.keyHandlers.delete(key);
          this.wantedKeys.delete(key);
          toUnsub.push(key);
        }
      }
      if (toUnsub.length > 0) {
        this.send({ type: 'unsub_options', keys: toUnsub });
      }
    };
  }
}

export const liveFeed = new LiveFeed();

// ─── Derivatives data ─────────────────────────────────────────────────────

export interface DerivChainRow {
  strike: number;
  expiry: string;
  callKey: string | null;
  callLtp: number;
  callBid: number;
  callAsk: number;
  callOi: number;
  putKey: string | null;
  putLtp: number;
  putBid: number;
  putAsk: number;
  putOi: number;
}

export interface FutureRow {
  symbol: string;
  name: string;
  exchange: string;
  expiry: string;
  expiryLabel: string;
  ltp: number;
  instrumentKey: string;
  kind: string;
}

export async function fetchDerivativesExpiries(
  underlying: string,
): Promise<{ source: string; underlying: string; expiries: string[] }> {
  const r = await fetch(
    `${API_BASE}/api/derivatives/expiries?underlying=${encodeURIComponent(underlying)}`,
  );
  if (!r.ok) throw new Error(`derivatives/expiries ${r.status}`);
  return r.json();
}

export async function fetchDerivativesChain(
  underlying: string, expiry: string
): Promise<{ source: string; spot: number; chains: DerivChainRow[] }> {
  const r = await fetch(
    `${API_BASE}/api/derivatives/chain?underlying=${encodeURIComponent(underlying)}&expiry=${encodeURIComponent(expiry)}`
  );
  if (!r.ok) throw new Error(`derivatives/chain ${r.status}`);
  return r.json();
}

export async function fetchFutures(
  underlying: string
): Promise<{ source: string; futures: FutureRow[] }> {
  const r = await fetch(`${API_BASE}/api/derivatives/futures?underlying=${encodeURIComponent(underlying)}`);
  if (!r.ok) throw new Error(`derivatives/futures ${r.status}`);
  return r.json();
}
