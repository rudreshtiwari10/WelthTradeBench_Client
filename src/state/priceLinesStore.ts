/**
 * Price Lines Store — tracks entry, SL, and TP lines for open positions.
 *
 * Two modes:
 *  • Option-premium mode (legacy OptionsTicket): SL = entry ± 20%, TP = entry ± 30%.
 *    Activated when `optType` is absent in addEntryWithSlTp data.
 *
 *  • Index-based mode (OptionsChainPanel): SL/TP are placed at INDEX price levels,
 *    not option-premium levels. Activated when `optType` is provided.
 *    CE BUY / PE SELL profit on index UP → TP above, SL below current index.
 *    PE BUY / CE SELL profit on index DOWN → TP below, SL above current index.
 *    `triggerAbove` encodes the correct cross-direction for each line so
 *    PositionLines doesn't have to re-derive it.
 */
import { create } from 'zustand';

export type LineType = 'entry' | 'sl' | 'tp' | 'exit';

/** Params needed to re-place a LIMIT exit order when the line is dragged. */
export interface ExitOrderReParams {
  broker: 'kite' | 'upstox';
  qty: number;
  transaction_type: 'BUY' | 'SELL';
  product: 'D' | 'I';
  segment: 'option' | 'future' | 'equity';
  underlying?: string;
  expiry?: string;
  strike?: number;
  option_type?: 'CE' | 'PE';
  tradingsymbol?: string;
  exchange?: string;
  instrument_key?: string;
}

export interface PositionLine {
  id: string;
  positionId: string;     // paper id or Upstox order_id
  symbol: string;         // option contract label
  underlying: string;     // index/stock symbol that drives the chart lines
  type: LineType;
  price: number;          // price on the chart (index price for index-mode)
  side: 'buy' | 'sell';
  qty: number;            // total option qty (lots × lotSize)
  lots?: number;          // lot count (optional for backward compat)
  entryPrice: number;     // reference price for % display on SL/TP label
  optionEntryPremium?: number; // option LTP at trade time (for P&L estimate)
  strike?: number;
  optType?: 'CE' | 'PE';
  expiryDate?: number;    // Unix ms — expiry of the option contract
  instrumentKey?: string; // Upstox key → used for live broker exit
  exitQty?: number;       // lots to exit on SL/TP trigger (defaults to lots)
  triggerAbove?: boolean; // true = fire when index crosses UP through price
  // LIMIT exit order tracking (for cancel-and-replace on drag)
  exitOrderId?: string;
  exitOrderReParams?: ExitOrderReParams;
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

  /** Create entry + default SL + default TP all at once. */
  addEntryWithSlTp: (data: Omit<PositionLine, 'id' | 'type'>) => void;

  /** Upsert SL for a position. */
  setSl: (positionId: string, price: number) => void;

  /** Upsert TP for a position. */
  setTp: (positionId: string, price: number) => void;

  /** Upsert a limit-exit line for a position (placed as LIMIT order on broker). */
  setExit: (positionId: string, price: number, orderId?: string, params?: ExitOrderReParams) => void;

  /** Update the broker order ID on an existing exit line (called after drag re-place). */
  updateExitOrder: (positionId: string, orderId: string) => void;

  /** Move an individual line to a new price (drag). */
  updatePrice: (id: string, price: number) => void;

  /** Update exit lots for a SL or TP line. */
  updateExitQty: (id: string, lots: number) => void;

  /** Delete a single line. */
  removeLine: (id: string) => void;

  /** Delete all lines belonging to a position. */
  removeByPosition: (positionId: string) => void;
}

export const usePriceLinesStore = create<PriceLinesState>((set, get) => ({
  lines: loadLines(),

  addEntryWithSlTp(data) {
    const { side, entryPrice, optType } = data;

    let slPrice: number, tpPrice: number;
    let slTriggerAbove: boolean, tpTriggerAbove: boolean;

    if (optType) {
      // Index-based mode: 1.5 % default offset in the appropriate direction.
      // CE BUY or PE SELL → profit when index goes UP → SL below, TP above.
      const profitOnUp = (optType === 'CE' && side === 'buy') || (optType === 'PE' && side === 'sell');
      slPrice      = parseFloat((entryPrice * (profitOnUp ? 0.985 : 1.015)).toFixed(2));
      tpPrice      = parseFloat((entryPrice * (profitOnUp ? 1.015 : 0.985)).toFixed(2));
      slTriggerAbove = !profitOnUp; // SL fires when price crosses INTO loss direction
      tpTriggerAbove =  profitOnUp; // TP fires when price crosses INTO profit direction
    } else {
      // Underlying-price mode for futures, equity, or legacy positions (1.5% offset).
      slPrice        = parseFloat((entryPrice * (side === 'buy' ? 0.985 : 1.015)).toFixed(2));
      tpPrice        = parseFloat((entryPrice * (side === 'buy' ? 1.015 : 0.985)).toFixed(2));
      slTriggerAbove = side !== 'buy';
      tpTriggerAbove = side === 'buy';
    }

    const newLines: PositionLine[] = [
      { ...data, id: uid(), type: 'entry' },
      { ...data, id: uid(), type: 'sl', price: slPrice, triggerAbove: slTriggerAbove },
      { ...data, id: uid(), type: 'tp', price: tpPrice, triggerAbove: tpTriggerAbove },
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
      const sl: PositionLine = { ...entry, id: uid(), type: 'sl', price };
      set(s => { const lines = [...s.lines, sl]; saveLines(lines); return { lines }; });
    }
  },

  setTp(positionId, price) {
    const existing = get().lines.find(l => l.positionId === positionId && l.type === 'tp');
    if (existing) {
      set(s => { const lines = s.lines.map(l => l.id === existing.id ? { ...l, price } : l); saveLines(lines); return { lines }; });
    } else {
      const entry = get().lines.find(l => l.positionId === positionId && l.type === 'entry');
      if (!entry) return;
      const tp: PositionLine = { ...entry, id: uid(), type: 'tp', price };
      set(s => { const lines = [...s.lines, tp]; saveLines(lines); return { lines }; });
    }
  },

  setExit(positionId, price, orderId?, params?) {
    const existing = get().lines.find(l => l.positionId === positionId && l.type === 'exit');
    if (existing) {
      set(s => {
        const lines = s.lines.map(l => l.id === existing.id
          ? { ...l, price, ...(orderId !== undefined ? { exitOrderId: orderId } : {}), ...(params ? { exitOrderReParams: params } : {}) }
          : l);
        saveLines(lines); return { lines };
      });
    } else {
      const entry = get().lines.find(l => l.positionId === positionId && l.type === 'entry');
      if (!entry) return;
      const exit: PositionLine = { ...entry, id: uid(), type: 'exit', price, exitOrderId: orderId, exitOrderReParams: params };
      set(s => { const lines = [...s.lines, exit]; saveLines(lines); return { lines }; });
    }
  },

  updateExitOrder(positionId, orderId) {
    set(s => {
      const lines = s.lines.map(l =>
        l.positionId === positionId && l.type === 'exit' ? { ...l, exitOrderId: orderId } : l
      );
      saveLines(lines); return { lines };
    });
  },

  updatePrice(id, price) {
    set(s => { const lines = s.lines.map(l => l.id === id ? { ...l, price } : l); saveLines(lines); return { lines }; });
  },

  updateExitQty(id, lots) {
    set(s => {
      const lines = s.lines.map(l => l.id === id ? { ...l, exitQty: Math.max(1, lots) } : l);
      saveLines(lines);
      return { lines };
    });
  },

  removeLine(id) {
    set(s => { const lines = s.lines.filter(l => l.id !== id); saveLines(lines); return { lines }; });
  },

  removeByPosition(positionId) {
    set(s => { const lines = s.lines.filter(l => l.positionId !== positionId); saveLines(lines); return { lines }; });
  },
}));
