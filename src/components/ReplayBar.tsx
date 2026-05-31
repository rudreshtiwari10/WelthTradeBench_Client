import { Icon } from '../icons/Icon';
import { useReplayStore } from '../state/replayStore';
import './ReplayBar.css';

const SPEEDS = [1, 3, 5, 10];

export function ReplayBar() {
  const { active, playing, index, total, speed, play, pause, step, setSpeed, setIndex, exit } = useReplayStore();
  if (!active) return null;

  return (
    <div className="replay-bar" onPointerDown={(e) => e.stopPropagation()}>
      <button className="rb-btn" title="Step back" onClick={() => setIndex(index - 1)}><Icon name="chevronLeft" size={16} /></button>
      <button className="rb-btn play" title={playing ? 'Pause' : 'Play'} onClick={() => (playing ? pause() : play())}>
        {playing ? <span className="rb-pause" /> : <span className="rb-play" />}
      </button>
      <button className="rb-btn" title="Step forward" onClick={step}><Icon name="chevronRight" size={16} /></button>

      <input
        className="rb-scrub"
        type="range"
        min={2}
        max={total}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
      />
      <span className="rb-count">{index}/{total}</span>

      <div className="rb-sep" />
      <div className="rb-speed">
        {SPEEDS.map((s) => (
          <button key={s} className={`rb-spd ${speed === s ? 'active' : ''}`} onClick={() => setSpeed(s)}>{s}×</button>
        ))}
      </div>
      <button className="rb-btn exit" title="Exit replay" onClick={exit}><Icon name="close" size={16} /></button>
    </div>
  );
}
