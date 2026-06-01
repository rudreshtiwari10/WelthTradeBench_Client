import { useState } from 'react';
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
  const {
    drawings, selectedId, multiSelected, setStyle, removeDrawing, select,
    updateDrawing, duplicateDrawing, bringToFront, sendToBack,
    templates, saveTemplate, applyTemplate, deleteTemplate,
    copySelected, removeMultiSelected,
  } = useDrawingStore();

  const [tmplOpen, setTmplOpen] = useState(false);
  const [savingName, setSavingName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const d = drawings.find((x) => x.id === selectedId);
  if (!d) return null;

  const handleSaveTemplate = () => {
    const name = savingName.trim() || `Style ${templates.length + 1}`;
    saveTemplate(name);
    setSavingName('');
    setShowSaveInput(false);
    setTmplOpen(false);
  };

  return (
    <div className="draw-props" onPointerDown={(e) => e.stopPropagation()}>
      {/* Color swatches */}
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

      {/* Line width */}
      <div className="dp-group">
        {WIDTHS.map((w) => (
          <button key={w} className={`dp-width ${d.style.width === w ? 'active' : ''}`} onClick={() => setStyle(d.id, { width: w })}>
            <span style={{ height: w }} />
          </button>
        ))}
      </div>

      <div className="dp-sep" />

      {/* Line style */}
      <div className="dp-group">
        {STYLES.map((st) => (
          <button key={st.v} className={`dp-style ${d.style.style === st.v ? 'active' : ''}`} onClick={() => setStyle(d.id, { style: st.v })}>
            {st.label}
          </button>
        ))}
      </div>

      {/* Text edit */}
      {(d.type === 'text' || d.type === 'callout') && (
        <>
          <div className="dp-sep" />
          <button className="dp-btn" onClick={() => { const t = window.prompt('Text:', d.text); if (t != null) updateDrawing(d.id, { text: t }); }} title="Edit text">
            <Icon name="text" size={16} />
          </button>
        </>
      )}

      <div className="dp-sep" />

      {/* Templates dropdown */}
      <div className="dp-tmpl-wrap">
        <button className="dp-btn" title="Style templates" onClick={() => setTmplOpen((o) => !o)}>
          <Icon name="layout" size={16} />
        </button>
        {tmplOpen && (
          <div className="dp-tmpl-menu">
            <div className="dp-tmpl-head">Style Templates</div>
            {templates.length === 0 && <div className="dp-tmpl-empty">No saved templates</div>}
            {templates.map((t) => (
              <div key={t.id} className="dp-tmpl-row">
                <span
                  className="dp-tmpl-dot"
                  style={{ background: t.style.color }}
                />
                <button className="dp-tmpl-name" onClick={() => { applyTemplate(t.id); setTmplOpen(false); }}>{t.name}</button>
                <button className="dp-tmpl-del" title="Delete template" onClick={() => deleteTemplate(t.id)}>×</button>
              </div>
            ))}
            <div className="dp-tmpl-sep" />
            {showSaveInput ? (
              <div className="dp-tmpl-save-row">
                <input
                  className="dp-tmpl-input"
                  placeholder="Template name…"
                  value={savingName}
                  autoFocus
                  onChange={(e) => setSavingName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTemplate(); if (e.key === 'Escape') setShowSaveInput(false); e.stopPropagation(); }}
                />
                <button className="dp-tmpl-confirm" onClick={handleSaveTemplate}>Save</button>
              </div>
            ) : (
              <button className="dp-tmpl-add" onClick={() => setShowSaveInput(true)}>+ Save current style</button>
            )}
          </div>
        )}
      </div>

      <div className="dp-sep" />

      {/* Copy / duplicate */}
      <button className="dp-btn" title="Copy drawing (Ctrl+C)" onClick={copySelected}><Icon name="compare" size={16} /></button>
      <button className="dp-btn" title="Duplicate (Ctrl+D)" onClick={() => duplicateDrawing(d.id)}><Icon name="plus" size={16} /></button>

      <div className="dp-sep" />

      {/* Ordering */}
      <button className="dp-btn" title="Bring to front" onClick={() => bringToFront(d.id)}>↑</button>
      <button className="dp-btn" title="Send to back" onClick={() => sendToBack(d.id)}>↓</button>

      <div className="dp-sep" />

      {/* Lock / delete / close */}
      <button className="dp-btn" onClick={() => updateDrawing(d.id, { locked: !d.locked })} title={d.locked ? 'Unlock drawing' : 'Lock drawing'}>
        <Icon name="lock" size={16} />
      </button>
      {multiSelected.length > 1 && (
        <button className="dp-btn danger" title={`Delete ${multiSelected.length} drawings`} onClick={removeMultiSelected}>
          <Icon name="trash" size={16} />
          <span style={{ fontSize: 10, marginLeft: 2 }}>{multiSelected.length}</span>
        </button>
      )}
      <button className="dp-btn danger" onClick={() => removeDrawing(d.id)} title="Delete (Del)">
        <Icon name="trash" size={16} />
      </button>
      <button className="dp-btn" onClick={() => select(null)} title="Deselect (Esc)">
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
