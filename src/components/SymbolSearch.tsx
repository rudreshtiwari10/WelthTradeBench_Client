import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import {
  searchSymbols,
  fetchDerivativesChain,
  fetchFutures,
  type SearchResult,
  type DerivChainRow,
  type FutureRow,
} from '../data/dataService';
import { useChartStore } from '../state/chartStore';
import { useCompareStore } from '../state/compareStore';
import type { SymbolInfo } from '../data/types';
import './SymbolSearch.css';

// ─── Constants ────────────────────────────────────────────────────────────
const KIND_TAG: Record<string, string> = {
  index: 'Index', stock: 'Equity', future: 'Futures', option: 'Options',
  crypto: 'Crypto', commodity: 'Commodity',
};

const OPTIONABLE = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];

const MCX_COMMODITIES = [
  { sym: 'GOLD',       label: 'Gold' },
  { sym: 'GOLDM',      label: 'Gold Mini' },
  { sym: 'SILVER',     label: 'Silver' },
  { sym: 'SILVERM',    label: 'Silver Mini' },
  { sym: 'CRUDEOIL',   label: 'Crude Oil' },
  { sym: 'NATURALGAS', label: 'Nat Gas' },
  { sym: 'COPPER',     label: 'Copper' },
  { sym: 'ZINC',       label: 'Zinc' },
  { sym: 'ALUMINIUM',  label: 'Aluminium' },
  { sym: 'NICKEL',     label: 'Nickel' },
  { sym: 'LEAD',       label: 'Lead' },
];

// Expiry weekday per underlying (0=Sun…6=Sat)
const EXPIRY_DOW: Record<string, number> = {
  NIFTY: 4, BANKNIFTY: 3, FINNIFTY: 2, MIDCPNIFTY: 1, SENSEX: 5, BANKEX: 1,
};

function getExpiries(underlying: string, n = 8): { label: string; value: string }[] {
  const dow = EXPIRY_DOW[underlying.toUpperCase()] ?? 4;
  const results: { label: string; value: string }[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (results.length < n) {
    const add = (dow - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + add);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    results.push({ label, value });
  }
  return results;
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatOptionSymbol(underlying: string, strike: number, type: 'CE' | 'PE', expiry: string) {
  // e.g. NIFTY 24000 CE 28Nov
  const d = new Date(expiry + 'T00:00:00Z');
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${underlying}${d.getUTCDate()}${mon.toUpperCase()}${strike}${type}`;
}

type SearchTab = 'symbols' | 'options' | 'futures';

// ─── Main component ───────────────────────────────────────────────────────
export function SymbolSearch({ onClose, mode = 'replace', initialQuery = '' }: {
  onClose: () => void;
  mode?: 'replace' | 'compare';
  initialQuery?: string;
}) {
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addCompare = useCompareStore((s) => s.add);

  const [tab, setTab] = useState<SearchTab>('symbols');

  // ── Symbols tab ──────────────────────────────────────────────────────
  // initialQuery comes from typing any letter on the chart (TV-style type-to-search)
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab === 'symbols') {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      // Select all so typing a new char replaces the initial query
      el.select();
    }
  }, [tab]);

  useEffect(() => {
    let active = true;
    const id = setTimeout(async () => {
      const r = await searchSymbols(q);
      if (active) { setResults(r); setHi(0); }
    }, 120);
    return () => { active = false; clearTimeout(id); };
  }, [q]);

  // ── Options tab ──────────────────────────────────────────────────────
  const [optUnderlying, setOptUnderlying] = useState('NIFTY');
  const [optExpiries, setOptExpiries] = useState<{ label: string; value: string }[]>([]);
  const [optExpiry, setOptExpiry] = useState('');
  const [chain, setChain] = useState<DerivChainRow[]>([]);
  const [spot, setSpot] = useState(0);
  const [chainLoading, setChainLoading] = useState(false);

  // Reset expiries when underlying changes
  useEffect(() => {
    const exps = getExpiries(optUnderlying);
    setOptExpiries(exps);
    setOptExpiry(exps[0]?.value ?? '');
  }, [optUnderlying]);

  // Fetch chain when expiry is set
  useEffect(() => {
    if (tab !== 'options' || !optExpiry) return;
    let active = true;
    setChainLoading(true);
    setChain([]);
    fetchDerivativesChain(optUnderlying, optExpiry)
      .then((res) => { if (active) { setChain(res.chains); setSpot(res.spot ?? 0); } })
      .catch(() => { if (active) setChain([]); })
      .finally(() => { if (active) setChainLoading(false); });
    return () => { active = false; };
  }, [tab, optUnderlying, optExpiry]);

  // ── Futures tab ──────────────────────────────────────────────────────
  const [futSection, setFutSection] = useState<'indices' | 'commodities'>('indices');
  const [futUnderlying, setFutUnderlying] = useState('NIFTY');
  const [futCommodity, setFutCommodity] = useState('GOLD');
  const [futures, setFutures] = useState<FutureRow[]>([]);
  const [futLoading, setFutLoading] = useState(false);

  const activeFutSym = futSection === 'commodities' ? futCommodity : futUnderlying;

  useEffect(() => {
    if (tab !== 'futures') return;
    let active = true;
    setFutLoading(true);
    setFutures([]);
    fetchFutures(activeFutSym)
      .then((res) => { if (active) setFutures(res.futures); })
      .catch(() => { if (active) setFutures([]); })
      .finally(() => { if (active) setFutLoading(false); });
    return () => { active = false; };
  }, [tab, activeFutSym]);

  // ── Choose handlers ───────────────────────────────────────────────────
  const choose = (info: SymbolInfo) => {
    if (mode === 'compare') addCompare(info.symbol, info.name);
    else setSymbol(info);
    onClose();
  };

  const chooseResult = (r: SearchResult) =>
    choose({ symbol: r.symbol, name: r.name, exchange: r.exchange, kind: r.kind });

  const chooseOption = (row: DerivChainRow, type: 'CE' | 'PE') => {
    const key = type === 'CE' ? row.callKey : row.putKey;
    if (!key) return;
    const ltp = type === 'CE' ? row.callLtp : row.putLtp;
    const d = new Date(row.expiry + 'T00:00:00Z');
    const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const sym = `${optUnderlying}${d.getUTCDate()}${mon.toUpperCase()}${row.strike}${type}`;
    const name = `${optUnderlying} ${row.strike} ${type} ${d.getUTCDate()} ${mon} · ₹${fmt(ltp)}`;
    choose({ symbol: sym, name, exchange: 'NSE_FO', instrumentKey: key, kind: 'option' });
  };

  const chooseFuture = (f: FutureRow) =>
    choose({ symbol: f.symbol, name: f.name, exchange: f.exchange, instrumentKey: f.instrumentKey, kind: 'future' });

  // ── Keyboard nav (symbols tab only) ──────────────────────────────────
  const onKey = (e: React.KeyboardEvent) => {
    if (tab !== 'symbols') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && results[hi]) chooseResult(results[hi]);
    else if (e.key === 'Escape') onClose();
  };

  // ── ATM detection ─────────────────────────────────────────────────────
  const atmStrike = spot > 0
    ? chain.reduce((best, r) => Math.abs(r.strike - spot) < Math.abs(best - spot) ? r.strike : best, chain[0]?.strike ?? 0)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="symbol-search" onMouseDown={(e) => e.stopPropagation()}>

        {/* Input row */}
        <div className="ss-input-row">
          <Icon name="search" size={20} />
          {tab === 'symbols' ? (
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder={mode === 'compare' ? 'Compare symbol…' : 'Search (NIFTY, RELIANCE, SENSEX…)'}
            />
          ) : (
            <span className="ss-tab-title">{tab === 'options' ? 'Options Chain' : 'Futures'}</span>
          )}
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>

        {/* Tab bar */}
        {mode !== 'compare' && (
          <div className="ss-tabs">
            <button className={`ss-tab ${tab === 'symbols' ? 'active' : ''}`} onClick={() => setTab('symbols')}>Symbols</button>
            <button className={`ss-tab ${tab === 'options' ? 'active' : ''}`} onClick={() => setTab('options')}>Options ↗</button>
            <button className={`ss-tab ${tab === 'futures' ? 'active' : ''}`} onClick={() => setTab('futures')}>Futures ↗</button>
          </div>
        )}

        {/* ── SYMBOLS TAB ── */}
        {tab === 'symbols' && (
          <div className="ss-results">
            {/* Section header: "Popular" when no query, "Results" when searching */}
            {results.length > 0 && (
              <div className="ss-section-head">
                {q.trim() ? `Results for "${q.trim().toUpperCase()}"` : 'Popular symbols'}
              </div>
            )}
            {results.length === 0 && q.trim() && (
              <div className="ss-empty">No symbols found for "{q.trim().toUpperCase()}"</div>
            )}
            {results.map((r, i) => {
              // Highlight matched portion of symbol
              const qUp = q.trim().toUpperCase();
              const symUp = r.symbol.toUpperCase();
              const matchIdx = qUp ? symUp.indexOf(qUp) : -1;
              return (
                <button
                  key={r.symbol + r.exchange}
                  className={`ss-row ${i === hi ? 'hi' : ''}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => chooseResult(r)}
                >
                  <span className="ss-sym">
                    {matchIdx >= 0 ? (
                      <>
                        {r.symbol.slice(0, matchIdx)}
                        <mark className="ss-match">{r.symbol.slice(matchIdx, matchIdx + qUp.length)}</mark>
                        {r.symbol.slice(matchIdx + qUp.length)}
                      </>
                    ) : r.symbol}
                  </span>
                  <span className="ss-name">{r.name}</span>
                  <span className={`ss-kind ss-kind-${r.kind ?? 'stock'}`}>{KIND_TAG[r.kind ?? 'stock'] ?? r.kind}</span>
                  <span className="ss-exch">{r.exchange}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── OPTIONS TAB ── */}
        {tab === 'options' && (
          <div className="ss-deriv-body">
            {/* Underlying picker */}
            <div className="ss-ul-row">
              {OPTIONABLE.map((ul) => (
                <button
                  key={ul}
                  className={`ss-ul-btn ${optUnderlying === ul ? 'active' : ''}`}
                  onClick={() => setOptUnderlying(ul)}
                >{ul}</button>
              ))}
            </div>

            {/* Expiry picker */}
            <div className="ss-expiry-row">
              <span className="ss-label">Expiry</span>
              <div className="ss-expiry-chips">
                {optExpiries.slice(0, 6).map((e) => (
                  <button
                    key={e.value}
                    className={`ss-chip ${optExpiry === e.value ? 'active' : ''}`}
                    onClick={() => setOptExpiry(e.value)}
                  >{e.label}</button>
                ))}
              </div>
            </div>

            {/* Spot price */}
            {spot > 0 && (
              <div className="ss-spot-row">
                <span className="ss-label">Spot</span>
                <span className="ss-spot-price">₹{spot.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
              </div>
            )}

            {/* Chain table */}
            <div className="ss-chain-header">
              <span>CE ↗ (click to chart)</span>
              <span>Strike</span>
              <span>PE ↗ (click to chart)</span>
            </div>
            <div className="ss-chain-body">
              {chainLoading && <div className="ss-empty">Loading chain…</div>}
              {!chainLoading && chain.length === 0 && <div className="ss-empty">No chain data</div>}
              {!chainLoading && chain.map((row) => {
                const isAtm = row.strike === atmStrike;
                const ceItm = spot > 0 && row.strike < spot;
                const peItm = spot > 0 && row.strike > spot;
                return (
                  <div key={row.strike} className={`ss-chain-row ${isAtm ? 'atm' : ''}`}>
                    <button
                      className={`ss-chain-ce ${ceItm ? 'itm' : ''}`}
                      onClick={() => chooseOption(row, 'CE')}
                      disabled={!row.callKey}
                    >
                      <span className="ss-chain-ltp">₹{fmt(row.callLtp)}</span>
                      {row.callOi > 0 && <span className="ss-chain-oi">{(row.callOi / 1000).toFixed(0)}K OI</span>}
                    </button>
                    <div className="ss-chain-strike">
                      {row.strike.toLocaleString('en-IN')}
                      {isAtm && <span className="ss-atm-tag">ATM</span>}
                    </div>
                    <button
                      className={`ss-chain-pe ${peItm ? 'itm' : ''}`}
                      onClick={() => chooseOption(row, 'PE')}
                      disabled={!row.putKey}
                    >
                      <span className="ss-chain-ltp">₹{fmt(row.putLtp)}</span>
                      {row.putOi > 0 && <span className="ss-chain-oi">{(row.putOi / 1000).toFixed(0)}K OI</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── FUTURES TAB ── */}
        {tab === 'futures' && (
          <div className="ss-deriv-body">
            {/* Section toggle: Indices vs Commodities */}
            <div className="ss-fut-section-toggle">
              <button
                className={`ss-fut-section-btn ${futSection === 'indices' ? 'active' : ''}`}
                onClick={() => setFutSection('indices')}
              >NSE Indices</button>
              <button
                className={`ss-fut-section-btn ${futSection === 'commodities' ? 'active' : ''}`}
                onClick={() => setFutSection('commodities')}
              >MCX Commodities</button>
            </div>

            {/* Underlying picker — indices */}
            {futSection === 'indices' && (
              <div className="ss-ul-row">
                {OPTIONABLE.map((ul) => (
                  <button
                    key={ul}
                    className={`ss-ul-btn ${futUnderlying === ul ? 'active' : ''}`}
                    onClick={() => setFutUnderlying(ul)}
                  >{ul}</button>
                ))}
              </div>
            )}

            {/* Underlying picker — MCX commodities */}
            {futSection === 'commodities' && (
              <div className="ss-ul-row ss-ul-row-wrap">
                {MCX_COMMODITIES.map(({ sym, label }) => (
                  <button
                    key={sym}
                    className={`ss-ul-btn ${futCommodity === sym ? 'active' : ''}`}
                    onClick={() => setFutCommodity(sym)}
                  >{label}</button>
                ))}
              </div>
            )}

            {/* Futures list */}
            <div className="ss-fut-list">
              {futLoading && <div className="ss-empty">Loading…</div>}
              {!futLoading && futures.length === 0 && <div className="ss-empty">No futures data</div>}
              {!futLoading && futures.map((f) => (
                <button key={f.expiry} className="ss-fut-row" onClick={() => chooseFuture(f)}>
                  <div className="ss-fut-left">
                    <span className="ss-sym">{f.symbol}</span>
                    <span className="ss-fut-expiry">{f.expiryLabel}</span>
                  </div>
                  <div className="ss-fut-right">
                    <span className="ss-fut-ltp">₹{f.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    <span className={`ss-kind ${futSection === 'commodities' ? 'ss-kind-commodity' : ''}`}>
                      {futSection === 'commodities' ? 'MCX Futures' : 'Futures'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
