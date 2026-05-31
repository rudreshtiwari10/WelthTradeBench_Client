import { useEffect, useState } from 'react';
import { Icon } from '../icons/Icon';
import { useChartStore } from '../state/chartStore';
import './BottomBar.css';

const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'All'];

export function BottomBar() {
  const [active, setActive] = useState('1Y');
  const [clock, setClock] = useState('');
  const requestRange = useChartStore((s) => s.requestRange);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      setClock(`${hh}:${mm}:${ss} UTC`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <footer className="bottombar">
      <div className="bb-ranges">
        {RANGES.map((r) => (
          <button
            key={r}
            className={`bb-range ${active === r ? 'active' : ''}`}
            onClick={() => { setActive(r); requestRange(r); }}
          >
            {r}
          </button>
        ))}
        <button className="icon-btn sm" title="Go to a date"><Icon name="layout" size={15} /></button>
      </div>

      <div className="bb-right">
        <span className="bb-clock">{clock}</span>
        <button className="icon-btn sm" title="Time zone / clock"><Icon name="settings" size={15} /></button>
        <span className="bb-sep" />
        <button className="pill-btn xs" title="Log scale">log</button>
        <button className="pill-btn xs" title="Auto (fits data to screen)">auto</button>
      </div>
    </footer>
  );
}
