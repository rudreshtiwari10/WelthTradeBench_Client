import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { TOOL_GROUPS, groupTools, type ToolDef, type ToolGroup } from '../drawings/tools';
import { useDrawingStoreRaw, useActiveDrawingKey, type Tool, type FavDef } from '../state/drawingStore';
import { useUiStore } from '../state/uiStore';
import './LeftToolbar.css';

export function LeftToolbar() {
  // App-level toolbar (not rendered inside any panel), so it reads/writes the
  // raw store directly against the ACTIVE panel's key rather than a fixed
  // default — tool selection itself stays global across all panels.
  const {
    activeTool, setTool, magnet, stayInDrawing, locked, hidden,
    toggleMagnet, toggleStay, toggleLocked, toggleHidden,
    favorites, toggleFavorite, isFavorite, setFavorites,
  } = useDrawingStoreRaw();
  const activeKey = useActiveDrawingKey();
  const clearAll = () => useDrawingStoreRaw.getState().clearAll(activeKey);
  const { objectTreeOpen, toggleObjectTree, showFavoritesToolbar, toggleFavoritesToolbar } = useUiStore();
  const [collapsed, setCollapsed] = useState(false);
  const [flyout, setFlyout] = useState<string | null>(null);
  const [picked, setPicked] = useState<Record<string, IconName>>({});

  // drag-to-reorder favorites
  const dragFavIdx = useRef<number | null>(null);

  if (collapsed) {
    return (
      <div className="leftbar collapsed">
        <button className="icon-btn" title="Show drawing toolbar" onClick={() => setCollapsed(false)}>
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    );
  }

  const groupIcon   = (g: ToolGroup): IconName => picked[g.id] || g.icon;
  const groupActive = (g: ToolGroup) => groupTools(g).some((t) => t.tool === activeTool);

  const choose = (g: ToolGroup, def: ToolDef) => {
    setTool(def.tool, def.text ?? null);
    setPicked((p) => ({ ...p, [g.id]: def.icon }));
    setFlyout(null);
  };

  const chooseFav = (fav: FavDef) => {
    setTool(fav.tool, fav.text ?? null);
    setFlyout(null);
  };

  // Drag-to-reorder: swap favorites array positions using store
  const reorderFavs = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const next = [...favorites];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    // Write back through store via a bulk-replace helper
    setFavorites(next);
  };

  return (
    <aside className="leftbar">
      {/* ── Tool groups (cursor → emoji) ── */}
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
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        ))}
      </div>



      <div className="leftbar-spacer" />

      {/* ── Bottom utility buttons ── */}
      <div className="leftbar-group">
        <button className={`icon-btn ${magnet ? 'active' : ''}`} title="Magnet mode (snap to OHLC)" onClick={toggleMagnet}><Icon name="magnet" size={20} /></button>
        <button className={`icon-btn ${stayInDrawing ? 'active' : ''}`} title="Stay in drawing mode" onClick={toggleStay}><Icon name="ray" size={20} /></button>
        <button className={`icon-btn ${locked ? 'active' : ''}`} title="Lock all drawings" onClick={toggleLocked}><Icon name="lock" size={18} /></button>
        <button className={`icon-btn ${hidden ? 'active' : ''}`} title={hidden ? 'Show all drawings' : 'Hide all drawings'} onClick={toggleHidden}><Icon name={hidden ? 'eyeOff' : 'eye'} size={18} /></button>
        <button className={`icon-btn ${objectTreeOpen ? 'active' : ''}`} title="Object tree" onClick={toggleObjectTree}><Icon name="layout" size={18} /></button>
        <button className={`icon-btn ${showFavoritesToolbar ? 'active' : ''}`} title={showFavoritesToolbar ? 'Hide Favorites Toolbar' : 'Show Favorites Toolbar'} onClick={toggleFavoritesToolbar}><Icon name="star" size={18} /></button>
        <button className="icon-btn" title="Remove all drawings" onClick={() => { if (confirm('Remove all drawings?')) clearAll(); }}><Icon name="trash" size={18} /></button>
        <button className="icon-btn" title="Collapse toolbar" onClick={() => setCollapsed(true)}><Icon name="chevronLeft" size={18} /></button>
      </div>
    </aside>
  );
}

// ── ToolGroupButton ────────────────────────────────────────────────────────

function ToolGroupButton({
  group, icon, active, open, onToggle, onPick, onClose, activeTool, isFavorite, onToggleFavorite,
}: {
  group: ToolGroup; icon: IconName; active: boolean; open: boolean;
  onToggle: () => void; onPick: (def: ToolDef) => void; onClose: () => void; activeTool: Tool;
  isFavorite: (label: string) => boolean;
  onToggleFavorite: (def: FavDef) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);

  const tools   = groupTools(group);
  const single  = tools.length === 1;
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
                    <button
                      key={i}
                      className={`emoji-cell ${isFavorite(t.label) ? 'fav' : ''}`}
                      title={`${t.label}${isFavorite(t.label) ? ' · Right-click to unfavourite' : ' · Right-click to favourite'}`}
                      onClick={() => onPick(t)}
                      onContextMenu={(e) => { e.preventDefault(); onToggleFavorite({ label: t.label, tool: t.tool, icon: t.icon, text: t.text }); }}
                    >{t.text}</button>
                  ))}
                </div>
              ) : (
                sec.tools.map((t, i) => (
                  <button
                    key={i}
                    className={`flyout-item ${activeTool === t.tool ? 'active' : ''}`}
                    onClick={() => onPick(t)}
                  >
                    <span className="fi-icon"><Icon name={t.icon} size={18} /></span>
                    <span className="fi-label">{t.label}</span>
                    {t.shortcut && <span className="fi-shortcut">{t.shortcut}</span>}
                    <button
                      className={`fi-star ${isFavorite(t.label) ? 'on' : ''}`}
                      title={isFavorite(t.label) ? 'Remove from favourites' : 'Add to favourites'}
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite({ label: t.label, tool: t.tool, icon: t.icon, text: t.text }); }}
                    >★</button>
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
