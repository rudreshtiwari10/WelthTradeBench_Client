export interface CryptoSymbol {
  binance: string;
  mt5: string;
  label: string;
  display: string;
  category: 'crypto' | 'metals';
  priceDecimals: number;
}

export const CRYPTO_SYMBOLS: CryptoSymbol[] = [
  { binance: 'BTCUSDT',  mt5: 'BTCUSD',  label: 'BTC',  display: 'BTC/USDT',  category: 'crypto',  priceDecimals: 2 },
  { binance: 'ETHUSDT',  mt5: 'ETHUSD',  label: 'ETH',  display: 'ETH/USDT',  category: 'crypto',  priceDecimals: 2 },
  { binance: 'BNBUSDT',  mt5: 'BNBUSD',  label: 'BNB',  display: 'BNB/USDT',  category: 'crypto',  priceDecimals: 3 },
  { binance: 'SOLUSDT',  mt5: 'SOLUSD',  label: 'SOL',  display: 'SOL/USDT',  category: 'crypto',  priceDecimals: 3 },
  { binance: 'DOGEUSDT', mt5: 'DOGEUSD', label: 'DOGE', display: 'DOGE/USDT', category: 'crypto',  priceDecimals: 5 },
  { binance: 'XAUUSDT',  mt5: 'XAUUSD',  label: 'XAU',  display: 'XAU/USDT',  category: 'metals',  priceDecimals: 2 },
];

export const BINANCE_INTERVALS: Record<string, string> = {
  '1m': '1m', '3m': '3m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1H': '1h', '2H': '2h', '4H': '4h', '1D': '1d', '1W': '1w', '1M': '1M',
};

export function findSymbol(binance: string): CryptoSymbol | undefined {
  return CRYPTO_SYMBOLS.find((s) => s.binance === binance);
}
