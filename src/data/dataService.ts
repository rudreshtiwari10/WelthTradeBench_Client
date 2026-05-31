import type { Candle, Interval, SymbolInfo } from './types';

export interface HistoryResponse {
  symbol: string;
  interval: Interval;
  source: 'upstox' | 'mock';
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
  symbol: string, interval: Interval, count = 600, instrumentKey?: string
): Promise<HistoryResponse> {
  let url = `/api/history?symbol=${encodeURIComponent(symbol)}&interval=${interval}&count=${count}`;
  if (instrumentKey) url += `&instrument_key=${encodeURIComponent(instrumentKey)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`history ${r.status}`);
  return r.json();
}

export async function searchSymbols(q: string): Promise<SearchResult[]> {
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!r.ok) return [];
  return (await r.json()).results;
}

export async function authStatus(): Promise<{ credentialsPresent: boolean; authenticated: boolean; mode: 'upstox' | 'mock' }> {
  try {
    const r = await fetch('/api/auth/status');
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

/**
 * Singleton live-feed connection to the backend `/ws`. Auto-reconnects and
 * re-subscribes. Components subscribe to a symbol and receive ticks.
 */
class LiveFeed {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<TickHandler>>();
  private wanted = new Set<string>();
  private ready = false;
  private reconnectTimer: number | null = null;

  mode: 'upstox' | 'mock' = 'mock';

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);

    this.ws.onopen = () => {
      this.ready = true;
      for (const sym of this.wanted) this.send({ type: 'sub', symbol: sym });
    };
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'hello') {
        this.mode = msg.mode;
      } else if (msg.type === 'tick') {
        this.handlers.get(msg.symbol)?.forEach((h) => h(msg));
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

export async function fetchDerivativesChain(
  underlying: string, expiry: string
): Promise<{ source: string; spot: number; chains: DerivChainRow[] }> {
  const r = await fetch(
    `/api/derivatives/chain?underlying=${encodeURIComponent(underlying)}&expiry=${encodeURIComponent(expiry)}`
  );
  if (!r.ok) throw new Error(`derivatives/chain ${r.status}`);
  return r.json();
}

export async function fetchFutures(
  underlying: string
): Promise<{ source: string; futures: FutureRow[] }> {
  const r = await fetch(`/api/derivatives/futures?underlying=${encodeURIComponent(underlying)}`);
  if (!r.ok) throw new Error(`derivatives/futures ${r.status}`);
  return r.json();
}
