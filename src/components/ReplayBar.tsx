import { useState } from 'react';
import { Icon } from '../icons/Icon';
import { useReplayStore } from '../state/replayStore';
import './ReplayBar.css';

const SPEEDS = [1, 3, 5, 10];

function formatDisplay(ts: number): string {
  const d = new Date(ts * 1000);
  const day   = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-IN', { month: 'short' });
  const year  = d.getFullYear();
  const hh    = String(d.getHours()).padStart(2, '0');
  const mm    = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hh}:${mm}`;
}

function toInputValue(ts: number): string {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ReplayBar() {
  const { active, playing, index, total, speed, timestamps, play, pause, step, setSpeed, setIndex, exit } =
    useReplayStore();
  const [editingDate, setEditingDate] = useState(false);

  if (!active) return null;

  const currentTs  = timestamps[index - 1];
  const minTs      = timestamps[0];
  const maxTs      = timestamps[timestamps.length - 1];

  const jumpToDate = (val: string) => {
    if (!val || timestamps.length === 0) { setEditingDate(false); return; }
    const targetTs = new Date(val).getTime() / 1000;
    let best = 2;
    let bestDiff = Infinity;
    timestamps.forEach((ts, i) => {
      const diff = Math.abs(ts - targetTs);
      if (diff < bestDiff) { bestDiff = diff; best = i + 1; }
    });
    setIndex(best);
    setEditingDate(false);
  };

  return (
    <div className="replay-bar" onPointerDown={(e) => e.stopPropagation()}>
      <button className="rb-btn" title="Step back" onClick={() => setIndex(index - 1)}>
        <Icon name="chevronLeft" size={16} />
      </button>
      <button className="rb-btn play" title={playing ? 'Pause' : 'Play'} onClick={() => (playing ? pause() : play())}>
        {playing ? <span className="rb-pause" /> : <span className="rb-play" />}
      </button>
      <button className="rb-btn" title="Step forward" onClick={step}>
        <Icon name="chevronRight" size={16} />
      </button>

      <input
        className="rb-scrub"
        type="range"
        min={2}
        max={total}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
      />

      {editingDate ? (
        <input
          className="rb-date-input"
          type="datetime-local"
          autoFocus
          defaultValue={currentTs ? toInputValue(currentTs) : ''}
          min={minTs ? toInputValue(minTs) : undefined}
          max={maxTs ? toInputValue(maxTs) : undefined}
          onChange={(e) => jumpToDate(e.target.value)}
          onBlur={() => setEditingDate(false)}
        />
      ) : (
        <button
          className="rb-count rb-count-btn"
          title="Click to jump to a date/time"
          onClick={() => setEditingDate(true)}
        >
          {currentTs ? formatDisplay(currentTs) : `${index} / ${total}`}
        </button>
      )}

      <div className="rb-sep" />
      <div className="rb-speed">
        {SPEEDS.map((s) => (
          <button key={s} className={`rb-spd ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
      <button className="rb-btn exit" title="Exit replay" onClick={exit}>
        <Icon name="close" size={16} />
      </button>
    </div>
  );
}
