import { useMemo, useState } from 'react';
import { Icon } from '../icons/Icon';
import { INDICATORS } from '../indicators/registry';
import { useIndicatorStore } from '../state/indicatorStore';
import { useUiStore } from '../state/uiStore';
import './IndicatorsDialog.css';

export function IndicatorsDialog() {
  const open = useUiStore((s) => s.indicatorsOpen);
  const close = useUiStore((s) => s.closeIndicators);
  const add = useIndicatorStore((s) => s.add);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const filtered = INDICATORS.filter((d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.short.toLowerCase().includes(q.toLowerCase()));
    const byCat: Record<string, typeof INDICATORS> = {};
    for (const d of filtered) (byCat[d.category] ||= []).push(d);
    return byCat;
  }, [q]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="ind-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ind-head">
          <span className="ind-title">Indicators, metrics & strategies</span>
          <button className="icon-btn" onClick={close}><Icon name="close" size={18} /></button>
        </div>
        <div className="ind-search">
          <Icon name="search" size={18} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        </div>
        <div className="ind-list">
          {Object.entries(groups).map(([cat, items]) => (
            <div key={cat}>
              <div className="ind-cat">{cat}</div>
              {items.map((d) => (
                <button key={d.id} className="ind-item" onClick={() => add(d.id)}>
                  <Icon name="indicators" size={16} />
                  <span className="ind-name">{d.name}</span>
                  <span className="ind-add">＋</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
