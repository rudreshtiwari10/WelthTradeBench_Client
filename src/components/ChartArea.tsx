import { useEffect } from 'react';
import { ChartView } from '../chart/ChartView';
import { SecondaryChart } from '../chart/SecondaryChart';
import { usePanelsStore } from '../state/panelsStore';
import { useChartStore } from '../state/chartStore';
import './ChartArea.css';

export function ChartArea() {
  const layout = usePanelsStore((s) => s.layout);
  const panels = usePanelsStore((s) => s.panels);
  const activeId = usePanelsStore((s) => s.activeId);
  const setActive = usePanelsStore((s) => s.setActive);

  // Active panel ↔ global chart state. (Select primitives only, so per-second
  // dataVersion bumps don't re-render the whole grid.)
  const symbol = useChartStore((s) => s.symbol);
  const interval = useChartStore((s) => s.interval);
  const chartType = useChartStore((s) => s.chartType);

  // When the active panel changes, load its stored config into the chart store.
  useEffect(() => {
    const p = usePanelsStore.getState().panels.find((x) => x.id === activeId);
    if (!p) return;
    const cs = useChartStore.getState();
    if (cs.symbol.symbol !== p.symbol.symbol) cs.setSymbol(p.symbol);
    if (cs.interval !== p.interval) cs.setInterval(p.interval);
    if (cs.chartType !== p.chartType) cs.setChartType(p.chartType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Persist the active chart's config back into its panel slot.
  useEffect(() => {
    usePanelsStore.getState().updatePanel(activeId, { symbol, interval, chartType });
  }, [symbol, interval, chartType, activeId]);

  return (
    <div className={`chart-grid ${layout}`}>
      {panels.map((p) => (
        <div key={p.id} className={`chart-panel ${p.id === activeId ? 'active' : ''}`}>
          {p.id === activeId
            ? <ChartView />
            : <SecondaryChart panel={p} onActivate={() => setActive(p.id)} />}
        </div>
      ))}
    </div>
  );
}
