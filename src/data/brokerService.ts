/**
 * Broker service — typed wrappers around /api/broker/* endpoints.
 *
 * All calls return real Upstox data when authenticated; otherwise the backend
 * returns empty/paper scaffolds so the UI can stay in paper mode seamlessly.
 */

const API_BASE = import.meta.env.VITE_API_URL || '';

export type Broker = 'upstox' | 'kite';

// Append ?broker= only for non-default (kite) so existing upstox calls are unchanged.
function brokerQuery(broker?: Broker): string {
  return broker && broker !== 'upstox' ? `?broker=${broker}` : '';
}

// ─── Types ────────────────────────────────────────────────────────────────

export interface BrokerAuthInfo {
  authenticated: boolean;
  credentialsPresent: boolean;
  sandbox: boolean;
}

export interface BrokerStatus {
  mode: 'upstox' | 'mock';
  authenticated: boolean;
  sandbox: boolean;
  credentialsPresent: boolean;
  brokers: Record<Broker, BrokerAuthInfo>;
}

export interface BrokerEquity {
  available_margin: number;
  used_margin: number;
  payin: number;
  span?: number;
  exposure?: number;
  option_premium?: number;
  collateral?: number;
  pnl?: number;
}

export interface BrokerFunds {
  source: 'upstox' | 'kite' | 'paper';
  sandbox: boolean;
  equity?: BrokerEquity;
  commodity?: Record<string, number>;
}

export interface BrokerPosition {
  exchange: string;
  trading_symbol: string;
  instrument_token: string;
  product: string;             // "D" | "I"
  quantity: number;            // net qty (positive = long, negative = short)
  buy_quantity: number;
  sell_quantity: number;
  average_price: number;
  buy_price: number;
  sell_price: number;
  last_price: number;          // current LTP
  pnl: number;                 // total P&L (realised + unrealised)
  unrealised_profit: number;
  realised_profit: number;
  close_price: number;
  multiplier: number;
  value: number;
}

export interface BrokerOrder {
  order_id: string;
  trading_symbol: string;
  exchange: string;
  instrument_token: string;
  transaction_type: string;    // "BUY" | "SELL"
  quantity: number;
  price: number;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  order_type: string;          // "MARKET" | "LIMIT" | "SL" | "SL-M"
  product: string;
  status: string;              // "complete" | "open" | "cancelled" | "rejected" …
  order_timestamp: string;
  tag?: string;
}

export interface OptionChainRow {
  strike: number;
  expiry: string;
  callKey: string | null;
  callLtp: number;
  callBid: number;
  callAsk: number;
  callOi: number;
  callVol: number;
  putKey: string | null;
  putLtp: number;
  putBid: number;
  putAsk: number;
  putOi: number;
  putVol: number;
}

export interface PlaceOrderParams {
  instrument_key?: string;     // Upstox addressing
  qty: number;
  transaction_type: 'BUY' | 'SELL';
  order_type?: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  price?: number;
  product?: 'D' | 'I';        // D=NRML/CNC, I=MIS
  trigger_price?: number;
  broker?: Broker;             // "upstox" | "kite"
  segment?: 'option' | 'future' | 'equity';
  // Kite contract addressing (ignored by the Upstox path):
  tradingsymbol?: string;
  exchange?: string;
  underlying?: string;
  expiry?: string;             // YYYY-MM-DD
  strike?: number;
  option_type?: 'CE' | 'PE';
}

export interface PlaceOrderResult {
  source: 'upstox' | 'kite' | 'paper';
  sandbox: boolean;
  order_id?: string;
}

// ─── API calls ────────────────────────────────────────────────────────────

export async function fetchBrokerStatus(): Promise<BrokerStatus> {
  const r = await fetch(`${API_BASE}/api/broker/status`);
  if (!r.ok) throw new Error(`broker/status ${r.status}`);
  return r.json();
}

export async function fetchBrokerFunds(broker?: Broker): Promise<BrokerFunds> {
  const r = await fetch(`${API_BASE}/api/broker/funds${brokerQuery(broker)}`);
  if (!r.ok) throw new Error(`broker/funds ${r.status}`);
  return r.json();
}

export async function fetchBrokerPositions(broker?: Broker): Promise<{ source: string; sandbox: boolean; positions: BrokerPosition[] }> {
  const r = await fetch(`${API_BASE}/api/broker/positions${brokerQuery(broker)}`);
  if (!r.ok) throw new Error(`broker/positions ${r.status}`);
  return r.json();
}

export async function fetchBrokerOrders(broker?: Broker): Promise<{ source: string; sandbox: boolean; orders: BrokerOrder[] }> {
  const r = await fetch(`${API_BASE}/api/broker/orders${brokerQuery(broker)}`);
  if (!r.ok) throw new Error(`broker/orders ${r.status}`);
  return r.json();
}

export async function placeBrokerOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
  const r = await fetch(`${API_BASE}/api/broker/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instrument_key: params.instrument_key,
      qty: params.qty,
      transaction_type: params.transaction_type,
      order_type: params.order_type ?? 'MARKET',
      price: params.price ?? 0,
      product: params.product ?? 'D',
      trigger_price: params.trigger_price ?? 0,
      broker: params.broker ?? 'upstox',
      segment: params.segment ?? 'option',
      // Kite contract addressing (ignored by the Upstox path):
      tradingsymbol: params.tradingsymbol,
      exchange: params.exchange,
      underlying: params.underlying,
      expiry: params.expiry,
      strike: params.strike,
      option_type: params.option_type,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail ?? `order ${r.status}`);
  }
  return r.json();
}

export async function cancelBrokerOrder(orderId: string, broker?: Broker): Promise<{ source: string }> {
  const r = await fetch(
    `${API_BASE}/api/broker/order/${encodeURIComponent(orderId)}${brokerQuery(broker)}`,
    { method: 'DELETE' },
  );
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail ?? `cancel ${r.status}`);
  }
  return r.json();
}

export async function fetchOptionChain(
  underlying: string,
  expiry: string,
): Promise<{ source: string; sandbox: boolean; chains: OptionChainRow[] }> {
  const r = await fetch(
    `${API_BASE}/api/broker/option-chain?underlying=${encodeURIComponent(underlying)}&expiry=${encodeURIComponent(expiry)}`,
  );
  if (!r.ok) throw new Error(`option-chain ${r.status}`);
  return r.json();
}
