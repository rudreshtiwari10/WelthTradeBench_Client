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
  | 'pricerange';

export interface DStyle {
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  fill: string;       // rgba fill for shapes
  fillOpacity: number;
  fontSize: number;
  textColor: string;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: DPoint[];
  style: DStyle;
  text?: string;
  locked?: boolean;
}

// How many anchor points each tool needs before it's complete.
export const POINT_COUNT: Record<DrawingType, number> = {
  trendline: 2, ray: 2, extended: 2, arrow: 2, rect: 2, ellipse: 2, fib: 2,
  measure: 2, callout: 2, pricerange: 2, gannfan: 2,
  triangle: 3, fibext: 3, pitchfork: 3, pchannel: 3, longpos: 3, shortpos: 3,
  hline: 1, hray: 1, vline: 1, text: 1, flag: 1, pricelabel: 1, emoji: 1,
  brush: -1,    // freehand: ends on pointer-up
  polyline: -2, // multi-point: ends on double-click
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

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618, 2.618];
export const FIB_COLORS: Record<number, string> = {
  0: '#787b86', 0.236: '#ef5350', 0.382: '#ff9800', 0.5: '#4caf50',
  0.618: '#26a69a', 0.786: '#089981', 1: '#787b86', 1.618: '#2962ff', 2.618: '#9c27b0',
};
