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
  // ── Volume / data-driven tools (need OHLCV) ──────────────────────────
  | 'anchored_vwap'  // 1 anchor → cumulative VWAP + σ bands to last bar
  | 'fixed_vp'       // 2 anchors → volume profile over a fixed bar range
  | 'anchored_vp'    // 1 anchor → volume profile from anchor to last bar
  // ── Trend variants ───────────────────────────────────────────────────
  | 'infoline'       // trendline + Δprice/%/bars label
  | 'trendangle'     // trendline + angle in degrees
  | 'crossline'      // horizontal + vertical line through one point
  | 'regression'     // linear-regression channel + std-dev bands
  | 'flatchannel'    // sloped line + horizontal parallel
  | 'disjoint'       // two independent channel lines
  | 'schiff'         // Schiff pitchfork
  | 'modschiff'      // Modified Schiff pitchfork
  | 'inside'         // Inside pitchfork
  // ── Fib / Gann variants ──────────────────────────────────────────────
  | 'fibchannel'     // parallel fib lines
  | 'fibtimezone'    // vertical fib time lines from one anchor span
  | 'fibtime'        // trend-based fib time
  | 'fibfan'         // fib speed-resistance fan
  | 'fibarcs'        // fib speed-resistance arcs
  | 'fibcircles'     // concentric fib circles
  | 'gannbox'        // gann box grid
  | 'gannsquare'     // gann square + diagonals
  // ── Patterns / cycles ────────────────────────────────────────────────
  | 'cypher'         // X-A-B-C-D cypher pattern
  | 'hns'            // head & shoulders
  | 'abcd'           // ABCD pattern
  | 'threedrives'    // three drives pattern
  | 'cyclic'         // repeated equal-spaced vertical lines
  | 'sine'           // sine wave
  | 'timecycles'     // concentric time-cycle circles
  // ── Forecast / projection / shapes ───────────────────────────────────
  | 'forecast'       // 3-point forecast projection
  | 'barpattern'     // copy real bars into a target box
  | 'ghostfeed'      // synthetic candles in a box
  | 'sector'         // angle pie slice
  | 'daterange'      // bars/time-only measurer
  | 'highlighter'    // thick translucent freehand
  | 'circle'         // true circle (center + radius)
  | 'rotrect'        // rotated rectangle
  | 'arc'            // arc through 3 points
  | 'curve'          // quadratic curve
  | 'arrowup'        // up arrow marker
  | 'arrowdown'      // down arrow marker
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
  // ── Data-driven tool options (VWAP / volume profile) ─────────────────
  vpRows?: number;           // volume-profile row count (default 24)
  vwapBands?: boolean;       // draw ±1σ / ±2σ bands on anchored VWAP
  upColor?: string;          // volume-profile bullish color
  downColor?: string;        // volume-profile bearish color
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
  measure: 2, callout: 2, pricerange: 2, gannfan: 2, fixed_vp: 2,
  anchored_vwap: 1, anchored_vp: 1,
  triangle: 3, fibext: 3, pitchfork: 3, pchannel: 3, longpos: 3, shortpos: 3,
  hline: 1, hray: 1, vline: 1, text: 1, flag: 1, pricelabel: 1, emoji: 1,
  brush: -1,    // freehand: ends on pointer-up
  polyline: -2, // multi-point: ends on double-click
  // ── New tool point counts ──
  infoline: 2, trendangle: 2, crossline: 1, regression: 2, flatchannel: 3,
  disjoint: 4, schiff: 3, modschiff: 3, inside: 3,
  fibchannel: 3, fibtimezone: 2, fibtime: 3, fibfan: 2, fibarcs: 2, fibcircles: 2,
  gannbox: 2, gannsquare: 2,
  cypher: 5, hns: 6, abcd: 4, threedrives: 6, cyclic: 2, sine: 2, timecycles: 2,
  forecast: 3, barpattern: 2, ghostfeed: 2, sector: 3, daterange: 2,
  highlighter: -1, circle: 2, rotrect: 3, arc: 3, curve: 3, arrowup: 1, arrowdown: 1,
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
