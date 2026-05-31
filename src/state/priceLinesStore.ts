/**
 * Price Lines Store — tracks entry, SL, and TP lines for open positions.
 *
 * When an order is placed (paper or live) the OptionsTicket calls
 * `addEntryWithSlTp()` which creates three lines at once.  The defaults are:
 *   SL = entry ± 20%   TP = entry ± 30%
 * The user drags the handles in the chart to adjust them.
 *
 * When the live spot crosses an SL or TP line the `PositionLines` component
 * fires the close-order (broker API for live, positionsStore.remove for paper).
 *
 * Lines are persisted to localStorage so they survive page refreshes.
 */
import { create } from 'zustand';

export type LineType = 'entry' | 'sl' | 'tp';

export interface PositionLine {
  id: string;
  positionId: string;     // paper id (positionsStore) or Upstox order_id
  symbol: string;         // option contract label, e.g. "NIFTY 28AUG 24000 CE"
  underlying: string;     // e.g. "NIFTY" — must match chart symbol
  type: LineType;
  price: number;
  side: 'buy' | 'sell';
  qty: number;
  entryPrice: number;     // reference for % P&L on SL/TP label
  instrumentKey?: string; // set for live orders → used for broker close
}

// ─── Persistence ──────────────────────────────────────────────────────────
const STORE_KEY = 'welthwest:priceLines';
const loadLines = (): PositionLine[] => {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; }
};
const saveLines = (lines: PositionLine[]) => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(lines)); } catch { /* */ }
};

let seq = 1;
const uid = () => `pl${seq++}_${Date.now()}`;

// ─── State ────────────────────────────────────────────────────────────────
interface PriceLinesState {
  lines: PositionLine[];

  /**
   * Create entry + default SL + default TP all at once.
   * SL/TP defaults are 20 % / 30 % from the entry price.
   */
  addEntryWithSlTp: (data: Omit<PositionLine, 'id' | 'type'>) => void;

  /** Upsert SL for a position (updates if exists, creates if not). */
  setSl: (positionId: string, price: number) => void;

  /** Upsert TP for a position (updates if exists, creates if not). */
  setTp: (positionId: string, price: number) => void;

  /** Move an individual line to a new price (drag). */
  updatePrice: (id: string, price: number) => void;

  /** Delete a single line. */
  removeLine: (id: string) => void;

  /** Delete all lines belonging to a position (entry + sl + tp). */
  removeByPosition: (positionId: string) => void;
}

export const usePriceLinesStore = create<PriceLinesState>((set, get) => ({
  lines: loadLines(),

  addEntryWithSlTp(data) {
    // Default SL: 20 % behind entry.  TP: 30 % ahead.
    const { side, entryPrice } = data;
    const slPrice = parseFloat((entryPrice * (side === 'buy' ? 0.80 : 1.20)).toFixed(2));
    const tpPrice = parseFloat((entryPrice * (side === 'buy' ? 1.30 : 0.70)).toFixed(2));

    const newLines: PositionLine[] = [
      { ...data, id: uid(), type: 'entry' },
      { ...data, id: uid(), type: 'sl',    price: slPrice },
      { ...data, id: uid(), type: 'tp',    price: tpPrice },
    ];
    set((s) => { const lines = [...s.lines, ...newLines]; saveLines(lines); return { lines }; });
  },

  setSl(positionId, price) {
    const existing = get().lines.find(l => l.positionId === positionId && l.type === 'sl');
    if (existing) {
      set(s => { const lines = s.lines.map(l => l.id === existing.id ? { ...l, price } : l); saveLines(lines); return { lines }; });
    } else {
      const entry = get().lines.find(l => l.positionId === positionId && l.type === 'entry');
      if (!entry) return;
      const newLine: PositionLine = { ...entry, id: uid(), type: 'sl', price };
      set(s => { const lines = [...s.lines, newLine]; saveLines(lines); return { lines }; });
    }
  },

  setTp(positionId, price) {
    const existing = get().lines.find(l => l.positionId === positionId && l.type === 'tp');
    if (existing) {
      set(s => { const lines = s.lines.map(l => l.id === existing.id ? { ...l, price } : l); saveLines(lines); return { lines }; });
    } else {
      const entry = get().lines.find(l => l.positionId === positionId && l.type === 'entry');
      if (!entry) return;
      const newLine: PositionLine = { ...entry, id: uid(), type: 'tp', price };
      set(s => { const lines = [...s.lines, newLine]; saveLines(lines); return { lines }; });
    }
  },

  updatePrice(id, price) {
    set(s => { const lines = s.lines.map(l => l.id === id ? { ...l, price } : l); saveLines(lines); return { lines }; });
  },

  removeLine(id) {
    set(s => { const lines = s.lines.filter(l => l.id !== id); saveLines(lines); return { lines }; });
  },

  removeByPosition(positionId) {
    set(s => { const lines = s.lines.filter(l => l.positionId !== positionId); saveLines(lines); return { lines }; });
  },
}));
