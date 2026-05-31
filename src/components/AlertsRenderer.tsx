import { useEffect, useRef } from 'react';
import { LineStyle, type IPriceLine } from 'lightweight-charts';
import { useChartApi } from '../chart/ChartContext';
import { useChartStore } from '../state/chartStore';
import { useAlertStore } from '../state/alertStore';
import { useToastStore } from '../state/toastStore';

/** Draws alert price lines for the active symbol and fires when price crosses. */
export function AlertsRenderer() {
  const { seriesRef, candlesRef, ready } = useChartApi();
  const symbol = useChartStore((s) => s.symbol.symbol);
  const dataVersion = useChartStore((s) => s.dataVersion);
  const { alerts, markFired } = useAlertStore();
  const push = useToastStore((s) => s.push);
  const lines = useRef<Map<string, IPriceLine>>(new Map());
  const prevLast = useRef<number | null>(null);

  // Reconcile price lines for this symbol.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !ready) return;
    const live = new Set(alerts.filter((a) => a.symbol === symbol).map((a) => a.id));
    for (const [id, pl] of lines.current) {
      if (!live.has(id)) { try { series.removePriceLine(pl); } catch { /* */ } lines.current.delete(id); }
    }
    for (const a of alerts) {
      if (a.symbol !== symbol || lines.current.has(a.id)) continue;
      lines.current.set(a.id, series.createPriceLine({
        price: a.price, color: a.fired ? '#787b86' : '#f7525f', lineWidth: 1,
        lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: '🔔',
      }));
    }
  }, [alerts, symbol, ready, seriesRef]);

  // Cross detection on each data update.
  useEffect(() => {
    const candles = candlesRef.current;
    const last = candles[candles.length - 1]?.close;
    if (last == null) return;
    const prev = prevLast.current;
    if (prev != null) {
      for (const a of alerts) {
        if (a.fired || a.symbol !== symbol) continue;
        const crossedUp = prev < a.price && last >= a.price;
        const crossedDown = prev > a.price && last <= a.price;
        if (crossedUp || crossedDown) {
          markFired(a.id);
          push(`${a.symbol} crossed ${a.price.toLocaleString('en-IN')} (now ${last.toLocaleString('en-IN', { maximumFractionDigits: 2 })})`, 'alert');
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Tradomate alert', { body: `${a.symbol} crossed ${a.price}` });
          }
        }
      }
    }
    prevLast.current = last;
  }, [dataVersion, alerts, symbol, candlesRef, markFired, push]);

  return null;
}
