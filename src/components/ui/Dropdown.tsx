import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Dropdown.css';

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  width?: number;
}

/**
 * Click-to-open popover that renders its menu via a React portal at document.body
 * so it escapes any overflow:hidden ancestor (e.g. split-screen panel headers).
 * Position is calculated from the trigger's bounding rect and applied as
 * position:fixed, so the menu is always fully visible.
 */
export function Dropdown({ trigger, children, align = 'left', width }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; right: number }>({
    top: 0, left: 0, right: 0,
  });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef    = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);

  const calcPos = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left, right: window.innerWidth - r.right });
  };

  useEffect(() => {
    if (!open) return;
    calcPos();

    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown',   onKey);
    window.addEventListener('resize',      calcPos);
    window.addEventListener('scroll',      calcPos, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown',   onKey);
      window.removeEventListener('resize',      calcPos);
      window.removeEventListener('scroll',      calcPos, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="dropdown" ref={triggerRef}>
      {trigger({ open, toggle: () => { calcPos(); setOpen((v) => !v); } })}
      {open && createPortal(
        <div
          ref={menuRef}
          className="dropdown-menu"
          style={{
            position: 'fixed',
            top:      pos.top,
            ...(align === 'right' ? { right: pos.right } : { left: pos.left }),
            ...(width ? { width } : {}),
            zIndex: 9999,
          }}
        >
          {children(close)}
        </div>,
        document.body,
      )}
    </div>
  );
}
