import { useState, useRef, useEffect } from 'react';
import { Icon } from '../icons/Icon';
import { useDrawingStore } from '../state/drawingStore';
import { useUiStore } from '../state/uiStore';
import type { DStyle } from './types';
import { DEFAULT_FIB_LEVELS } from './types';
import './DrawingProperties.css';

const COLORS = [
  '#ef5350', '#e91e63', '#9c27b0', '#673ab7',
  '#2962ff', '#03a9f4', '#26a69a', '#4caf50',
  '#ff9800', '#ff5722', '#ffeb3b', '#ffffff',
  '#787b86', '#131722',
];

/** Floating TradingView-style properties bar shown when a drawing is selected. */
export function DrawingToolbarState() {
  const {
    drawings, selectedId, multiSelected, setStyle, removeDrawing, select,
    updateDrawing,
    templates, saveTemplate, applyTemplate, deleteTemplate,
    defaultStyle, setDefaultStyle, defaultText, setDefaultText,
    removeMultiSelected, undo, redo, history, future,
  } = useDrawingStore();
  const { openDrawingSettings } = useUiStore();

  const [colorOpen, setColorOpen]       = useState(false);
  const [tmplOpen, setTmplOpen]         = useState(false);
  const [savingName, setSavingName]     = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [pickerOpen, setPickerOpen]     = useState<string | null>(null);
  const colorRef = useRef<HTMLDivElement>(null);
  const tmplRef  = useRef<HTMLDivElement>(null);

  const d = drawings.find((x) => x.id === selectedId);

  // Close dropdowns on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setColorOpen(false);
      if (tmplRef.current  && !tmplRef.current.contains(e.target as Node))  setTmplOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  if (!d) return null;

  const lineW = d.style.width ?? 1;

  // ── Tool-type grouping (TradingView scopes templates per group) ──────────
  // Groups of drawing types that share templates with each other.
  const TOOL_GROUPS: Record<string, string[]> = {
    line:    ['trendline', 'ray', 'extended', 'hline', 'hray', 'vline', 'arrow', 'infoline', 'trendangle', 'crossline'],
    shape:   ['rect', 'ellipse'],
    fib:     ['fib', 'fibext', 'fibspiral', 'fibchannel', 'fibtime', 'fibwedge', 'fibcircles', 'fibretracement', 'fibs'],
    channel: ['pchannel', 'pitchfork', 'schiff', 'insidepitchfork', 'disjointchannel'],
    brush:   ['brush', 'highlighter'],
    text:    ['text', 'callout', 'balloon'],
    measure: ['measure'],
  };

  const getGroupForType = (type: string): string => {
    for (const [group, types] of Object.entries(TOOL_GROUPS)) {
      if (types.includes(type)) return group;
    }
    return type; // fallback: use the type itself as its own group
  };

  const currentGroup = getGroupForType(d.type);
  const groupLabel: Record<string, string> = {
    line: 'Line Templates', shape: 'Shape Templates', fib: 'Fibonacci Templates',
    channel: 'Channel Templates', brush: 'Brush Templates', text: 'Text Templates', measure: 'Measure Templates',
  };

  // Show only templates saved for this tool-group (toolType matches) or old unscoped ones
  const visibleTemplates = templates.filter((t) =>
    !t.toolType || getGroupForType(t.toolType) === currentGroup,
  );

  const handleSaveTemplate = () => {
    if (!d) return;
    const name = savingName.trim() || `Style ${visibleTemplates.length + 1}`;
    // Save style AND text with the template
    saveTemplate(name, d.style, d.type, d.text);
    setSavingName('');
    setShowSaveInput(false);
    setTmplOpen(false);
  };

  return (
    <div className="draw-props" onPointerDown={(e) => e.stopPropagation()}>

      {/* ── Drag handle ── */}
      <span className="dp-handle" title="Drag toolbar">⠿</span>

      <div className="dp-sep" />

      {/* ── Color picker button ── */}
      <div className="dp-color-wrap" ref={colorRef}>
        <button
          className="dp-color-btn"
          title="Line color"
          onClick={() => { setColorOpen((o) => !o); setTmplOpen(false); }}
        >
          {/* Pencil icon with current color underline */}
          <span className="dp-color-icon">
            {/* Inline pencil SVG — TradingView style */}
            <svg width="18" height="18" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 L22 10 L12 20 L8 21 L9 17 Z" />
              <line x1="15" y1="9" x2="19" y2="13" />
            </svg>
            <span className="dp-color-bar" style={{ background: d.style.color }} />
          </span>
        </button>
        {colorOpen && (
          <div className="dp-color-popup">
            <div className="dp-color-grid">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`dp-swatch ${d.style.color === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => {
                    const patch: Partial<DStyle> = { color: c };
                    if (d.type === 'fib') {
                      const levels = d.style.fibLevels ?? DEFAULT_FIB_LEVELS;
                      patch.fibLevels = levels.map(l => ({ ...l, color: c }));
                    }
                    setStyle(d.id, patch);
                    setColorOpen(false);
                  }}
                  title={c}
                />
              ))}
            </div>
            <div className="dp-color-custom-row">
              <label className="dp-color-custom-label">Custom</label>
              <input
                type="color"
                className="dp-color-native"
                value={d.style.color.startsWith('#') && d.style.color.length === 7 ? d.style.color : '#ffffff'}
                onChange={(e) => {
                  const c = e.target.value;
                  const patch: Partial<DStyle> = { color: c };
                  if (d.type === 'fib') {
                    const levels = d.style.fibLevels ?? DEFAULT_FIB_LEVELS;
                    patch.fibLevels = levels.map(l => ({ ...l, color: c }));
                  }
                  setStyle(d.id, patch);
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Fill Color Picker (for rect/ellipse) */}
      {(d.type === 'rect' || d.type === 'ellipse') && (
        <div className="dp-color-wrap" onMouseLeave={() => setPickerOpen(null)}>
            <div
              className="dp-color-btn"
              onClick={() => setPickerOpen(pickerOpen === 'fill' ? null : 'fill')}
              title="Fill color"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/>
                <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6z" fill="currentColor" style={{ color: d.style.fill || 'transparent' }}/>
              </svg>
            </div>
            {pickerOpen === 'fill' && (
              <div className="dp-color-popover">
                <div className="dp-color-grid">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      className="dp-color-cell"
                      style={{ background: c }}
                      onClick={() => {
                        setStyle(d.id, { fill: c });
                        setPickerOpen(null);
                      }}
                    />
                  ))}
                  <button
                    className="dp-color-cell"
                    style={{ background: 'transparent', border: '1px solid #363a45', color: '#787b86', fontSize: '10px' }}
                    onClick={() => {
                      setStyle(d.id, { fill: 'transparent' });
                      setPickerOpen(null);
                    }}
                  >
                    ∅
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      {/* Quick Background Toggle (for Fib) */}
      {d.type === 'fib' && (
        <>
          <div className="dp-sep" />
          <button
            className={`dp-icon-btn ${d.style.fibShowBackground !== false ? 'active' : ''}`}
            title="Toggle Background Area"
            onClick={() => setStyle(d.id, { fibShowBackground: d.style.fibShowBackground === false })}
          >
            <Icon name="layout" size={22} />
          </button>
        </>
      )}

      <div className="dp-sep" />
      <button
        className="dp-text-btn"
        title={d.text ? `Edit text: "${d.text}"` : 'Add text to line'}
        onClick={() => {
          const t = window.prompt('Line text:', d.text ?? '');
          if (t !== null) updateDrawing(d.id, { text: t || undefined });
        }}
      >
        <span className="dp-text-icon">
          <svg width="18" height="18" viewBox="0 0 13 14" fill="none">
            <text x="0" y="13" fontSize="16" fontWeight="700" fontFamily="sans-serif" fill="currentColor">T</text>
          </svg>
          <span
            className="dp-color-bar"
            style={{ background: d.text ? d.style.color : 'rgba(201,203,211,0.35)' }}
          />
        </span>
      </button>

      <div className="dp-sep" />

      {/* ── Line style: solid / dashed / dotted ── */}
      <button
        className={`dp-linestyle-btn ${d.style.style === 'solid' ? 'active' : ''}`}
        title="Solid line"
        onClick={() => setStyle(d.id, { style: 'solid' })}
      >
        <span className="dp-linepat dp-linepat-solid" />
      </button>
      <button
        className={`dp-linestyle-btn ${d.style.style === 'dashed' ? 'active' : ''}`}
        title="Dashed line"
        onClick={() => setStyle(d.id, { style: 'dashed' })}
      >
        <span className="dp-linepat dp-linepat-dashed" />
      </button>
      <button
        className={`dp-linestyle-btn ${d.style.style === 'dotted' ? 'active' : ''}`}
        title="Dotted line"
        onClick={() => setStyle(d.id, { style: 'dotted' })}
      >
        <span className="dp-linepat dp-linepat-dotted" />
      </button>

      <div className="dp-sep" />

      {/* ── Line width: visual bars ── */}
      {[1, 2, 3, 4].map((w) => (
        <button
          key={w}
          className={`dp-width-btn ${lineW === w ? 'active' : ''}`}
          title={`${w}px`}
          onClick={() => setStyle(d.id, { width: w })}
        >
          <span className="dp-width-bar" style={{ height: w }} />
        </button>
      ))}

      {/* Width label */}
      <span className="dp-px-label">{lineW}px</span>

      <div className="dp-sep" />

      {/* ── Templates ── */}
      <div className="dp-tmpl-wrap" ref={tmplRef}>
        <button
          className="dp-icon-btn"
          title="Templates"
          onClick={() => { setTmplOpen((o) => !o); setColorOpen(false); }}
        >
          <Icon name="gridPlus" size={15} />
        </button>
        {tmplOpen && (
          <div className="dp-tmpl-menu">
            <div className="dp-tmpl-head">{groupLabel[currentGroup] ?? 'Templates'}</div>
            {visibleTemplates.length === 0 && <div className="dp-tmpl-empty">No saved templates</div>}
            {visibleTemplates.map((t) => (
              <div key={t.id} className="dp-tmpl-row">
                <span className="dp-tmpl-dot" style={{ background: t.style.color }} />
                <button
                  className="dp-tmpl-name"
                  title={t.text ? `Apply "${t.name}" (includes text: "${t.text}")` : `Apply "${t.name}"`}
                  onClick={() => { applyTemplate(t.id); setTmplOpen(false); }}
                >
                  {t.name}
                  {t.text && <span className="dp-tmpl-has-text" title={t.text}>T</span>}
                </button>
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTemplate();
                    if (e.key === 'Escape') setShowSaveInput(false);
                    e.stopPropagation();
                  }}
                />
                <button className="dp-tmpl-confirm" onClick={handleSaveTemplate}>Save</button>
              </div>
            ) : (
              <button className="dp-tmpl-add" onClick={() => setShowSaveInput(true)}>
                + Save as template{d.text ? ' (with text)' : ''}
              </button>
            )}
            <div className="dp-tmpl-sep" />
            <button
              className="dp-tmpl-add"
              title="Reset to default style"
              onClick={() => { setStyle(d.id, { ...defaultStyle }); setTmplOpen(false); }}
            >↺ Apply default</button>
            <button
              className="dp-tmpl-add"
              title="Make this style the default for new drawings"
              onClick={() => { setDefaultStyle(d.style); setDefaultText(d.text ?? null); setTmplOpen(false); }}
            >★ Save as default</button>
          </div>
        )}
      </div>

      <div className="dp-sep" />

      {/* ── Undo / Redo ── */}
      <button
        className="dp-icon-btn"
        title="Undo (Ctrl+Z)"
        onClick={undo}
        disabled={!history.length}
        style={{ opacity: history.length ? 1 : 0.35 }}
      >↩</button>
      <button
        className="dp-icon-btn"
        title="Redo (Ctrl+Shift+Z)"
        onClick={redo}
        disabled={!future.length}
        style={{ opacity: future.length ? 1 : 0.35 }}
      >↪</button>

      <div className="dp-sep" />

      {/* ── Lock ── */}
      <button
        className="dp-icon-btn"
        onClick={() => updateDrawing(d.id, { locked: !d.locked })}
        title={d.locked ? 'Unlock drawing' : 'Lock drawing'}
      >
        <Icon name="lock" size={20} />
      </button>

      {/* ── Delete ── */}
      {multiSelected.length > 1 && (
        <button className="dp-icon-btn danger" title={`Delete ${multiSelected.length} drawings`} onClick={removeMultiSelected}>
          <Icon name="trash" size={20} />
          <span style={{ fontSize: 11, marginLeft: 2 }}>{multiSelected.length}</span>
        </button>
      )}
      <button className="dp-icon-btn danger" onClick={() => removeDrawing(d.id)} title="Delete (Del)">
        <Icon name="trash" size={20} />
      </button>

      {/* ── Settings ── */}
      <button className="dp-icon-btn" title="Settings" onClick={() => openDrawingSettings(d.id)}>
        <Icon name="settings" size={20} />
      </button>

      {/* ── Close / Deselect ── */}
      <button className="dp-icon-btn" onClick={() => select(null)} title="Deselect (Esc)">
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}
