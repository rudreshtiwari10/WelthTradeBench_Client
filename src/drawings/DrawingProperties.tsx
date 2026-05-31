import { Icon } from '../icons/Icon';
import { useDrawingStore } from '../state/drawingStore';
import './DrawingProperties.css';

const COLORS = ['#2962ff', '#ef5350', '#26a69a', '#ff9800', '#ab47bc', '#ffeb3b', '#ffffff', '#787b86'];
const WIDTHS = [1, 2, 3, 4];
const STYLES: { v: 'solid' | 'dashed' | 'dotted'; label: string }[] = [
  { v: 'solid', label: '──' }, { v: 'dashed', label: '- -' }, { v: 'dotted', label: '···' },
];

/** Floating properties bar shown above the chart while a drawing is selected. */
export function DrawingToolbarState() {
  const { drawings, selectedId, setStyle, removeDrawing, select, updateDrawing } = useDrawingStore();
  const d = drawings.find((x) => x.id === selectedId);
  if (!d) return null;

  return (
    <div className="draw-props" onPointerDown={(e) => e.stopPropagation()}>
      <div className="dp-colors">
        {COLORS.map((c) => (
          <button
            key={c}
            className={`dp-swatch ${d.style.color === c ? 'active' : ''}`}
            style={{ background: c }}
            onClick={() => setStyle(d.id, { color: c })}
            title={c}
          />
        ))}
      </div>
      <div className="dp-sep" />
      <div className="dp-group">
        {WIDTHS.map((w) => (
          <button key={w} className={`dp-width ${d.style.width === w ? 'active' : ''}`} onClick={() => setStyle(d.id, { width: w })}>
            <span style={{ height: w }} />
          </button>
        ))}
      </div>
      <div className="dp-sep" />
      <div className="dp-group">
        {STYLES.map((st) => (
          <button key={st.v} className={`dp-style ${d.style.style === st.v ? 'active' : ''}`} onClick={() => setStyle(d.id, { style: st.v })}>
            {st.label}
          </button>
        ))}
      </div>
      {(d.type === 'text' || d.type === 'callout') && (
        <>
          <div className="dp-sep" />
          <button className="dp-btn" onClick={() => { const t = window.prompt('Text:', d.text); if (t != null) updateDrawing(d.id, { text: t }); }} title="Edit text">
            <Icon name="text" size={16} />
          </button>
        </>
      )}
      <div className="dp-sep" />
      <button className="dp-btn" onClick={() => updateDrawing(d.id, { locked: !d.locked })} title={d.locked ? 'Unlock' : 'Lock'}>
        <Icon name="lock" size={16} />
      </button>
      <button className="dp-btn danger" onClick={() => removeDrawing(d.id)} title="Remove (Del)">
        <Icon name="trash" size={16} />
      </button>
      <button className="dp-btn" onClick={() => select(null)} title="Close">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
