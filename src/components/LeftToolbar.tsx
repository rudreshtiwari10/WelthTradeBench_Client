import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { TOOL_GROUPS, groupTools, type ToolDef, type ToolGroup } from '../drawings/tools';
import { useDrawingStore, type Tool } from '../state/drawingStore';
import { useUiStore } from '../state/uiStore';
import './LeftToolbar.css';

export function LeftToolbar() {
  const { activeTool, setTool, magnet, stayInDrawing, locked, hidden, toggleMagnet, toggleStay, toggleLocked, toggleHidden, clearAll } = useDrawingStore();
  const { objectTreeOpen, toggleObjectTree } = useUiStore();
  const [collapsed, setCollapsed] = useState(false);
  const [flyout, setFlyout] = useState<string | null>(null);
  // Remember the last-picked tool per group so the rail shows its icon.
  const [picked, setPicked] = useState<Record<string, IconName>>({});

  if (collapsed) {
    return (
      <div className="leftbar collapsed">
        <button className="icon-btn" title="Show drawing toolbar" onClick={() => setCollapsed(false)}>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    );
  }

  const groupIcon = (g: ToolGroup): IconName => picked[g.id] || g.icon;
  const groupActive = (g: ToolGroup) => groupTools(g).some((t) => t.tool === activeTool);

  const choose = (g: ToolGroup, def: ToolDef) => {
    setTool(def.tool, def.text ?? null);
    setPicked((p) => ({ ...p, [g.id]: def.icon }));
    setFlyout(null);
  };

  return (
    <aside className="leftbar">
      <div className="leftbar-group">
        {TOOL_GROUPS.map((g) => (
          <ToolGroupButton
            key={g.id}
            group={g}
            icon={groupIcon(g)}
            active={groupActive(g)}
            open={flyout === g.id}
            onToggle={() => setFlyout((f) => (f === g.id ? null : g.id))}
            onPick={(def) => choose(g, def)}
            onClose={() => setFlyout(null)}
            activeTool={activeTool}
          />
        ))}
      </div>

      <div className="leftbar-spacer" />

      <div className="leftbar-group">
        <button className={`icon-btn ${magnet ? 'active' : ''}`} title="Magnet mode" onClick={toggleMagnet}><Icon name="magnet" size={20} /></button>
        <button className={`icon-btn ${stayInDrawing ? 'active' : ''}`} title="Stay in drawing mode" onClick={toggleStay}><Icon name="ray" size={20} /></button>
        <button className={`icon-btn ${locked ? 'active' : ''}`} title="Lock all drawing tools" onClick={toggleLocked}><Icon name="lock" size={18} /></button>
        <button className={`icon-btn ${hidden ? 'active' : ''}`} title={hidden ? 'Show all drawings' : 'Hide all drawings'} onClick={toggleHidden}><Icon name={hidden ? 'eyeOff' : 'eye'} size={18} /></button>
        <button className={`icon-btn ${objectTreeOpen ? 'active' : ''}`} title="Show objects tree" onClick={toggleObjectTree}><Icon name="layout" size={18} /></button>
        <button className="icon-btn" title="Remove all drawings" onClick={() => { if (confirm('Remove all drawings?')) clearAll(); }}><Icon name="trash" size={18} /></button>
        <button className="icon-btn" title="Hide drawing toolbar" onClick={() => setCollapsed(true)}><Icon name="chevronLeft" size={18} /></button>
      </div>
    </aside>
  );
}

function ToolGroupButton({
  group, icon, active, open, onToggle, onPick, onClose, activeTool,
}: {
  group: ToolGroup; icon: IconName; active: boolean; open: boolean;
  onToggle: () => void; onPick: (def: ToolDef) => void; onClose: () => void; activeTool: Tool;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);

  const tools = groupTools(group);
  const single = tools.length === 1;
  const isEmoji = group.id === 'emoji';

  return (
    <div className="tool-group" ref={ref}>
      <button
        className={`tool-btn icon-btn ${active ? 'active' : ''}`}
        title={group.title}
        onClick={() => (single ? onPick(tools[0]) : onToggle())}
      >
        <Icon name={icon} size={20} />
        {!single && <span className="flyout-caret" onClick={(e) => { e.stopPropagation(); onToggle(); }} />}
      </button>

      {open && !single && (
        <div className={`tool-flyout ${isEmoji ? 'emoji-flyout' : ''}`}>
          {group.sections.map((sec, si) => (
            <div key={si}>
              {sec.title && <div className="flyout-section-title">{sec.title}</div>}
              {isEmoji ? (
                <div className="emoji-grid">
                  {sec.tools.map((t, i) => (
                    <button key={i} className="emoji-cell" title={`Place ${t.label}`} onClick={() => onPick(t)}>{t.text}</button>
                  ))}
                </div>
              ) : (
                sec.tools.map((t, i) => (
                  <button key={i} className={`flyout-item ${activeTool === t.tool ? 'active' : ''}`} onClick={() => onPick(t)}>
                    <span className="fi-icon"><Icon name={t.icon} size={18} /></span>
                    <span className="fi-label">{t.label}</span>
                    {t.shortcut && <span className="fi-shortcut">{t.shortcut}</span>}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
