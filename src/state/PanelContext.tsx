import { createContext, useContext } from 'react';

const PanelContext = createContext<string>('p1');

export const PanelProvider = PanelContext.Provider;

/** Returns the panelId of the nearest PanelProvider ancestor. */
export function usePanelId(): string {
  return useContext(PanelContext);
}
