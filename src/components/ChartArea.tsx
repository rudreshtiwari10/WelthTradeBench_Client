import { useEffect } from 'react';
import { ChartView } from '../chart/ChartView';
import { usePanelsStore } from '../state/panelsStore';
import { useChartStore } from '../state/chartStore';
import { PanelProvider } from '../state/PanelContext';
import './ChartArea.css';

export function ChartArea() {
  const layout = usePanelsStore((s) => s.layout);
  const panels = usePanelsStore((s) => s.panels);
  const activeId = usePanelsStore((s) => s.activeId);
  const setActive = usePanelsStore((s) => s.setActive);

  // When the focused panel changes, sync its config into chartStore so TopToolbar
  // reflects the correct symbol/interval/chartType.
  useEffect(() => {
    const p = usePanelsStore.getState().panels.find((x) => x.id === activeId);
    if (!p) return;
    const cs = useChartStore.getState();
    if (cs.symbol.symbol !== p.symbol.symbol) cs.setSymbol(p.symbol);
    if (cs.interval !== p.interval) cs.setInterval(p.interval);
    if (cs.chartType !== p.chartType) cs.setChartType(p.chartType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  return (
    <div className={`chart-grid ${layout}`}>
      {panels.map((p) => (
        <PanelProvider key={p.id} value={p.id}>
          <div
            className={`chart-panel ${p.id === activeId ? 'active' : ''}`}
            onMouseDown={() => setActive(p.id)}
          >
            <ChartView />
          </div>
        </PanelProvider>
      ))}
    </div>
  );
}
