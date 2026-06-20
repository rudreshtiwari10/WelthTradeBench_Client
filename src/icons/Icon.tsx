// Line-style SVG icon set approximating the TradingView chart-page glyphs.
// All paths are drawn on a 28x28 viewBox with 1.4px strokes (TV's toolbar scale).
import React from 'react';

export type IconName =
  | 'search'
  | 'candles'
  | 'bars'
  | 'line'
  | 'area'
  | 'baseline'
  | 'heikin'
  | 'hollow'
  | 'indicators'
  | 'alert'
  | 'replay'
  | 'compare'
  | 'undo'
  | 'redo'
  | 'settings'
  | 'camera'
  | 'fullscreen'
  | 'layout'
  | 'cursor'
  | 'crosshair'
  | 'dot'
  | 'arrowCursor'
  | 'eraser'
  | 'trendline'
  | 'ray'
  | 'hline'
  | 'vline'
  | 'channel'
  | 'fib'
  | 'gann'
  | 'pitchfork'
  | 'brush'
  | 'highlighter'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'path'
  | 'text'
  | 'note'
  | 'callout'
  | 'longpos'
  | 'shortpos'
  | 'pattern'
  | 'measure'
  | 'ruler'
  | 'zoomin'
  | 'magnet'
  | 'lock'
  | 'eye'
  | 'eyeOff'
  | 'trash'
  | 'emoji'
  | 'flag'
  | 'star'
  | 'plus'
  | 'more'
  | 'dots'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'theme'
  | 'grid'
  | 'gridPlus'
  | 'splitV'
  | 'splitH'
  | 'expand'
  | 'close';

// Each entry renders inside <svg viewBox="0 0 28 28">.
const PATHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <circle cx="12.5" cy="12.5" r="6" />
      <line x1="17" y1="17" x2="22" y2="22" />
    </>
  ),
  candles: (
    <>
      <line x1="9" y1="4" x2="9" y2="24" />
      <rect x="6.5" y="9" width="5" height="9" />
      <line x1="18.5" y1="6" x2="18.5" y2="22" />
      <rect x="16" y="11" width="5" height="7" />
    </>
  ),
  hollow: (
    <>
      <line x1="9" y1="4" x2="9" y2="24" />
      <rect x="6.5" y="9" width="5" height="9" />
      <line x1="18.5" y1="6" x2="18.5" y2="22" />
      <rect x="16" y="11" width="5" height="7" />
    </>
  ),
  bars: (
    <>
      <line x1="9" y1="5" x2="9" y2="23" />
      <line x1="9" y1="9" x2="5.5" y2="9" />
      <line x1="9" y1="16" x2="12.5" y2="16" />
      <line x1="19" y1="7" x2="19" y2="21" />
      <line x1="19" y1="11" x2="15.5" y2="11" />
      <line x1="19" y1="17" x2="22.5" y2="17" />
    </>
  ),
  line: <polyline points="4,18 10,12 15,16 24,6" />,
  area: (
    <>
      <polyline points="4,18 10,12 15,16 24,6" />
      <path d="M4 18 L10 12 L15 16 L24 6 V23 H4 Z" fillOpacity="0.18" stroke="none" />
    </>
  ),
  baseline: (
    <>
      <line x1="4" y1="14" x2="24" y2="14" strokeDasharray="2 2" />
      <polyline points="4,18 10,10 15,16 24,8" />
    </>
  ),
  heikin: (
    <>
      <rect x="6" y="9" width="5" height="9" />
      <line x1="8.5" y1="5" x2="8.5" y2="23" />
      <rect x="17" y="11" width="5" height="7" />
      <line x1="19.5" y1="7" x2="19.5" y2="22" />
    </>
  ),
  indicators: (
    <>
      <path d="M5 19 C9 19 9 9 13 9 C17 9 17 19 21 19" />
      <text x="14" y="11" fontSize="7" fill="currentColor" stroke="none" textAnchor="middle">fx</text>
    </>
  ),
  alert: (
    <>
      <path d="M14 5 C10.5 5 8.5 7.5 8.5 11 V16 L7 19 H21 L19.5 16 V11 C19.5 7.5 17.5 5 14 5 Z" />
      <path d="M12 21 a2 2 0 0 0 4 0" />
    </>
  ),
  replay: (
    <>
      <circle cx="14" cy="14" r="8" />
      <polygon points="12,10 19,14 12,18" stroke="none" fill="currentColor" />
    </>
  ),
  compare: (
    <>
      <polyline points="4,19 10,12 14,15 24,6" />
      <polyline points="4,11 9,16 13,8 24,17" strokeDasharray="2 2" />
    </>
  ),
  undo: (
    <>
      <path d="M9 9 H17 a5 5 0 0 1 0 10 H10" />
      <polyline points="11,5 7,9 11,13" />
    </>
  ),
  redo: (
    <>
      <path d="M19 9 H11 a5 5 0 0 0 0 10 H18" />
      <polyline points="17,5 21,9 17,13" />
    </>
  ),
  settings: (
    <>
      <circle cx="14" cy="14" r="3" />
      <path d="M14 4 v3 M14 21 v3 M4 14 h3 M21 14 h3 M7 7 l2 2 M19 19 l2 2 M21 7 l-2 2 M9 19 l-2 2" />
    </>
  ),
  camera: (
    <>
      <rect x="4" y="9" width="20" height="13" rx="2" />
      <circle cx="14" cy="15.5" r="3.5" />
      <path d="M10 9 l2-3 h4 l2 3" />
    </>
  ),
  fullscreen: (
    <>
      <polyline points="5,10 5,5 10,5" />
      <polyline points="23,10 23,5 18,5" />
      <polyline points="5,18 5,23 10,23" />
      <polyline points="23,18 23,23 18,23" />
    </>
  ),
  layout: (
    <>
      <rect x="4" y="5" width="20" height="18" rx="1.5" />
      <line x1="14" y1="5" x2="14" y2="23" />
    </>
  ),
  cursor: (
    <>
      <line x1="14" y1="4" x2="14" y2="24" />
      <line x1="4" y1="14" x2="24" y2="14" />
    </>
  ),
  crosshair: (
    <>
      <line x1="14" y1="4" x2="14" y2="24" />
      <line x1="4" y1="14" x2="24" y2="14" />
      <circle cx="14" cy="14" r="1.4" stroke="none" fill="currentColor" />
    </>
  ),
  dot: <circle cx="14" cy="14" r="3" stroke="none" fill="currentColor" />,
  arrowCursor: <polygon points="8,5 8,21 12,17 15,23 17,22 14,16 19,16" stroke="none" fill="currentColor" />,
  eraser: (
    <>
      <path d="M6 18 L14 10 L20 16 L16 20 H10 Z" />
      <line x1="8" y1="22" x2="22" y2="22" />
    </>
  ),
  trendline: <line x1="6" y1="21" x2="22" y2="7" />,
  ray: (
    <>
      <line x1="6" y1="21" x2="22" y2="7" />
      <circle cx="6" cy="21" r="1.6" stroke="none" fill="currentColor" />
    </>
  ),
  hline: <line x1="4" y1="14" x2="24" y2="14" />,
  vline: <line x1="14" y1="4" x2="14" y2="24" />,
  channel: (
    <>
      <line x1="5" y1="20" x2="21" y2="8" />
      <line x1="7" y1="23" x2="23" y2="11" />
    </>
  ),
  fib: (
    <>
      <line x1="5" y1="8" x2="23" y2="8" />
      <line x1="5" y1="12" x2="23" y2="12" />
      <line x1="5" y1="16" x2="23" y2="16" />
      <line x1="5" y1="20" x2="23" y2="20" />
    </>
  ),
  gann: (
    <>
      <line x1="5" y1="23" x2="23" y2="5" />
      <line x1="5" y1="23" x2="23" y2="14" />
      <line x1="5" y1="23" x2="14" y2="5" />
    </>
  ),
  pitchfork: (
    <>
      <line x1="6" y1="6" x2="20" y2="20" />
      <line x1="6" y1="14" x2="22" y2="14" />
      <line x1="14" y1="6" x2="14" y2="22" />
    </>
  ),
  brush: (
    <>
      <path d="M18 6 L22 10 L12 20 L8 21 L9 17 Z" />
      <line x1="9" y1="17" x2="12" y2="20" />
    </>
  ),
  highlighter: (
    <>
      <path d="M7 18 L16 9 L20 13 L11 22 H7 Z" />
      <line x1="6" y1="24" x2="22" y2="24" strokeWidth="2.4" />
    </>
  ),
  rect: <rect x="5" y="8" width="18" height="12" />,
  ellipse: <ellipse cx="14" cy="14" rx="9" ry="6.5" />,
  triangle: <polygon points="14,6 23,21 5,21" />,
  path: <polyline points="5,20 11,9 16,16 23,7" />,
  text: (
    <>
      <line x1="8" y1="7" x2="20" y2="7" />
      <line x1="14" y1="7" x2="14" y2="21" />
    </>
  ),
  note: (
    <>
      <path d="M6 6 H22 V18 H13 L8 22 V18 H6 Z" />
      <line x1="9" y1="11" x2="19" y2="11" />
      <line x1="9" y1="14" x2="16" y2="14" />
    </>
  ),
  callout: (
    <>
      <rect x="5" y="6" width="18" height="11" rx="2" />
      <polyline points="11,17 9,22 15,17" stroke="none" fill="currentColor" />
    </>
  ),
  longpos: (
    <>
      <rect x="5" y="14" width="18" height="6" fill="var(--up)" fillOpacity="0.3" stroke="var(--up)" />
      <rect x="5" y="8" width="18" height="6" fill="var(--down)" fillOpacity="0.3" stroke="var(--down)" />
      <polyline points="14,8 14,4" />
      <polyline points="11,6 14,3 17,6" />
    </>
  ),
  shortpos: (
    <>
      <rect x="5" y="8" width="18" height="6" fill="var(--down)" fillOpacity="0.3" stroke="var(--down)" />
      <rect x="5" y="14" width="18" height="6" fill="var(--up)" fillOpacity="0.3" stroke="var(--up)" />
      <polyline points="14,20 14,24" />
      <polyline points="11,22 14,25 17,22" />
    </>
  ),
  pattern: <polyline points="5,18 10,8 14,15 18,6 23,16" />,
  measure: (
    <>
      <rect x="5" y="9" width="18" height="10" rx="1" />
      <line x1="9" y1="9" x2="9" y2="13" />
      <line x1="13" y1="9" x2="13" y2="13" />
      <line x1="17" y1="9" x2="17" y2="13" />
    </>
  ),
  ruler: (
    <>
      <rect x="4" y="11" width="20" height="6" rx="1" transform="rotate(-30 14 14)" />
      <line x1="9" y1="13" x2="10" y2="11" />
      <line x1="13" y1="15" x2="14" y2="13" />
      <line x1="17" y1="17" x2="18" y2="15" />
    </>
  ),
  zoomin: (
    <>
      <circle cx="12" cy="12" r="6" />
      <line x1="16.5" y1="16.5" x2="22" y2="22" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </>
  ),
  magnet: (
    <>
      <path d="M8 5 V14 a6 6 0 0 0 12 0 V5" />
      <line x1="8" y1="5" x2="12" y2="5" />
      <line x1="16" y1="5" x2="20" y2="5" />
    </>
  ),
  lock: (
    <>
      <rect x="7" y="13" width="14" height="10" rx="2" />
      <path d="M10 13 V10 a4 4 0 0 1 8 0 V13" />
    </>
  ),
  eye: (
    <>
      <path d="M4 14 C7 8 21 8 24 14 C21 20 7 20 4 14 Z" />
      <circle cx="14" cy="14" r="2.5" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 14 C7 8 21 8 24 14 C23 16 21 17.5 19 18.5 M9 18.5 C7 17.5 5 16 4 14" />
      <line x1="6" y1="6" x2="22" y2="22" />
    </>
  ),
  trash: (
    <>
      <polyline points="6,8 22,8" />
      <path d="M8 8 V21 a1 1 0 0 0 1 1 H19 a1 1 0 0 0 1 -1 V8" />
      <path d="M11 8 V6 a1 1 0 0 1 1 -1 H16 a1 1 0 0 1 1 1 V8" />
      <line x1="12" y1="11" x2="12" y2="19" />
      <line x1="16" y1="11" x2="16" y2="19" />
    </>
  ),
  emoji: (
    <>
      <circle cx="14" cy="14" r="9" />
      <circle cx="11" cy="12" r="1" stroke="none" fill="currentColor" />
      <circle cx="17" cy="12" r="1" stroke="none" fill="currentColor" />
      <path d="M10 16 a4 4 0 0 0 8 0" />
    </>
  ),
  flag: (
    <>
      <line x1="8" y1="4" x2="8" y2="24" />
      <path d="M8 6 H20 L17 10 L20 14 H8" />
    </>
  ),
  star: <polygon points="14,5 16.5,11 23,11.5 18,15.5 19.5,22 14,18.5 8.5,22 10,15.5 5,11.5 11.5,11" />,
  plus: (
    <>
      <line x1="14" y1="7" x2="14" y2="21" />
      <line x1="7" y1="14" x2="21" y2="14" />
    </>
  ),
  more: (
    <>
      <circle cx="7" cy="14" r="1.5" stroke="none" fill="currentColor" />
      <circle cx="14" cy="14" r="1.5" stroke="none" fill="currentColor" />
      <circle cx="21" cy="14" r="1.5" stroke="none" fill="currentColor" />
    </>
  ),
  dots: (
    <>
      <circle cx="14" cy="7" r="1.5" stroke="none" fill="currentColor" />
      <circle cx="14" cy="14" r="1.5" stroke="none" fill="currentColor" />
      <circle cx="14" cy="21" r="1.5" stroke="none" fill="currentColor" />
    </>
  ),
  chevronLeft: <polyline points="17,7 10,14 17,21" />,
  chevronRight: <polyline points="11,7 18,14 11,21" />,
  chevronDown: <polyline points="8,11 14,17 20,11" />,
  grid: (
    <>
      <rect x="4" y="4" width="20" height="20" rx="1.5" />
      <line x1="14" y1="4" x2="14" y2="24" />
      <line x1="4" y1="14" x2="24" y2="14" />
    </>
  ),
  gridPlus: (
    <>
      <rect x="5" y="5" width="8" height="8" rx="1" />
      <rect x="15" y="5" width="8" height="8" rx="1" />
      <rect x="5" y="15" width="8" height="8" rx="1" />
      <line x1="19" y1="15.5" x2="19" y2="22.5" />
      <line x1="15.5" y1="19" x2="22.5" y2="19" />
    </>
  ),
  splitV: (
    <>
      <rect x="4" y="4" width="20" height="20" rx="1.5" />
      <line x1="14" y1="4" x2="14" y2="24" />
    </>
  ),
  splitH: (
    <>
      <rect x="4" y="4" width="20" height="20" rx="1.5" />
      <line x1="4" y1="14" x2="24" y2="14" />
    </>
  ),
  expand: (
    <>
      <polyline points="4,11 4,4 11,4" />
      <polyline points="24,11 24,4 17,4" />
      <polyline points="4,17 4,24 11,24" />
      <polyline points="24,17 24,24 17,24" />
      <line x1="4" y1="4" x2="10" y2="10" />
      <line x1="24" y1="4" x2="18" y2="10" />
      <line x1="4" y1="24" x2="10" y2="18" />
      <line x1="24" y1="24" x2="18" y2="18" />
    </>
  ),
  theme: (
    <>
      <circle cx="14" cy="14" r="6" />
      <path d="M14 8 a6 6 0 0 0 0 12 Z" stroke="none" fill="currentColor" />
      <path d="M14 4 v2 M14 22 v2 M4 14 h2 M22 14 h2 M7 7 l1.5 1.5 M19.5 19.5 l1.5 1.5 M21 7 l-1.5 1.5 M8.5 19.5 l-1.5 1.5" />
    </>
  ),
  close: (
    <>
      <line x1="7" y1="7" x2="21" y2="21" />
      <line x1="21" y1="7" x2="7" y2="21" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, className, strokeWidth = 1.4 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
