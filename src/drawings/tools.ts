import type { IconName } from '../icons/Icon';
import type { Tool } from '../state/drawingStore';

export interface ToolDef {
  tool: Tool;
  icon: IconName;
  label: string;
  shortcut?: string;
  text?: string;     // preset text/emoji placed on use
}

export interface ToolSection {
  title?: string;
  tools: ToolDef[];
}

export interface ToolGroup {
  id: string;
  icon: IconName;        // default rail icon (overridden by last-picked)
  title: string;
  sections: ToolSection[];
}

// Mirrors TradingView's left toolbar. Exotic tools map to the closest working
// renderer in the engine (e.g. all pitchfork variants → pitchfork, Elliott /
// patterns → polyline) so every item draws something usable.
export const TOOL_GROUPS: ToolGroup[] = [
  {
    id: 'cursor', icon: 'crosshair', title: 'Cursors',
    sections: [{ tools: [
      { tool: 'cursor', icon: 'crosshair', label: 'Cross' },
      { tool: 'dot', icon: 'dot', label: 'Dot' },
      { tool: 'arrowcursor', icon: 'arrowCursor', label: 'Arrow' },
      { tool: 'eraser', icon: 'eraser', label: 'Eraser' },
    ] }],
  },
  {
    id: 'trend', icon: 'trendline', title: 'Trend line tools',
    sections: [
      { title: 'Lines', tools: [
        { tool: 'trendline', icon: 'trendline', label: 'Trend Line', shortcut: 'Alt+T' },
        { tool: 'ray', icon: 'ray', label: 'Ray' },
        { tool: 'trendline', icon: 'trendline', label: 'Info Line' },
        { tool: 'extended', icon: 'trendline', label: 'Extended Line' },
        { tool: 'trendline', icon: 'trendline', label: 'Trend Angle' },
        { tool: 'hline', icon: 'hline', label: 'Horizontal Line', shortcut: 'Alt+H' },
        { tool: 'hray', icon: 'hline', label: 'Horizontal Ray' },
        { tool: 'vline', icon: 'vline', label: 'Vertical Line', shortcut: 'Alt+V' },
        { tool: 'vline', icon: 'vline', label: 'Cross Line' },
      ] },
      { title: 'Channels', tools: [
        { tool: 'pchannel', icon: 'channel', label: 'Parallel Channel' },
        { tool: 'pchannel', icon: 'channel', label: 'Regression Trend' },
        { tool: 'pchannel', icon: 'channel', label: 'Flat Top/Bottom' },
        { tool: 'pchannel', icon: 'channel', label: 'Disjoint Channel' },
      ] },
      { title: 'Pitchforks', tools: [
        { tool: 'pitchfork', icon: 'pitchfork', label: 'Pitchfork' },
        { tool: 'pitchfork', icon: 'pitchfork', label: 'Schiff Pitchfork' },
        { tool: 'pitchfork', icon: 'pitchfork', label: 'Modified Schiff Pitchfork' },
        { tool: 'pitchfork', icon: 'pitchfork', label: 'Inside Pitchfork' },
      ] },
    ],
  },
  {
    id: 'fib', icon: 'fib', title: 'Gann and Fibonacci tools',
    sections: [
      { title: 'Fibonacci', tools: [
        { tool: 'fib', icon: 'fib', label: 'Fib Retracement', shortcut: 'Alt+F' },
        { tool: 'fibext', icon: 'fib', label: 'Trend-Based Fib Extension' },
        { tool: 'fibext', icon: 'fib', label: 'Fib Channel' },
        { tool: 'fib', icon: 'fib', label: 'Fib Time Zone' },
        { tool: 'gannfan', icon: 'gann', label: 'Fib Speed Resistance Fan' },
        { tool: 'fibext', icon: 'fib', label: 'Trend-Based Fib Time' },
        { tool: 'ellipse', icon: 'ellipse', label: 'Fib Circles' },
        { tool: 'ellipse', icon: 'ellipse', label: 'Fib Spiral' },
        { tool: 'ellipse', icon: 'ellipse', label: 'Fib Speed Resistance Arcs' },
        { tool: 'fib', icon: 'fib', label: 'Fib Wedge' },
        { tool: 'pitchfork', icon: 'pitchfork', label: 'Pitchfan' },
      ] },
      { title: 'Gann', tools: [
        { tool: 'rect', icon: 'gann', label: 'Gann Box' },
        { tool: 'rect', icon: 'gann', label: 'Gann Square Fixed' },
        { tool: 'rect', icon: 'gann', label: 'Gann Square' },
        { tool: 'gannfan', icon: 'gann', label: 'Gann Fan' },
      ] },
    ],
  },
  {
    id: 'patterns', icon: 'pattern', title: 'Patterns',
    sections: [
      { title: 'Chart Patterns', tools: [
        { tool: 'polyline', icon: 'pattern', label: 'XABCD Pattern' },
        { tool: 'polyline', icon: 'pattern', label: 'Cypher Pattern' },
        { tool: 'polyline', icon: 'pattern', label: 'Head and Shoulders' },
        { tool: 'polyline', icon: 'pattern', label: 'ABCD Pattern' },
        { tool: 'triangle', icon: 'triangle', label: 'Triangle Pattern' },
        { tool: 'polyline', icon: 'pattern', label: 'Three Drives Pattern' },
      ] },
      { title: 'Elliott Waves', tools: [
        { tool: 'polyline', icon: 'pattern', label: 'Elliott Impulse Wave (1-2-3-4-5)' },
        { tool: 'polyline', icon: 'pattern', label: 'Elliott Correction Wave (A-B-C)' },
        { tool: 'polyline', icon: 'pattern', label: 'Elliott Triangle Wave (A-B-C-D-E)' },
        { tool: 'polyline', icon: 'pattern', label: 'Elliott Double Combo (W-X-Y)' },
        { tool: 'polyline', icon: 'pattern', label: 'Elliott Triple Combo (W-X-Y-X-Z)' },
      ] },
      { title: 'Cycles', tools: [
        { tool: 'polyline', icon: 'line', label: 'Cyclic Lines' },
        { tool: 'vline', icon: 'vline', label: 'Time Cycles' },
        { tool: 'polyline', icon: 'line', label: 'Sine Line' },
      ] },
    ],
  },
  {
    id: 'position', icon: 'longpos', title: 'Prediction and measurement tools',
    sections: [
      { title: 'Forecasting', tools: [
        { tool: 'longpos', icon: 'longpos', label: 'Long Position' },
        { tool: 'shortpos', icon: 'shortpos', label: 'Short Position' },
        { tool: 'longpos', icon: 'longpos', label: 'Position Forecast' },
        { tool: 'rect', icon: 'rect', label: 'Bar Pattern' },
        { tool: 'rect', icon: 'rect', label: 'Ghost Feed' },
        { tool: 'gannfan', icon: 'gann', label: 'Sector' },
      ] },
      { title: 'Volume-based', tools: [
        { tool: 'trendline', icon: 'trendline', label: 'Anchored VWAP' },
        { tool: 'rect', icon: 'rect', label: 'Fixed Range Volume Profile' },
        { tool: 'rect', icon: 'rect', label: 'Anchored Volume Profile' },
      ] },
      { title: 'Measurers', tools: [
        { tool: 'pricerange', icon: 'measure', label: 'Price Range' },
        { tool: 'pricerange', icon: 'measure', label: 'Date Range' },
        { tool: 'measure', icon: 'measure', label: 'Date and Price Range' },
      ] },
    ],
  },
  {
    id: 'shapes', icon: 'brush', title: 'Geometric shapes',
    sections: [
      { title: 'Brushes', tools: [
        { tool: 'brush', icon: 'brush', label: 'Brush' },
        { tool: 'brush', icon: 'highlighter', label: 'Highlighter' },
      ] },
      { title: 'Arrows', tools: [
        { tool: 'arrow', icon: 'arrowCursor', label: 'Arrow Marker' },
        { tool: 'arrow', icon: 'arrowCursor', label: 'Arrow' },
        { tool: 'arrow', icon: 'arrowCursor', label: 'Arrow Mark Up' },
        { tool: 'arrow', icon: 'arrowCursor', label: 'Arrow Mark Down' },
      ] },
      { title: 'Shapes', tools: [
        { tool: 'rect', icon: 'rect', label: 'Rectangle' },
        { tool: 'rect', icon: 'rect', label: 'Rotated Rectangle' },
        { tool: 'polyline', icon: 'path', label: 'Path' },
        { tool: 'ellipse', icon: 'ellipse', label: 'Circle' },
        { tool: 'ellipse', icon: 'ellipse', label: 'Ellipse' },
        { tool: 'polyline', icon: 'path', label: 'Polyline' },
        { tool: 'triangle', icon: 'triangle', label: 'Triangle' },
        { tool: 'polyline', icon: 'path', label: 'Arc' },
        { tool: 'polyline', icon: 'path', label: 'Curve' },
        { tool: 'polyline', icon: 'path', label: 'Double Curve' },
      ] },
    ],
  },
  {
    id: 'text', icon: 'text', title: 'Annotation tools',
    sections: [
      { title: 'Text and Notes', tools: [
        { tool: 'text', icon: 'text', label: 'Text' },
        { tool: 'callout', icon: 'note', label: 'Note' },
        { tool: 'callout', icon: 'note', label: 'Price Note' },
        { tool: 'flag', icon: 'flag', label: 'Pin' },
        { tool: 'callout', icon: 'note', label: 'Table' },
        { tool: 'callout', icon: 'callout', label: 'Callout' },
        { tool: 'callout', icon: 'callout', label: 'Comment' },
        { tool: 'pricelabel', icon: 'note', label: 'Price Label' },
        { tool: 'flag', icon: 'flag', label: 'Signpost' },
        { tool: 'flag', icon: 'flag', label: 'Flag Mark' },
      ] },
      { title: 'Content', tools: [
        { tool: 'callout', icon: 'note', label: 'Image' },
        { tool: 'callout', icon: 'note', label: 'Post' },
        { tool: 'callout', icon: 'note', label: 'Idea' },
      ] },
    ],
  },
  {
    id: 'emoji', icon: 'emoji', title: 'Icons & stickers',
    sections: [{ title: 'Emojis', tools:
      ['😀','😁','😂','😍','🤔','😎','😱','🚀','🔥','💎','📈','📉','⭐','✅','❌','⚠️','💰','🐂','🐻','👍','👎','🎯','💡','⚡']
        .map((e) => ({ tool: 'emoji' as Tool, icon: 'emoji' as IconName, label: e, text: e })),
    }],
  },
];

const ALL_DEFS = TOOL_GROUPS.flatMap((g) => g.sections.flatMap((s) => s.tools));

/** Flat list of every tool in a group (for active-state detection). */
export function groupTools(g: ToolGroup): ToolDef[] {
  return g.sections.flatMap((s) => s.tools);
}

/** Human-readable label for a drawing type (object tree). */
export function toolLabel(tool: string): string {
  return ALL_DEFS.find((d) => d.tool === tool)?.label ?? tool;
}
