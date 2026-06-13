// Drawing model. Points are stored in CHART-LOGICAL coordinates so drawings
// stay anchored to bars and follow pan/zoom:
//   logical = fractional bar index (lightweight-charts logical scale)
//   price   = value on the price scale
export interface DPoint {
  logical: number;
  price: number;
}

export type DrawingType =
  | 'trendline'
  | 'ray'
  | 'extended'
  | 'hline'
  | 'hray'
  | 'vline'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'fib'
  | 'fibext'
  | 'gannfan'
  | 'pitchfork'
  | 'pchannel'
  | 'brush'
  | 'polyline'
  | 'text'
  | 'callout'
  | 'flag'
  | 'pricelabel'
  | 'emoji'
  | 'longpos'
  | 'shortpos'
  | 'measure'
  | 'pricerange'
  // ── Elliott Wave dedicated types ─────────────────────────────────────
  | 'ew_impulse'    // 1-2-3-4-5  (6 points: 0→1→2→3→4→5)
  | 'ew_correction' // A-B-C      (4 points: 0→A→B→C)
  | 'ew_triangle'   // A-B-C-D-E  (6 points: 0→A→B→C→D→E)
  | 'ew_double'     // W-X-Y      (4 points: 0→W→X→Y)
  | 'ew_triple'     // W-X-Y-X-Z  (6 points: 0→W→X→Y→X2→Z)
  | 'xabcd';        // X-A-B-C-D  (5 points)

export interface DStyle {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  fill: string;       // rgba fill for shapes
  fillOpacity: number;
  fontSize: number;
  textColor: string;
  // TradingView-matching fields
  opacity?: number;          // overall drawing opacity 0-1 (default 1)
  extendLeft?: boolean;      // extend trendline/ray to left canvas edge
  extendRight?: boolean;     // extend trendline/ray to right canvas edge
  showPriceLabel?: boolean;  // show price tag on right axis
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DPoint[];
  style: DStyle;
  text?: string;
  locked?: boolean;
  hidden?: boolean;            // per-drawing visibility toggle
  name?: string;               // user-assigned label (replaces type label in ObjectTree)
  timeframeVisibility?: string[]; // if set, only visible on listed timeframes
}

// How many anchor points each tool needs before it's complete.
export const POINT_COUNT: Record<DrawingType, number> = {
  trendline: 2, ray: 2, extended: 2, arrow: 2, rect: 2, ellipse: 2, fib: 2,
  measure: 2, callout: 2, pricerange: 2, gannfan: 2,
  triangle: 3, fibext: 3, pitchfork: 3, pchannel: 3, longpos: 3, shortpos: 3,
  hline: 1, hray: 1, vline: 1, text: 1, flag: 1, pricelabel: 1, emoji: 1,
  brush: -1,    // freehand: ends on pointer-up
  polyline: -2, // multi-point: ends on double-click
  // Elliott Wave — fixed point counts (auto-finish when reached)
  ew_impulse:    6,  // start + 5 wave-end points
  ew_correction: 4,  // start + A + B + C
  ew_triangle:   6,  // start + A + B + C + D + E
  ew_double:     4,  // start + W + X + Y
  ew_triple:     6,  // start + W + X + Y + X2 + Z
  xabcd:         5,  // X + A + B + C + D
};

// Wave labels per Elliott type
export const EW_LABELS: Record<string, string[]> = {
  ew_impulse:    ['0', '1', '2', '3', '4', '5'],
  ew_correction: ['0', 'A', 'B', 'C'],
  ew_triangle:   ['0', 'A', 'B', 'C', 'D', 'E'],
  ew_double:     ['0', 'W', 'X', 'Y'],
  ew_triple:     ['0', 'W', 'X', 'Y', 'X', 'Z'],
  xabcd:         ['X', 'A', 'B', 'C', 'D'],
};

export const DEFAULT_STYLE: DStyle = {
  color: '#2962ff',
  width: 2,
  style: 'solid',
  fill: 'rgba(41,98,255,0.12)',
  fillOpacity: 0.12,
  fontSize: 14,
  textColor: '#d1d4dc',
};

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];
export const FIB_COLORS: Record<number, string> = {
  0: '#787b86', 0.236: '#ef5350', 0.382: '#ff9800', 0.5: '#4caf50',
  0.618: '#26a69a', 0.786: '#089981', 1: '#787b86', 1.272: '#9c27b0', 1.618: '#2962ff', 2.618: '#9c27b0',
};
