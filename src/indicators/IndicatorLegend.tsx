import { useState } from 'react';
import { Icon } from '../icons/Icon';
import { useIndicatorStore } from '../state/indicatorStore';
import { getIndicator } from './registry';
import './IndicatorLegend.css';

export function IndicatorLegend() {
  const { instances, remove, updateInputs } = useIndicatorStore();
  const [editing, setEditing] = useState<string | null>(null);

  if (instances.length === 0) return null;

  return (
    <div className="ind-legend">
      {instances.map((inst) => {
        const def = getIndicator(inst.defId);
        if (!def) return null;
        const params = def.inputs.map((i) => inst.inputs[i.key]).join(' ');
        return (
          <div className="il-row" key={inst.instId}>
            <span className="il-name">{def.short}{params && ` ${params}`}</span>
            <div className="il-actions">
              <button className="il-btn" title="Settings" onClick={() => setEditing(editing === inst.instId ? null : inst.instId)}><Icon name="settings" size={14} /></button>
              <button className="il-btn" title="Remove" onClick={() => remove(inst.instId)}><Icon name="close" size={14} /></button>
            </div>
            {editing === inst.instId && def.inputs.length > 0 && (
              <div className="il-editor" onMouseDown={(e) => e.stopPropagation()}>
                {def.inputs.map((inp) => (
                  <label key={inp.key} className="il-field">
                    <span>{inp.label}</span>
                    <input
                      type="number"
                      value={inst.inputs[inp.key]}
                      min={inp.min}
                      max={inp.max}
                      onChange={(e) => updateInputs(inst.instId, { [inp.key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
