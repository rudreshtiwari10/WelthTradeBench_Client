import { useState, useRef, useEffect } from 'react';
import { useDrawingStoreRaw, type FavDef } from '../state/drawingStore';
import { useUiStore } from '../state/uiStore';
import { Icon } from '../icons/Icon';
import './FavoritesToolbar.css';

export function FavoritesToolbar() {
  const { favorites, activeTool, setTool, toggleFavorite } = useDrawingStoreRaw();
  const { showFavoritesToolbar } = useUiStore();
  const [collapsed, setCollapsed] = useState(false);

  // Dragging state
  const [pos, setPos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('fav-toolbar-pos') || 'null') ?? { x: window.innerWidth / 2 - 100, y: window.innerHeight - 100 };
    } catch {
      return { x: window.innerWidth / 2 - 100, y: window.innerHeight - 100 };
    }
  });
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  useEffect(() => {
    // Basic clamping on window resize
    const clamp = () => {
      setPos((p: {x: number, y: number}) => ({
        x: Math.max(0, Math.min(p.x, window.innerWidth - 60)),
        y: Math.max(0, Math.min(p.y, window.innerHeight - 60)),
      }));
    };
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  if (!showFavoritesToolbar) return null;

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, initX: pos.x, initY: pos.y };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, initX, initY } = dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    setPos({ x: initX + dx, y: initY + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    dragRef.current = null;
    try { localStorage.setItem('fav-toolbar-pos', JSON.stringify(pos)); } catch { /* */ }
  };

  return (
    <div
      className={`fav-toolbar ${collapsed ? 'collapsed' : ''}`}
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={(e) => e.stopPropagation()} // prevent chart interaction
    >
      <span
        className="fav-handle"
        title="Drag favorites"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        ⠿
      </span>

      {!collapsed && (
        <>
          {favorites.length === 0 && (
            <span className="fav-empty-hint" style={{ padding: '0 8px', fontSize: '12px', color: '#787b86' }}>Star tools to add</span>
          )}
          {favorites.map((fav) => (
            <button
              key={fav.label}
              className={`fav-btn ${activeTool === fav.tool ? 'active' : ''}`}
              title={`${fav.label}\nRight-click to remove`}
              onClick={() => setTool(fav.tool, fav.text ?? null)}
              onContextMenu={(e) => { e.preventDefault(); toggleFavorite(fav); }}
            >
              {fav.text ? (
                <span className="fav-emoji">{fav.text}</span>
              ) : (
                <Icon name={fav.icon} size={20} />
              )}
            </button>
          ))}
          <div className="fav-sep" />
        </>
      )}

      <button
        className="fav-btn"
        title={collapsed ? 'Expand Favorites' : 'Collapse'}
        onClick={() => setCollapsed(!collapsed)}
      >
        <Icon name={collapsed ? 'star' : 'close'} size={18} />
      </button>
    </div>
  );
}
