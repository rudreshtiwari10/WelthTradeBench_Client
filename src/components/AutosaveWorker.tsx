import { useEffect } from 'react';
import { useAutosaveStore } from '../state/autosaveStore';
import { useLayoutStore } from '../state/layoutStore';

/** Renderless component — mounts once in App and drives the autosave timer. */
export function AutosaveWorker() {
  const enabled     = useAutosaveStore((s) => s.enabled);
  const intervalMin = useAutosaveStore((s) => s.intervalMin);

  useEffect(() => {
    if (!enabled) return;

    const id = setInterval(() => {
      const as = useAutosaveStore.getState();
      as.markSaving();
      useLayoutStore.getState().saveCurrent();
      as.markSaved();
      // Fade the "Autosaved" badge out after 5 s
      setTimeout(() => useAutosaveStore.getState().resetStatus(), 5000);
    }, intervalMin * 60 * 1000);

    return () => clearInterval(id);
  }, [enabled, intervalMin]);

  return null;
}
