import { useEffect, useRef, useCallback } from 'react';
import { useState } from 'react';
import { ChartArea } from '../components/ChartArea';
import { Icon } from '../icons/Icon';
import { useChartStore } from '../state/chartStore';
import { useCryptoStore, type XMPosition } from './cryptoStore';
import { CRYPTO_SYMBOLS, type CryptoSymbol } from './symbols';
import { binanceWs } from './binanceWs';
import {
  xmConnect, xmLogout, xmPlaceOrder, xmClosePosition,
  xmGetPositions, xmGetAccount,
  type XMOrderRequest,
} from './xmService';
import type { SymbolInfo, Interval } from '../data/types';
import './CryptoPanel.css';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(price: number, decimals: number) {
  return price.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function cryptoSymbolInfo(sym: CryptoSymbol): SymbolInfo {
  return { symbol: sym.binance, name: sym.display, exchange: 'Binance', kind: 'crypto' };
}

// ── Watchlist item ────────────────────────────────────────────────────────────

function WatchlistItem({ sym, active, onClick }: { sym: CryptoSymbol; active: boolean; onClick: () => void }) {
  const tick = useCryptoStore((s) => s.ticks[sym.binance]);
  const chg = tick?.changePercent ?? 0;
  const positive = chg >= 0;
  return (
    <button className={`cp-wl-item ${active ? 'active' : ''}`} onClick={onClick}>
      <span className="cp-wl-label">{sym.label}</span>
      <span className="cp-wl-sub">{sym.display}</span>
      <div className="cp-wl-right">
        <span className="cp-wl-price">{tick ? fmtPrice(tick.price, sym.priceDecimals) : '—'}</span>
        <span className={`cp-wl-chg ${positive ? 'up' : 'down'}`}>
          {tick ? `${positive ? '+' : ''}${chg.toFixed(2)}%` : '—'}
        </span>
      </div>
    </button>
  );
}

// ── Order Panel ───────────────────────────────────────────────────────────────

function OrderPanel({ symbol }: { symbol: CryptoSymbol }) {
  // Selective subscriptions — only re-render when XM state changes, NOT on every tick.
  const xmConnected = useCryptoStore((s) => s.xmConnected);
  const xmAccount   = useCryptoStore((s) => s.xmAccount);
  const positions   = useCryptoStore((s) => s.positions);
  const setPositions = useCryptoStore((s) => s.setPositions);
  const tick = useCryptoStore((s) => s.ticks[symbol.binance]);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'STOP'>('MARKET');
  const [volume, setVolume] = useState('0.01');
  const [price, setPrice] = useState('');
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [msg, setMsg] = useState('');

  const refreshPositions = useCallback(async () => {
    if (!xmConnected) return;
    try { setPositions((await xmGetPositions()).positions); } catch { /* ignore */ }
  }, [xmConnected, setPositions]);

  useEffect(() => {
    refreshPositions();
    const t = window.setInterval(refreshPositions, 5000);
    return () => window.clearInterval(t);
  }, [refreshPositions]);

  const connectMt5 = async () => {
    setConnecting(true); setMsg('');
    try {
      await xmConnect();
      const acc = await xmGetAccount();
      useCryptoStore.getState().setXmConnected(true);
      useCryptoStore.getState().setXmAccount(acc);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Connection failed');
    } finally { setConnecting(false); }
  };

  const placeOrder = async () => {
    if (!xmConnected) { await connectMt5(); return; }
    const vol = parseFloat(volume);
    if (!vol || vol <= 0) { setMsg('Invalid volume'); return; }
    setLoading(true); setMsg('');
    try {
      const req: XMOrderRequest = {
        symbol: symbol.mt5,
        side,
        type: orderType,
        volume: vol,
        price: orderType !== 'MARKET' ? parseFloat(price) || 0 : 0,
        sl: parseFloat(sl) || 0,
        tp: parseFloat(tp) || 0,
        comment: 'WelthWest',
      };
      const res = await xmPlaceOrder(req);
      setMsg(`Order placed — ticket #${res.ticket}`);
      refreshPositions();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Order failed');
    } finally { setLoading(false); }
  };

  const closePos = async (ticket: number) => {
    try { await xmClosePosition(ticket); refreshPositions(); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Close failed'); }
  };

  const ltp = tick?.price;

  return (
    <div className="cp-order-panel">
      <div className="cp-account-bar">
        {xmConnected && xmAccount ? (
          <>
            <span className="cp-acct-name">{xmAccount.name}</span>
            <span className="cp-acct-bal">${xmAccount.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
            <button className="cp-acct-logout" onClick={async () => {
              await xmLogout().catch(() => {});
              useCryptoStore.getState().setXmConnected(false);
              useCryptoStore.getState().setXmAccount(null);
              useCryptoStore.getState().setPositions([]);
            }}>Disconnect</button>
          </>
        ) : (
          <button className="cp-btn primary small" onClick={connectMt5} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect MT5'}
          </button>
        )}
      </div>

      <div className="cp-side-row">
        <button className={`cp-side-btn buy ${side === 'BUY' ? 'active' : ''}`} onClick={() => setSide('BUY')}>BUY</button>
        <button className={`cp-side-btn sell ${side === 'SELL' ? 'active' : ''}`} onClick={() => setSide('SELL')}>SELL</button>
      </div>

      <div className="cp-type-row">
        {(['MARKET', 'LIMIT', 'STOP'] as const).map((t) => (
          <button key={t} className={`cp-type-btn ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t)}>{t}</button>
        ))}
      </div>

      <div className="cp-symbol-row">
        <span className="cp-sym-label">{symbol.display}</span>
        {ltp != null && <span className="cp-sym-ltp">{fmtPrice(ltp, symbol.priceDecimals)}</span>}
      </div>

      <label className="cp-label">Volume (lots)</label>
      <input className="cp-input" type="number" step="0.01" min="0.01" value={volume} onChange={(e) => setVolume(e.target.value)} />

      {orderType !== 'MARKET' && (
        <>
          <label className="cp-label">Price</label>
          <input className="cp-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={ltp?.toString() ?? '0'} />
        </>
      )}

      <label className="cp-label">Stop Loss</label>
      <input className="cp-input" type="number" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="Optional" />

      <label className="cp-label">Take Profit</label>
      <input className="cp-input" type="number" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="Optional" />

      <button className={`cp-btn ${side === 'BUY' ? 'buy' : 'sell'} full`} onClick={placeOrder} disabled={loading}>
        {loading ? 'Placing…' : `${side} ${symbol.label}`}
      </button>

      {msg && <div className="cp-msg">{msg}</div>}

      {positions.length > 0 && (
        <div className="cp-positions">
          <div className="cp-pos-title">Open Positions</div>
          {positions.map((pos) => (
            <PositionRow key={pos.ticket} pos={pos} onClose={() => closePos(pos.ticket)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PositionRow({ pos, onClose }: { pos: XMPosition; onClose: () => void }) {
  const pnl = pos.profit;
  return (
    <div className="cp-pos-row">
      <div className="cp-pos-info">
        <span className={`cp-pos-side ${pos.side.toLowerCase()}`}>{pos.side}</span>
        <span className="cp-pos-sym">{pos.symbol}</span>
        <span className="cp-pos-vol">{pos.volume}L</span>
      </div>
      <div className="cp-pos-right">
        <span className={`cp-pos-pnl ${pnl >= 0 ? 'up' : 'down'}`}>{pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}</span>
        <button className="cp-pos-close" onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function CryptoRightPanel() {
  const [collapsed, setCollapsed] = useState(false);
  // Selective subscriptions — avoid re-rendering on every Binance tick.
  const toggleCryptoMode = useCryptoStore((s) => s.toggleCryptoMode);
  const setTick          = useCryptoStore((s) => s.setTick);
  const xmConnected      = useCryptoStore((s) => s.xmConnected);
  const chartSymbol = useChartStore((s) => s.symbol);
  const savedRef = useRef<{ symbol: typeof chartSymbol; interval: Interval } | null>(null);

  // On mount: save stock symbol, switch to first crypto symbol.
  // On unmount: restore the stock symbol.
  useEffect(() => {
    const cs = useChartStore.getState();
    savedRef.current = { symbol: cs.symbol, interval: cs.interval };
    cs.setSymbol(cryptoSymbolInfo(CRYPTO_SYMBOLS[0]));
    cs.setInterval('1H');
    return () => {
      if (savedRef.current) {
        useChartStore.getState().setSymbol(savedRef.current.symbol);
        useChartStore.getState().setInterval(savedRef.current.interval);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe miniTicker for all symbols (watchlist prices).
  useEffect(() => {
    const unsubs = CRYPTO_SYMBOLS.map((sym) =>
      binanceWs.subscribe(`${sym.binance.toLowerCase()}@miniTicker`, (data: unknown) => {
        const d = data as { c?: string; o?: string; h?: string; l?: string };
        const price = parseFloat(d.c ?? '0');
        const open24h = parseFloat(d.o ?? '0');
        setTick(sym.binance, {
          price,
          open24h,
          high24h: parseFloat(d.h ?? '0'),
          low24h: parseFloat(d.l ?? '0'),
          changePercent: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
        });
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [setTick]);

  // Poll XM account balance every 10s when connected.
  useEffect(() => {
    if (!xmConnected) return;
    const { setXmAccount } = useCryptoStore.getState();
    const t = window.setInterval(async () => {
      try { setXmAccount(await xmGetAccount()); } catch { /* ignore */ }
    }, 10_000);
    return () => window.clearInterval(t);
  }, [xmConnected]);

  // Derive active crypto symbol from chartStore.
  const activeCryptoSym = CRYPTO_SYMBOLS.find((s) => s.binance === chartSymbol.symbol) ?? CRYPTO_SYMBOLS[0];

  const selectSymbol = (sym: CryptoSymbol) => {
    useChartStore.getState().setSymbol(cryptoSymbolInfo(sym));
  };

  if (collapsed) {
    return (
      <aside className="rightpanel rightpanel--collapsed">
        <button
          className="rp-expand-btn"
          title="Expand crypto panel"
          onClick={() => setCollapsed(false)}
        >
          <Icon name="chevronLeft" size={16} />
        </button>
        <div className="rp-rail">
          <button className="rp-rail-btn icon-btn" onClick={toggleCryptoMode} title="Exit Crypto Mode">
            <Icon name="close" size={18} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="rightpanel crypto-panel" style={{ width: 260, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div className="rp-tabs">
        <span style={{ fontSize: 12, fontWeight: 600, paddingLeft: 12, color: '#e6edf3' }}>CRYPTO</span>
        <div style={{ flex: 1 }} />
        <button className="rp-tab" title="Exit Crypto Mode" onClick={toggleCryptoMode}>
          <Icon name="close" size={16} />
        </button>
        <button className="rp-tab" title="Collapse panel" onClick={() => setCollapsed(true)}>
          <Icon name="chevronRight" size={16} />
        </button>
      </div>

      <div className="cp-watchlist" style={{ flex: 1, width: '100%', borderRight: 'none' }}>
        {CRYPTO_SYMBOLS.map((sym) => (
          <WatchlistItem
            key={sym.binance}
            sym={sym}
            active={activeCryptoSym.binance === sym.binance}
            onClick={() => selectSymbol(sym)}
          />
        ))}
      </div>

      <OrderPanel symbol={activeCryptoSym} />
    </aside>
  );
}
