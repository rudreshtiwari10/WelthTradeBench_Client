import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDrawingStore } from '../state/drawingStore';
import { toolLabel } from './tools';
import type { DStyle, DPoint } from './types';
import './DrawingSettingsModal.css';

const PRESET_COLORS = [
  '#2962ff', '#ef5350', '#26a69a', '#ff9800',
  '#ab47bc', '#ffeb3b', '#ffffff', '#787b86',
  '#4caf50', '#f06292', '#00bcd4', '#ff7043',
];

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'];

const LINE_TOOLS = new Set(['trendline', 'ray', 'extended', 'arrow', 'hline', 'hray']);
const FILL_TOOLS = new Set(['rect', 'ellipse', 'triangle', 'pchannel', 'fib', 'longpos', 'shortpos']);

interface Props {
  drawingId: string;
  onClose: () => void;
}

export function DrawingSettingsModal({ drawingId, onClose }: Props) {
  const { drawings, setStyle, updateDrawing } = useDrawingStore();
  const d = drawings.find((x) => x.id === drawingId);
  const [tab, setTab] = useState<'style' | 'coords' | 'visibility'>('style');

  // Local editable copies of point values
  const [localPoints, setLocalPoints] = useState<DPoint[]>([]);

  useEffect(() => {
    if (d) setLocalPoints(d.points.map((p) => ({ ...p })));
  }, [drawingId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!d) return null;

  const s = d.style;

  const patchStyle = (patch: Partial<DStyle>) => setStyle(d.id, patch);

  const applyCoords = () => {
    updateDrawing(d.id, { points: localPoints });
  };

  const toggleTF = (tf: string) => {
    const vis = d.timeframeVisibility ?? [];
    const next = vis.includes(tf) ? vis.filter((x) => x !== tf) : [...vis, tf];
    updateDrawing(d.id, { timeframeVisibility: next.length ? next : undefined });
  };

  const isTFVisible = (tf: string) =>
    !d.timeframeVisibility || d.timeframeVisibility.length === 0 || d.timeframeVisibility.includes(tf);

  const modal = (
    <div className="dsm-overlay" onPointerDown={onClose}>
      <div className="dsm-modal" onPointerDown={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dsm-header">
          <span className="dsm-title">{toolLabel(d.type)} Settings</span>
          <button className="dsm-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="dsm-tabs">
          {(['style', 'coords', 'visibility'] as const).map((t) => (
            <button key={t} className={`dsm-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Style tab ── */}
        {tab === 'style' && (
          <div className="dsm-body">
            {/* Line color */}
            <div className="dsm-row">
              <label className="dsm-label">Color</label>
              <div className="dsm-colors">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`dsm-swatch ${s.color === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => patchStyle({ color: c })}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  className="dsm-color-input"
                  value={s.color.startsWith('#') && s.color.length === 7 ? s.color : '#2962ff'}
                  onChange={(e) => patchStyle({ color: e.target.value })}
                  title="Custom color"
                />
              </div>
            </div>

            {/* Opacity */}
            <div className="dsm-row">
              <label className="dsm-label">Opacity</label>
              <input
                type="range" min="0" max="100" step="1"
                className="dsm-range"
                value={Math.round((s.opacity ?? 1) * 100)}
                onChange={(e) => patchStyle({ opacity: parseInt(e.target.value) / 100 })}
              />
              <span className="dsm-range-val">{Math.round((s.opacity ?? 1) * 100)}%</span>
            </div>

            {/* Line width */}
            <div className="dsm-row">
              <label className="dsm-label">Width</label>
              <div className="dsm-btns">
                {[1, 2, 3, 4].map((w) => (
                  <button
                    key={w}
                    className={`dsm-btn ${s.width === w ? 'active' : ''}`}
                    onClick={() => patchStyle({ width: w })}
                  >
                    <span className="dsm-width-preview" style={{ height: w }} />
                  </button>
                ))}
              </div>
            </div>

            {/* Line style */}
            <div className="dsm-row">
              <label className="dsm-label">Style</label>
              <div className="dsm-btns">
                {[
                  { v: 'solid', l: '──' },
                  { v: 'dashed', l: '- -' },
                  { v: 'dotted', l: '···' },
                ].map(({ v, l }) => (
                  <button
                    key={v}
                    className={`dsm-btn ${s.style === v ? 'active' : ''}`}
                    onClick={() => patchStyle({ style: v as DStyle['style'] })}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Extend options for line tools */}
            {LINE_TOOLS.has(d.type) && (
              <>
                {(d.type === 'trendline' || d.type === 'ray' || d.type === 'extended') && (
                  <div className="dsm-row">
                    <label className="dsm-label">Extend</label>
                    <div className="dsm-checks">
                      <label className="dsm-check">
                        <input type="checkbox" checked={!!s.extendLeft} onChange={(e) => patchStyle({ extendLeft: e.target.checked })} />
                        Left
                      </label>
                      <label className="dsm-check">
                        <input type="checkbox" checked={!!s.extendRight} onChange={(e) => patchStyle({ extendRight: e.target.checked })} />
                        Right
                      </label>
                    </div>
                  </div>
                )}
                <div className="dsm-row">
                  <label className="dsm-label">Price Label</label>
                  <label className="dsm-check">
                    <input
                      type="checkbox"
                      checked={s.showPriceLabel !== false}
                      onChange={(e) => patchStyle({ showPriceLabel: e.target.checked })}
                    />
                    Show on right axis
                  </label>
                </div>
              </>
            )}

            {/* Fill options for shape tools */}
            {FILL_TOOLS.has(d.type) && (
              <>
                <div className="dsm-row">
                  <label className="dsm-label">Fill color</label>
                  <input
                    type="color"
                    className="dsm-color-input"
                    value={s.fill?.match(/#[0-9a-fA-F]{6}/) ? s.fill : '#2962ff'}
                    onChange={(e) => patchStyle({ fill: e.target.value })}
                  />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Fill opacity</label>
                  <input
                    type="range" min="0" max="100" step="1"
                    className="dsm-range"
                    value={Math.round((s.fillOpacity ?? 0.12) * 100)}
                    onChange={(e) => patchStyle({ fillOpacity: parseInt(e.target.value) / 100 })}
                  />
                  <span className="dsm-range-val">{Math.round((s.fillOpacity ?? 0.12) * 100)}%</span>
                </div>
              </>
            )}

            {/* Text / font for text tools */}
            {(d.type === 'text' || d.type === 'callout' || d.type === 'emoji') && (
              <>
                <div className="dsm-row">
                  <label className="dsm-label">Font size</label>
                  <input
                    type="number" min="8" max="72" step="1"
                    className="dsm-number"
                    value={s.fontSize ?? 14}
                    onChange={(e) => patchStyle({ fontSize: parseInt(e.target.value) || 14 })}
                  />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Text color</label>
                  <input
                    type="color"
                    className="dsm-color-input"
                    value={s.textColor?.startsWith('#') ? s.textColor : '#d1d4dc'}
                    onChange={(e) => patchStyle({ textColor: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Coordinates tab ── */}
        {tab === 'coords' && (
          <div className="dsm-body">
            {localPoints.map((p, i) => (
              <div key={i} className="dsm-coord-row">
                <span className="dsm-coord-label">Point {i + 1}</span>
                <div className="dsm-coord-fields">
                  <label className="dsm-field-label">
                    Price
                    <input
                      type="number" step="0.01"
                      className="dsm-coord-input"
                      value={p.price}
                      onChange={(e) => {
                        const pts = localPoints.map((x, j) => j === i ? { ...x, price: parseFloat(e.target.value) || x.price } : x);
                        setLocalPoints(pts);
                      }}
                    />
                  </label>
                  <label className="dsm-field-label">
                    Bar
                    <input
                      type="number" step="1"
                      className="dsm-coord-input"
                      value={Math.round(p.logical)}
                      onChange={(e) => {
                        const pts = localPoints.map((x, j) => j === i ? { ...x, logical: parseInt(e.target.value) || x.logical } : x);
                        setLocalPoints(pts);
                      }}
                    />
                  </label>
                </div>
              </div>
            ))}
            <button className="dsm-apply-btn" onClick={applyCoords}>Apply coordinates</button>
          </div>
        )}

        {/* ── Visibility tab ── */}
        {tab === 'visibility' && (
          <div className="dsm-body">
            <p className="dsm-vis-hint">Show this drawing on selected timeframes only. Uncheck all to hide everywhere.</p>
            <div className="dsm-tf-grid">
              {TIMEFRAMES.map((tf) => (
                <label key={tf} className="dsm-tf-check">
                  <input
                    type="checkbox"
                    checked={isTFVisible(tf)}
                    onChange={() => toggleTF(tf)}
                  />
                  {tf}
                </label>
              ))}
            </div>
            {d.timeframeVisibility && d.timeframeVisibility.length > 0 && (
              <button
                className="dsm-apply-btn"
                style={{ marginTop: 12 }}
                onClick={() => updateDrawing(d.id, { timeframeVisibility: undefined })}
              >
                Show on all timeframes
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="dsm-footer">
          <button className="dsm-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
