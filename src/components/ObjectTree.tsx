import { Icon } from '../icons/Icon';
import { useDrawingStore } from '../state/drawingStore';
import { useIndicatorStore } from '../state/indicatorStore';
import { useUiStore } from '../state/uiStore';
import { toolLabel } from '../drawings/tools';
import { getIndicator } from '../indicators/registry';
import './ObjectTree.css';

export function ObjectTree() {
  const open = useUiStore((s) => s.objectTreeOpen);
  const toggle = useUiStore((s) => s.toggleObjectTree);
  const { drawings, selectedId, select, removeDrawing, updateDrawing, hidden } = useDrawingStore();
  const { instances, remove: removeInd } = useIndicatorStore();

  if (!open) return null;

  return (
    <div className="objtree">
      <div className="ot-head">
        <span>Objects tree</span>
        <button className="icon-btn sm" onClick={toggle}><Icon name="close" size={16} /></button>
      </div>
      <div className="ot-body">
        <div className="ot-cat">Indicators ({instances.length})</div>
        {instances.map((i) => {
          const def = getIndicator(i.defId);
          return (
            <div className="ot-row" key={i.instId}>
              <Icon name="indicators" size={15} />
              <span className="ot-name">{def?.short} {def?.inputs.map((x) => i.inputs[x.key]).join(' ')}</span>
              <button className="ot-btn" title="Remove" onClick={() => removeInd(i.instId)}><Icon name="trash" size={14} /></button>
            </div>
          );
        })}

        <div className="ot-cat">Drawings ({drawings.length})</div>
        {drawings.length === 0 && <div className="ot-empty">No drawings yet</div>}
        {drawings.map((d) => (
          <div className={`ot-row ${selectedId === d.id ? 'sel' : ''}`} key={d.id} onClick={() => select(d.id)}>
            <span className="ot-swatch" style={{ background: d.style.color }} />
            <span className="ot-name">{toolLabel(d.type)}</span>
            <button className="ot-btn" title={d.locked ? 'Unlock' : 'Lock'} onClick={(e) => { e.stopPropagation(); updateDrawing(d.id, { locked: !d.locked }); }}>
              <Icon name="lock" size={13} />
            </button>
            <button className="ot-btn" title="Remove" onClick={(e) => { e.stopPropagation(); removeDrawing(d.id); }}><Icon name="trash" size={13} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
