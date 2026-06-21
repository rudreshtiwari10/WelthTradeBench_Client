import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDrawingStore } from '../state/drawingStore';
import { toolLabel } from './tools';
import type { DStyle, DPoint, FibLevelConfig } from './types';
import { DEFAULT_FIB_LEVELS } from './types';
import './DrawingSettingsModal.css';

const PRESET_COLORS = [
  '#2962ff', '#ef5350', '#26a69a', '#ff9800',
  '#ab47bc', '#ffeb3b', '#ffffff', '#787b86',
  '#4caf50', '#f06292', '#00bcd4', '#ff7043',
];

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1H', '2H', '4H', '1D', '1W', '1M'];

const LINE_TOOLS = new Set(['trendline', 'ray', 'extended', 'arrow', 'hline', 'hray']);
const FILL_TOOLS = new Set(['rect', 'ellipse', 'triangle', 'pchannel', 'fib', 'longpos', 'shortpos']);
const VP_TOOLS = new Set(['fixed_vp', 'anchored_vp']);

interface Props {
  drawingId: string;
  onClose: () => void;
}

export function DrawingSettingsModal({ drawingId, onClose }: Props) {
  const { drawings, setStyle, updateDrawing } = useDrawingStore();
  const d = drawings.find((x) => x.id === drawingId);
  const [tab, setTab] = useState<'style' | 'text' | 'coords' | 'visibility'>('style');

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
          {(['style', 'text', 'coords', 'visibility'] as const).map((t) => (
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

            {/* Anchored VWAP options */}
            {d.type === 'anchored_vwap' && (() => {
              const bands = s.vwapBands || [
                { multiplier: 1, upColor: '#4caf50', dnColor: '#4caf50', fillColor: '#4caf50', showBand: true, showFill: true },
                { multiplier: 2, upColor: '#afb42b', dnColor: '#afb42b', fillColor: '#afb42b', showBand: false, showFill: false },
                { multiplier: 3, upColor: '#00897b', dnColor: '#00897b', fillColor: '#00897b', showBand: false, showFill: false },
              ];

              const updateBand = (i: number, patch: Partial<(typeof bands)[0]>) => {
                const copy = [...bands];
                copy[i] = { ...copy[i], ...patch };
                patchStyle({ vwapBands: copy });
              };

              return (
                <div className="dsm-vwap-grid">
                  <div className="dsm-row">
                    <label className="dsm-label">Source</label>
                    <select
                      className="dsm-select"
                      value={s.vwapSource || 'hlc3'}
                      onChange={(e) => patchStyle({ vwapSource: e.target.value as any })}
                    >
                      <option value="close">Close</option>
                      <option value="hl2">(H + L) / 2</option>
                      <option value="hlc3">(H + L + C) / 3</option>
                      <option value="ohlc4">(O + H + L + C) / 4</option>
                    </select>
                  </div>

                  <div className="dsm-row">
                    <label className="dsm-check">
                      <input
                        type="checkbox"
                        checked={s.vwapShowLine !== false}
                        onChange={(e) => patchStyle({ vwapShowLine: e.target.checked })}
                      />
                      VWAP
                    </label>
                    <input
                      type="color"
                      className="dsm-color-input"
                      style={{ width: 36, height: 28 }}
                      value={s.vwapLineColor || s.color}
                      onChange={(e) => patchStyle({ vwapLineColor: e.target.value })}
                    />
                  </div>

                  <div className="dsm-sep" style={{ margin: '12px 0', borderBottom: '1px solid var(--border)' }} />

                  {bands.map((b, i) => (
                    <div key={i} style={{ marginBottom: 16 }}>
                      <div className="dsm-row">
                        <label className="dsm-check" style={{ fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={b.showBand || b.showFill}
                            onChange={(e) => {
                              const v = e.target.checked;
                              updateBand(i, { showBand: v, showFill: v });
                            }}
                          />
                          Bands Multiplier #{i + 1}
                        </label>
                        <input
                          type="number"
                          min="0.1" max="5" step="0.1"
                          className="dsm-number"
                          value={b.multiplier}
                          onChange={(e) => updateBand(i, { multiplier: parseFloat(e.target.value) || 1.0 })}
                        />
                      </div>

                      {(b.showBand || b.showFill) && (
                        <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                          <div className="dsm-row" style={{ height: 28 }}>
                            <label className="dsm-check">
                              <input
                                type="checkbox"
                                checked={b.showBand}
                                onChange={(e) => updateBand(i, { showBand: e.target.checked })}
                              />
                              Upper Band
                            </label>
                            <input
                              type="color" className="dsm-color-input" style={{ width: 36, height: 28 }}
                              value={b.upColor} onChange={(e) => updateBand(i, { upColor: e.target.value })}
                            />
                          </div>

                          <div className="dsm-row" style={{ height: 28 }}>
                            <label className="dsm-check">
                              <input
                                type="checkbox"
                                checked={b.showBand}
                                onChange={(e) => updateBand(i, { showBand: e.target.checked })}
                              />
                              Lower Band
                            </label>
                            <input
                              type="color" className="dsm-color-input" style={{ width: 36, height: 28 }}
                              value={b.dnColor} onChange={(e) => updateBand(i, { dnColor: e.target.value })}
                            />
                          </div>

                          <div className="dsm-row" style={{ height: 28 }}>
                            <label className="dsm-check">
                              <input
                                type="checkbox"
                                checked={b.showFill}
                                onChange={(e) => updateBand(i, { showFill: e.target.checked })}
                              />
                              Background
                            </label>
                            <input
                              type="color" className="dsm-color-input" style={{ width: 36, height: 28 }}
                              value={b.fillColor.length === 7 ? b.fillColor : '#4caf50'}
                              onChange={(e) => updateBand(i, { fillColor: e.target.value })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Volume Profile options (TradingView parity) */}
            {VP_TOOLS.has(d.type) && (
              <>
                <div className="dsm-row">
                  <label className="dsm-label">Volume</label>
                  <div className="dsm-btns">
                    {([['updown', 'Up/Down'], ['total', 'Total'], ['delta', 'Delta']] as const).map(([m, lbl]) => (
                      <button
                        key={m}
                        className={`dsm-btn ${(s.vpMode ?? 'updown') === m ? 'active' : ''}`}
                        onClick={() => patchStyle({ vpMode: m })}
                      >{lbl}</button>
                    ))}
                  </div>
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Rows</label>
                  <input
                    type="number" min="6" max="100" step="1"
                    className="dsm-number"
                    value={s.vpRows ?? 24}
                    onChange={(e) => patchStyle({ vpRows: parseInt(e.target.value) || 24 })}
                  />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Width %</label>
                  <input
                    type="range" min="5" max="90" step="1"
                    className="dsm-range"
                    value={s.vpWidth ?? 30}
                    onChange={(e) => patchStyle({ vpWidth: parseInt(e.target.value) })}
                  />
                  <span className="dsm-range-val">{s.vpWidth ?? 30}%</span>
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Placement</label>
                  <div className="dsm-btns">
                    {(['left', 'right'] as const).map((p) => (
                      <button
                        key={p}
                        className={`dsm-btn ${(s.vpPlacement ?? 'left') === p ? 'active' : ''}`}
                        onClick={() => patchStyle({ vpPlacement: p })}
                      >{p[0].toUpperCase() + p.slice(1)}</button>
                    ))}
                  </div>
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Value area %</label>
                  <input
                    type="number" min="0" max="100" step="1"
                    className="dsm-number"
                    value={s.vpValueArea ?? 70}
                    onChange={(e) => patchStyle({ vpValueArea: parseInt(e.target.value) || 70 })}
                  />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Up color</label>
                  <input type="color" className="dsm-color-input"
                    value={(s.vpUpColorVA || '#26a69a').slice(0, 7)}
                    onChange={(e) => patchStyle({ vpUpColorVA: e.target.value, vpUpColor: e.target.value })} />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Down color</label>
                  <input type="color" className="dsm-color-input"
                    value={(s.vpDownColorVA || '#ef5350').slice(0, 7)}
                    onChange={(e) => patchStyle({ vpDownColorVA: e.target.value, vpDownColor: e.target.value })} />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">POC</label>
                  <label className="dsm-check">
                    <input type="checkbox" checked={s.vpShowPOC !== false}
                      onChange={(e) => patchStyle({ vpShowPOC: e.target.checked })} />
                    Show
                  </label>
                  <input type="color" className="dsm-color-input"
                    value={(s.vpPocColor || '#ff9800').slice(0, 7)}
                    onChange={(e) => patchStyle({ vpPocColor: e.target.value })} />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Value area</label>
                  <label className="dsm-check">
                    <input type="checkbox" checked={s.vpShowVA !== false}
                      onChange={(e) => patchStyle({ vpShowVA: e.target.checked })} />
                    Show VAH/VAL
                  </label>
                </div>
              </>
            )}

            {/* Long/Short position sizing (TradingView parity) */}
            {(d.type === 'longpos' || d.type === 'shortpos') && (
              <>
                <div className="dsm-row">
                  <label className="dsm-label">Account size</label>
                  <input
                    type="number" min="0" step="1000"
                    className="dsm-number"
                    value={s.posAccountSize ?? 100000}
                    onChange={(e) => patchStyle({ posAccountSize: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Risk</label>
                  <input
                    type="number" min="0" step="0.1"
                    className="dsm-number"
                    value={s.posRisk ?? 1}
                    onChange={(e) => patchStyle({ posRisk: parseFloat(e.target.value) || 0 })}
                  />
                  <div className="dsm-btns">
                    {(['percent', 'amount'] as const).map((m) => (
                      <button
                        key={m}
                        className={`dsm-btn ${(s.posRiskMode ?? 'percent') === m ? 'active' : ''}`}
                        onClick={() => patchStyle({ posRiskMode: m })}
                      >{m === 'percent' ? '%' : '₹'}</button>
                    ))}
                  </div>
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Qty (manual)</label>
                  <input
                    type="number" min="0" step="1"
                    className="dsm-number"
                    placeholder="auto"
                    value={s.posQty ?? ''}
                    onChange={(e) => patchStyle({ posQty: parseInt(e.target.value) || undefined })}
                  />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Lot size</label>
                  <input
                    type="number" min="1" step="1"
                    className="dsm-number"
                    value={s.posLotSize ?? 1}
                    onChange={(e) => patchStyle({ posLotSize: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="dsm-row">
                  <label className="dsm-label">Tick size</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    className="dsm-number"
                    value={s.posTick ?? 0.05}
                    onChange={(e) => patchStyle({ posTick: parseFloat(e.target.value) || 0.05 })}
                  />
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

            {/* ── Fibonacci Retracement settings (TradingView parity) ── */}
            {(d.type === 'fib' || d.type === 'fibext') && (() => {
              const fibLevels: FibLevelConfig[] = s.fibLevels ?? DEFAULT_FIB_LEVELS.map((l) => ({ ...l }));
              const updateFibLevel = (idx: number, patch: Partial<FibLevelConfig>) => {
                const next = fibLevels.map((l, i) => (i === idx ? { ...l, ...patch } : l));
                patchStyle({ fibLevels: next });
              };
              // Split levels into two columns (left and right)
              const half = Math.ceil(fibLevels.length / 2);
              const leftCol = fibLevels.slice(0, half);
              const rightCol = fibLevels.slice(half);
              return (
                <>
                  {/* Extend */}
                  <div className="dsm-row">
                    <label className="dsm-label">Extend</label>
                    <select
                      className="dsm-select"
                      value={s.fibExtend ?? 'none'}
                      onChange={(e) => patchStyle({ fibExtend: e.target.value as DStyle['fibExtend'] })}
                    >
                      <option value="none">Don't extend</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="both">Both</option>
                    </select>
                  </div>

                  {/* Fib levels grid — two columns */}
                  <div className="dsm-fib-grid">
                    <div className="dsm-fib-col">
                      {leftCol.map((lc, i) => (
                        <div key={i} className="dsm-fib-level-row">
                          <input
                            type="checkbox"
                            checked={lc.enabled}
                            onChange={(e) => updateFibLevel(i, { enabled: e.target.checked })}
                          />
                          <input
                            type="number"
                            className="dsm-fib-value"
                            step="0.001"
                            value={lc.level}
                            onChange={(e) => updateFibLevel(i, { level: parseFloat(e.target.value) || lc.level })}
                          />
                          <input
                            type="color"
                            className="dsm-fib-color"
                            value={lc.color}
                            onChange={(e) => updateFibLevel(i, { color: e.target.value })}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="dsm-fib-col">
                      {rightCol.map((lc, ri) => {
                        const idx = half + ri;
                        return (
                          <div key={idx} className="dsm-fib-level-row">
                            <input
                              type="checkbox"
                              checked={lc.enabled}
                              onChange={(e) => updateFibLevel(idx, { enabled: e.target.checked })}
                            />
                            <input
                              type="number"
                              className="dsm-fib-value"
                              step="0.001"
                              value={lc.level}
                              onChange={(e) => updateFibLevel(idx, { level: parseFloat(e.target.value) || lc.level })}
                            />
                            <input
                              type="color"
                              className="dsm-fib-color"
                              value={lc.color}
                              onChange={(e) => updateFibLevel(idx, { color: e.target.value })}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Toggle options */}
                  <div className="dsm-fib-toggles">
                    <label className="dsm-check">
                      <input type="checkbox" checked={s.fibShowBackground !== false} onChange={(e) => patchStyle({ fibShowBackground: e.target.checked })} />
                      Background
                    </label>
                    <label className="dsm-check">
                      <input type="checkbox" checked={!!s.fibReverse} onChange={(e) => patchStyle({ fibReverse: e.target.checked })} />
                      Reverse
                    </label>
                    <label className="dsm-check">
                      <input type="checkbox" checked={s.fibShowPrices !== false} onChange={(e) => patchStyle({ fibShowPrices: e.target.checked })} />
                      Prices
                    </label>
                    <label className="dsm-check">
                      <input type="checkbox" checked={s.fibShowLevels !== false} onChange={(e) => patchStyle({ fibShowLevels: e.target.checked })} />
                      Levels
                    </label>
                  </div>

                  {/* Labels position */}
                  <div className="dsm-row">
                    <label className="dsm-label">Labels</label>
                    <select className="dsm-select" value={s.fibLabelPosition ?? 'left'} onChange={(e) => patchStyle({ fibLabelPosition: e.target.value as DStyle['fibLabelPosition'] })}>
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                    <select className="dsm-select" value={s.fibLabelAlign ?? 'top'} onChange={(e) => patchStyle({ fibLabelAlign: e.target.value as DStyle['fibLabelAlign'] })}>
                      <option value="top">Top</option>
                      <option value="middle">Middle</option>
                      <option value="bottom">Bottom</option>
                    </select>
                  </div>

                  {/* Font size */}
                  <div className="dsm-row">
                    <label className="dsm-label">Font size</label>
                    <select className="dsm-select" value={s.fibFontSize ?? 11} onChange={(e) => patchStyle({ fibFontSize: parseInt(e.target.value) })}>
                      {[8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24].map((sz) => (
                        <option key={sz} value={sz}>{sz}</option>
                      ))}
                    </select>
                  </div>
                </>
              );
            })()}

          </div>
        )}

        {/* ── Text tab ── */}
        {tab === 'text' && (
          <div className="dsm-body">
            {/* Name (shown in the object tree) */}
            <div className="dsm-row">
              <label className="dsm-label">Name</label>
              <input
                type="text"
                className="dsm-text-input"
                placeholder={toolLabel(d.type)}
                value={d.name ?? ''}
                onChange={(e) => updateDrawing(d.id, { name: e.target.value || undefined })}
              />
            </div>

            {/* Text label drawn on the chart */}
            <div className="dsm-row" style={{ alignItems: 'flex-start' }}>
              <label className="dsm-label">Text</label>
              <textarea
                className="dsm-textarea"
                rows={3}
                placeholder="Add a label to this drawing…"
                value={d.text ?? ''}
                onChange={(e) => updateDrawing(d.id, { text: e.target.value || undefined })}
              />
            </div>

            {/* Font size */}
            <div className="dsm-row">
              <label className="dsm-label">Font size</label>
              <input
                type="number" min="8" max="72" step="1"
                className="dsm-number"
                value={s.fontSize ?? 14}
                onChange={(e) => patchStyle({ fontSize: parseInt(e.target.value) || 14 })}
              />
            </div>

            {/* Text color */}
            <div className="dsm-row">
              <label className="dsm-label">Text color</label>
              <div className="dsm-colors">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`dsm-swatch ${s.textColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => patchStyle({ textColor: c })}
                    title={c}
                  />
                ))}
                <input
                  type="color"
                  className="dsm-color-input"
                  value={s.textColor?.startsWith('#') && s.textColor.length === 7 ? s.textColor : '#d1d4dc'}
                  onChange={(e) => patchStyle({ textColor: e.target.value })}
                  title="Custom color"
                />
              </div>
            </div>
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
                      value={Number(p.price.toFixed(2))}
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
