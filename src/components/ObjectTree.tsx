import { useState } from 'react';
import { Icon } from '../icons/Icon';
import { useDrawingStore } from '../state/drawingStore';
import { useIndicatorStore } from '../state/indicatorStore';
import { useUiStore } from '../state/uiStore';
import { toolLabel } from '../drawings/tools';
import { getIndicator } from '../indicators/registry';
import './ObjectTree.css';

export function ObjectTree() {
  const open   = useUiStore((s) => s.objectTreeOpen);
  const toggle = useUiStore((s) => s.toggleObjectTree);

  const {
    drawings, selectedId, select, removeDrawing, updateDrawing,
    toggleHideDrawing, renameDrawing, bringToFront, sendToBack, duplicateDrawing,
  } = useDrawingStore();
  const { instances, remove: removeInd } = useIndicatorStore();

  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');

  if (!open) return null;

  const q = search.trim().toLowerCase();

  const filtered = drawings.filter((d) => {
    if (!q) return true;
    const label = (d.name || toolLabel(d.type)).toLowerCase();
    return label.includes(q) || d.type.includes(q);
  });

  const startEdit = (id: string, current: string) => {
    setEditId(id);
    setEditVal(current);
  };
  const commitEdit = (id: string) => {
    const v = editVal.trim();
    if (v) renameDrawing(id, v);
    setEditId(null);
  };

  return (
    <div className="objtree">
      <div className="ot-head">
        <span>Objects tree</span>
        <button className="icon-btn sm" title="Close" onClick={toggle}><Icon name="close" size={16} /></button>
      </div>

      {/* Search */}
      <div className="ot-search">
        <Icon name="search" size={14} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search drawings…"
          className="ot-search-input"
        />
        {search && (
          <button className="ot-search-clear" onClick={() => setSearch('')}>×</button>
        )}
      </div>

      <div className="ot-body">
        {/* Indicators */}
        {!q && (
          <>
            <div className="ot-cat">Indicators ({instances.length})</div>
            {instances.map((i) => {
              const def = getIndicator(i.defId);
              return (
                <div className="ot-row" key={i.instId}>
                  <Icon name="indicators" size={15} />
                  <span className="ot-name">{def?.short} {def?.inputs.map((x) => i.inputs[x.key]).join(' ')}</span>
                  <button className="ot-btn" title="Remove indicator" onClick={() => removeInd(i.instId)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              );
            })}
          </>
        )}

        {/* Drawings */}
        <div className="ot-cat">
          Drawings ({filtered.length}{q ? ` of ${drawings.length}` : ''})
        </div>
        {filtered.length === 0 && (
          <div className="ot-empty">{q ? 'No match' : 'No drawings yet'}</div>
        )}
        {filtered.map((d) => {
          const label = d.name || toolLabel(d.type);
          const isSel = selectedId === d.id;
          return (
            <div
              key={d.id}
              className={`ot-row ${isSel ? 'sel' : ''} ${d.hidden ? 'ot-hidden' : ''}`}
              onClick={() => select(d.id)}
            >
              {/* Color swatch */}
              <span className="ot-swatch" style={{ background: d.style.color }} />

              {/* Name — click to rename */}
              {editId === d.id ? (
                <input
                  className="ot-rename"
                  value={editVal}
                  autoFocus
                  onChange={(e) => setEditVal(e.target.value)}
                  onBlur={() => commitEdit(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(d.id);
                    if (e.key === 'Escape') setEditId(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="ot-name"
                  onDoubleClick={(e) => { e.stopPropagation(); startEdit(d.id, label); }}
                  title="Double-click to rename"
                >{label}</span>
              )}

              {/* Lock indicator */}
              {d.locked && <span className="ot-lock-icon" title="Locked">🔒</span>}

              {/* Action buttons */}
              <div className="ot-actions" onClick={(e) => e.stopPropagation()}>
                {/* Hide / show */}
                <button
                  className={`ot-btn ${d.hidden ? 'ot-btn-active' : ''}`}
                  title={d.hidden ? 'Show' : 'Hide'}
                  onClick={() => toggleHideDrawing(d.id)}
                >
                  <Icon name={d.hidden ? 'eyeOff' : 'eye'} size={13} />
                </button>
                {/* Lock / unlock */}
                <button
                  className={`ot-btn ${d.locked ? 'ot-btn-active' : ''}`}
                  title={d.locked ? 'Unlock' : 'Lock'}
                  onClick={() => updateDrawing(d.id, { locked: !d.locked })}
                >
                  <Icon name="lock" size={13} />
                </button>
                {/* Bring to front */}
                <button className="ot-btn" title="Bring to front" onClick={() => bringToFront(d.id)}>↑</button>
                {/* Send to back */}
                <button className="ot-btn" title="Send to back" onClick={() => sendToBack(d.id)}>↓</button>
                {/* Duplicate */}
                <button className="ot-btn" title="Duplicate" onClick={() => duplicateDrawing(d.id)}>
                  <Icon name="plus" size={13} />
                </button>
                {/* Delete */}
                <button className="ot-btn ot-btn-danger" title="Delete" onClick={() => removeDrawing(d.id)}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
