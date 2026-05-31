import { Icon } from '../icons/Icon';
import { useUiStore } from '../state/uiStore';
import { useSettingsStore } from '../state/settingsStore';
import './ChartSettingsDialog.css';

export function ChartSettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const close = useUiStore((s) => s.closeSettings);
  const s = useSettingsStore();
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="settings-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="sd-head">
          <span className="sd-title">Chart settings</span>
          <button className="icon-btn" onClick={close}><Icon name="close" size={18} /></button>
        </div>

        <div className="sd-body">
          <div className="sd-section">Symbol</div>
          <Row label="Body up"><Color value={s.upColor} onChange={(v) => s.set({ upColor: v })} /></Row>
          <Row label="Body down"><Color value={s.downColor} onChange={(v) => s.set({ downColor: v })} /></Row>
          <Row label="Borders"><Check checked={s.borderVisible} onChange={(v) => s.set({ borderVisible: v })} /></Row>
          <Row label="Wicks"><Check checked={s.wickVisible} onChange={(v) => s.set({ wickVisible: v })} /></Row>

          <div className="sd-section">Canvas</div>
          <Row label="Background"><Color value={s.background || '#131722'} onChange={(v) => s.set({ background: v })} /></Row>
          <Row label="Grid lines"><Check checked={s.gridVisible} onChange={(v) => s.set({ gridVisible: v })} /></Row>
          <Row label="Crosshair color"><Color value={s.crosshairColor} onChange={(v) => s.set({ crosshairColor: v })} /></Row>
          <Row label="Show volume"><Check checked={s.showVolume} onChange={(v) => s.set({ showVolume: v })} /></Row>
        </div>

        <div className="sd-foot">
          <button className="sd-btn ghost" onClick={() => s.reset()}>Reset</button>
          <button className="sd-btn primary" onClick={close}>OK</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="sd-row"><span className="sd-label">{label}</span>{children}</div>;
}
function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="color" className="sd-color" value={value} onChange={(e) => onChange(e.target.value)} />;
}
function Check({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <input type="checkbox" className="sd-check" checked={checked} onChange={(e) => onChange(e.target.checked)} />;
}
