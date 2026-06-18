type Callback = (data: unknown) => void;

class BinanceWsService {
  private ws: WebSocket | null = null;
  private subs = new Map<string, Set<Callback>>();
  private reconnectDelay = 2000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  subscribe(stream: string, cb: Callback): () => void {
    if (!this.subs.has(stream)) {
      this.subs.set(stream, new Set());
    }
    this.subs.get(stream)!.add(cb);

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [stream], id: Date.now() }));
    }

    return () => this._unsubscribe(stream, cb);
  }

  private _unsubscribe(stream: string, cb: Callback) {
    const set = this.subs.get(stream);
    if (!set) return;
    set.delete(cb);
    if (set.size === 0) {
      this.subs.delete(stream);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: [stream], id: Date.now() }));
      }
    }
    if (this.subs.size === 0) this.disconnect();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;
    this.intentionalClose = false;

    const streams = [...this.subs.keys()];
    const query = streams.length > 0 ? `?streams=${streams.join('/')}` : '';
    this.ws = new WebSocket(`wss://stream.binance.com:9443/stream${query}`);

    this.ws.onopen = () => {
      this.reconnectDelay = 2000;
      // Re-subscribe anything added while reconnecting
      const all = [...this.subs.keys()];
      if (all.length > 0) {
        this.ws!.send(JSON.stringify({ method: 'SUBSCRIBE', params: all, id: 1 }));
      }
      // Heartbeat ping every 3 minutes
      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method: 'LIST_SUBSCRIPTIONS', id: 999 }));
      }, 180_000);
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.stream) {
          this.subs.get(msg.stream)?.forEach((cb) => cb(msg.data));
        }
      } catch { /* ignore parse errors */ }
    };

    this.ws.onclose = () => {
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      if (!this.intentionalClose && this.subs.size > 0) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
          this.connect();
        }, this.reconnectDelay);
      }
    };

    this.ws.onerror = () => this.ws?.close();
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.ws?.close();
    this.ws = null;
  }
}

export const binanceWs = new BinanceWsService();
