const BASE = `${import.meta.env.VITE_API_URL || ''}/api/xm`;

async function _post(path: string, body?: unknown): Promise<unknown> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.detail ?? `HTTP ${r.status}`);
  return json;
}

async function _get(path: string): Promise<unknown> {
  const r = await fetch(`${BASE}${path}`);
  const json = await r.json();
  if (!r.ok) throw new Error(json.detail ?? `HTTP ${r.status}`);
  return json;
}

async function _delete(path: string): Promise<unknown> {
  const r = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  const json = await r.json();
  if (!r.ok) throw new Error(json.detail ?? `HTTP ${r.status}`);
  return json;
}

export interface XMOrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  volume: number;
  price?: number;
  sl?: number;
  tp?: number;
  comment?: string;
}

export const xmConnect = () =>
  _post('/login') as Promise<{ ok: boolean; name: string; login: number; server: string }>;

export const xmLogout = () =>
  _post('/logout') as Promise<{ ok: boolean }>;

export const xmPlaceOrder = (order: XMOrderRequest) =>
  _post('/order', order) as Promise<{ ok: boolean; ticket: number }>;

export const xmClosePosition = (ticket: number) =>
  _delete(`/order/${ticket}`) as Promise<{ ok: boolean }>;

export const xmModifyPosition = (ticket: number, sl: number, tp: number) =>
  fetch(`${BASE}/order/${ticket}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sl, tp }),
  }).then((r) => r.json()) as Promise<{ ok: boolean }>;

export const xmGetPositions = () =>
  _get('/positions') as Promise<{ positions: import('./cryptoStore').XMPosition[] }>;

export const xmGetAccount = () =>
  _get('/account') as Promise<import('./cryptoStore').XMAccount>;
