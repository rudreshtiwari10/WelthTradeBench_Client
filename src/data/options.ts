// Synthetic options-chain helpers for the order ticket (paper trading).
// Real option chains aren't in the backend, so strikes/premia are generated
// around the live spot — realistic enough for a working buy/sell flow.

// Lot sizes per NSE/BSE F&O contract specifications (updated May 2025).
// NIFTY: 75→65, BANKNIFTY: 30, FINNIFTY: 65, MIDCPNIFTY: 120, SENSEX: 20, BANKEX: 30.
// MCX commodity lot sizes per exchange specs.
const LOT_SIZE: Record<string, number> = {
  NIFTY: 65, BANKNIFTY: 30, FINNIFTY: 65, MIDCPNIFTY: 120, SENSEX: 20, BANKEX: 30,
  // MCX commodities (1 lot = standard contract unit)
  GOLD: 1, GOLDM: 1, GOLDPETAL: 1,
  SILVER: 1, SILVERM: 1, SILVERMIC: 1,
  CRUDEOIL: 100, CRUDEOILM: 10,
  NATURALGAS: 1250,
  COPPER: 2500, COPPERM: 250,
  ZINC: 5000, ZINCP: 500,
  ALUMINIUM: 5000, ALUMINIM: 500,
  NICKEL: 1500, NICKELM: 100,
  LEAD: 5000, LEADM: 1000,
};

export function lotSize(symbol: string): number {
  return LOT_SIZE[symbol.toUpperCase()] ?? 1;
}

export function strikeStep(symbol: string, spot: number): number {
  const s = symbol.toUpperCase();
  if (s === 'BANKNIFTY' || s === 'SENSEX' || s === 'BANKEX') return 100;
  if (s === 'NIFTY' || s === 'FINNIFTY') return 50;
  // MCX commodity strike steps
  if (s === 'GOLD' || s === 'GOLDM') return 100;
  if (s === 'SILVER' || s === 'SILVERM') return 500;
  if (s === 'CRUDEOIL' || s === 'CRUDEOILM') return 50;
  if (s === 'NATURALGAS') return 5;
  if (s === 'COPPER' || s === 'COPPERM') return 5;
  if (s === 'ZINC' || s === 'ZINCP') return 2;
  if (s === 'ALUMINIUM' || s === 'ALUMINIM') return 2;
  if (s === 'NICKEL' || s === 'NICKELM') return 10;
  if (s === 'LEAD' || s === 'LEADM') return 2;
  if (spot < 250) return 5;
  if (spot < 1000) return 10;
  if (spot < 5000) return 50;
  return 100;
}

export function atmStrike(symbol: string, spot: number): number {
  const step = strikeStep(symbol, spot);
  return Math.round(spot / step) * step;
}

/** Strikes around ATM (count each side). */
export function strikes(symbol: string, spot: number, each = 10): number[] {
  const step = strikeStep(symbol, spot);
  const atm = atmStrike(symbol, spot);
  const out: number[] = [];
  for (let i = -each; i <= each; i++) out.push(atm + i * step);
  return out;
}

export interface Expiry { label: string; date: Date; days: number; }

/** Next `n` weekly expiries (Thursdays). */
export function expiries(n = 6): Expiry[] {
  const out: Expiry[] = [];
  const d = new Date();
  d.setHours(15, 30, 0, 0);
  let cursor = new Date(d);
  // advance to next Thursday (4)
  while (out.length < n) {
    const day = cursor.getDay();
    const add = (4 - day + 7) % 7 || 7;
    cursor = new Date(cursor.getTime() + add * 86400000);
    const days = Math.max(0, Math.ceil((cursor.getTime() - Date.now()) / 86400000));
    out.push({
      label: cursor.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      date: new Date(cursor), days,
    });
  }
  return out;
}

/** Black-Scholes-lite premium estimate. */
export function optionPremium(spot: number, strike: number, type: 'CE' | 'PE', days: number): number {
  const intrinsic = type === 'CE' ? Math.max(0, spot - strike) : Math.max(0, strike - spot);
  const t = Math.max(0.5, days) / 365;
  const vol = 0.18; // assumed IV
  const timeValue = spot * vol * Math.sqrt(t) * Math.exp(-Math.pow((spot - strike) / (spot * 0.12), 2) / 2);
  return Math.max(0.05, +(intrinsic + timeValue).toFixed(2));
}

export function optionSymbol(underlying: string, expiry: Expiry, strike: number, type: 'CE' | 'PE'): string {
  const d = expiry.date;
  const mon = d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
  return `${underlying.toUpperCase()} ${d.getDate()}${mon} ${strike} ${type}`;
}
