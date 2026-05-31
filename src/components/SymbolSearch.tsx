import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { searchSymbols, type SearchResult } from '../data/dataService';
import { useChartStore } from '../state/chartStore';
import { useCompareStore } from '../state/compareStore';
import './SymbolSearch.css';

const KIND_TAG: Record<string, string> = { index: 'index', stock: 'stock', future: 'futures', crypto: 'crypto' };

export function SymbolSearch({ onClose, mode = 'replace' }: { onClose: () => void; mode?: 'replace' | 'compare' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const setSymbol = useChartStore((s) => s.setSymbol);
  const addCompare = useCompareStore((s) => s.add);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    const id = setTimeout(async () => {
      const r = await searchSymbols(q);
      if (active) {
        setResults(r);
        setHi(0);
      }
    }, 120);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [q]);

  const choose = (r: SearchResult) => {
    if (mode === 'compare') addCompare(r.symbol, r.name);
    else setSymbol({ symbol: r.symbol, name: r.name, exchange: r.exchange, kind: r.kind });
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && results[hi]) choose(results[hi]);
    else if (e.key === 'Escape') onClose();
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="symbol-search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ss-input-row">
          <Icon name="search" size={20} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder={mode === 'compare' ? 'Compare / add symbol…' : 'Search (e.g. NIFTY, RELIANCE, SENSEX)'}
          />
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="close" size={18} /></button>
        </div>

        <div className="ss-results">
          {results.length === 0 && <div className="ss-empty">No symbols found</div>}
          {results.map((r, i) => (
            <button
              key={r.symbol + r.exchange}
              className={`ss-row ${i === hi ? 'hi' : ''}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => choose(r)}
            >
              <span className="ss-sym">{r.symbol}</span>
              <span className="ss-name">{r.name}</span>
              <span className="ss-kind">{KIND_TAG[r.kind ?? 'stock'] ?? r.kind}</span>
              <span className="ss-exch">{r.exchange}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
