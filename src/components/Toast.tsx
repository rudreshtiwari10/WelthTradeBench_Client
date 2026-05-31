import { useEffect } from 'react';
import { Icon } from '../icons/Icon';
import { useToastStore } from '../state/toastStore';
import './Toast.css';

export function ToastHost() {
  const { toasts, remove } = useToastStore();
  return (
    <div className="toast-host">
      {toasts.map((t) => <ToastItem key={t.id} id={t.id} text={t.text} kind={t.kind} onClose={() => remove(t.id)} />)}
    </div>
  );
}

function ToastItem({ id, text, kind, onClose }: { id: string; text: string; kind: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [id, onClose]);
  return (
    <div className={`toast ${kind}`}>
      <Icon name={kind === 'alert' ? 'alert' : 'indicators'} size={18} />
      <span className="toast-text">{text}</span>
      <button className="toast-close" onClick={onClose}><Icon name="close" size={14} /></button>
    </div>
  );
}
