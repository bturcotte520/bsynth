'use client';
import {useCallback, useEffect, useRef, useState} from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const loopBars = 4;
const beatsPerBar = 4;
const loopBeats = loopBars * beatsPerBar; // 16 quarter-note beats
const countInBeats = beatsPerBar; // 1 bar count-in
const eighthNote = 0.5; // 1/8 note in quarter-note beats
const minDisplayMidi = 60; // C4
const maxDisplayMidi = 76; // E5
const displayNoteCount = maxDisplayMidi - minDisplayMidi + 1; // 17

const noteNames = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

function midiLabel(midi: number): string {
  const name = noteNames[midi % 12];
  const octave = Math.floor(midi / 12) - 1;

  if (name === 'C' || name === 'E') {
    return `${name}${octave}`;
  }

  return name;
}

// ─── Metronome click ──────────────────────────────────────────────────────────

function scheduleClick(
  ctx: AudioContext,
  time: number,
  isAccent: boolean,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = 'sine';
  osc.frequency.value = isAccent ? 880 : 660;
  gain.gain.setValueAtTime(0.45, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
  osc.start(time);
  osc.stop(time + 0.09);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RawNote = {midiNote: number; startBeat: number};

export type QuantizedNote = {
  id: number;
  midiNote: number;
  startBeat: number;
  durationBeats: number;
};

export type BeatProgrammerStatus =
  | 'idle'
  | 'counting'
  | 'recording'
  | 'playing';

// ─── Quantization ─────────────────────────────────────────────────────────────

function snapToEighth(beat: number): number {
  return Math.round(beat / eighthNote) * eighthNote;
}

function buildQuantizedNotes(
  raw: Array<{note: RawNote; endBeat: number}>,
): QuantizedNote[] {
  const result: QuantizedNote[] = [];

  raw.forEach(({note, endBeat}, i) => {
    const start = Math.max(
      0,
      Math.min(snapToEighth(note.startBeat), loopBeats - eighthNote),
    );
    const end = snapToEighth(endBeat);
    const duration = Math.max(eighthNote, end - start);

    if (start < loopBeats) {
      result.push({
        id: i,
        midiNote: note.midiNote,
        startBeat: start,
        durationBeats: duration,
      });
    }
  });

  return result;
}

// ─── useBeatProgrammer ────────────────────────────────────────────────────────

type UseBeatProgrammerArgs = {
  ctx: AudioContext;
  playNote: (midi: number) => void;
  stop: () => void;
};

export function useBeatProgrammer({ctx, playNote, stop}: UseBeatProgrammerArgs) {
  const [bpm, setBpm] = useState(120);
  const [status, setStatus] = useState<BeatProgrammerStatus>('idle');
  const [notes, setNotes] = useState<QuantizedNote[]>([]);
  const [playheadBeat, setPlayheadBeat] = useState(0);
  // During count-in: counts down 4 → 1
  const [countDown, setCountDown] = useState(0);

  const bpmRef = useRef(120);
  const statusRef = useRef<BeatProgrammerStatus>('idle');
  const notesRef = useRef<QuantizedNote[]>([]);
  const startCtxTimeRef = useRef(0);
  const inFlightRef = useRef<Map<number, RawNote>>(new Map());
  const completedRawRef = useRef<Array<{note: RawNote; endBeat: number}>>([]);
  const activeNoteRef = useRef<number | undefined>(undefined);
  const prevBeatRef = useRef(0);

  const playNoteRef = useRef(playNote);
  playNoteRef.current = playNote;
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // ── RAF loop ───────────────────────────────────────────────────────────────

  useEffect(() => {
    let handle: number;

    const finishRecording = (maxEndBeat: number) => {
      const allRaw: Array<{note: RawNote; endBeat: number}> = [
        ...completedRawRef.current,
      ];

      inFlightRef.current.forEach((note) => {
        allRaw.push({note, endBeat: Math.min(maxEndBeat, loopBeats)});
      });

      inFlightRef.current.clear();

      const quantized = buildQuantizedNotes(allRaw);
      notesRef.current = quantized;
      completedRawRef.current = [];
      stopRef.current();
      activeNoteRef.current = undefined;
      prevBeatRef.current = 0;
      startCtxTimeRef.current = ctx.currentTime;
      statusRef.current = 'playing';
      setNotes(quantized);
      setStatus('playing');
      setCountDown(0);
    };

    const tick = () => {
      const currentStatus = statusRef.current;
      const bpm = bpmRef.current;
      const elapsed = ctx.currentTime - startCtxTimeRef.current;

      if (currentStatus === 'counting') {
        const beatDuration = 60 / bpm;
        const countInDuration = countInBeats * beatDuration;
        const countBeat = Math.floor(elapsed / beatDuration); // 0-3

        setCountDown(countInBeats - countBeat); // 4 → 3 → 2 → 1

        if (elapsed >= countInDuration) {
          // Align recording start exactly to scheduled time
          startCtxTimeRef.current += countInDuration;
          statusRef.current = 'recording';
          setStatus('recording');
          setCountDown(0);
          setPlayheadBeat(0);
        }
      } else if (currentStatus === 'recording') {
        const beat = elapsed * bpm / 60;
        setPlayheadBeat(Math.min(beat, loopBeats));

        if (beat >= loopBeats) {
          finishRecording(loopBeats);
        }
      } else if (currentStatus === 'playing') {
        const loopSecs = loopBeats * 60 / bpm;
        const loopElapsed = elapsed % loopSecs;
        const beat = loopElapsed * bpm / 60;

        // Detect loop wrap-around so the first note always re-triggers
        if (beat < prevBeatRef.current - 1) {
          activeNoteRef.current = undefined;
        }

        prevBeatRef.current = beat;
        setPlayheadBeat(beat);

        let activeMidi: number | undefined;

        for (const n of notesRef.current) {
          if (beat >= n.startBeat && beat < n.startBeat + n.durationBeats) {
            activeMidi = n.midiNote;
            break;
          }
        }

        if (activeMidi !== activeNoteRef.current) {
          if (activeMidi === undefined) {
            stopRef.current();
          } else {
            playNoteRef.current(activeMidi);
          }

          activeNoteRef.current = activeMidi;
        }
      }

      handle = requestAnimationFrame(tick);
    };

    handle = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(handle);
    };
  }, [ctx]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const updateBpm = useCallback(
    (v: number) => {
      bpmRef.current = v;
      setBpm(v);
    },
    [setBpm],
  );

  const startRecording = useCallback(() => {
    stopRef.current();
    inFlightRef.current.clear();
    completedRawRef.current = [];
    notesRef.current = [];
    activeNoteRef.current = undefined;
    prevBeatRef.current = 0;

    const bpm = bpmRef.current;
    const beatDuration = 60 / bpm;
    // Small offset so first click isn't cut off
    const countInStart = ctx.currentTime + 0.05;

    // Schedule 4 metronome clicks for the count-in bar
    for (let i = 0; i < countInBeats; i++) {
      scheduleClick(ctx, countInStart + i * beatDuration, i === 0);
    }

    startCtxTimeRef.current = countInStart;
    statusRef.current = 'counting';
    setNotes([]);
    setStatus('counting');
    setCountDown(countInBeats);
    setPlayheadBeat(0);
  }, [ctx]);

  const stopRecordingEarly = useCallback(() => {
    if (statusRef.current === 'counting') {
      stopRef.current();
      statusRef.current = 'idle';
      setStatus('idle');
      setCountDown(0);
      setPlayheadBeat(0);
      return;
    }

    if (statusRef.current !== 'recording') {
      return;
    }

    const elapsed = ctx.currentTime - startCtxTimeRef.current;
    const endBeat = Math.min(elapsed * bpmRef.current / 60, loopBeats);
    const allRaw: Array<{note: RawNote; endBeat: number}> = [
      ...completedRawRef.current,
    ];

    inFlightRef.current.forEach((note) => {
      allRaw.push({note, endBeat});
    });

    inFlightRef.current.clear();

    const quantized = buildQuantizedNotes(allRaw);
    notesRef.current = quantized;
    completedRawRef.current = [];
    stopRef.current();
    activeNoteRef.current = undefined;
    prevBeatRef.current = 0;
    startCtxTimeRef.current = ctx.currentTime;
    statusRef.current = 'playing';
    setNotes(quantized);
    setStatus('playing');
  }, [ctx]);

  const togglePlayback = useCallback(() => {
    if (statusRef.current === 'playing') {
      stopRef.current();
      activeNoteRef.current = undefined;
      statusRef.current = 'idle';
      setStatus('idle');
      setPlayheadBeat(0);
    } else if (notesRef.current.length > 0) {
      activeNoteRef.current = undefined;
      prevBeatRef.current = 0;
      startCtxTimeRef.current = ctx.currentTime;
      statusRef.current = 'playing';
      setStatus('playing');
    }
  }, [ctx]);

  const clearAll = useCallback(() => {
    stopRef.current();
    inFlightRef.current.clear();
    completedRawRef.current = [];
    notesRef.current = [];
    activeNoteRef.current = undefined;
    statusRef.current = 'idle';
    setNotes([]);
    setStatus('idle');
    setCountDown(0);
    setPlayheadBeat(0);
  }, []);

  // NoteOn always plays live AND records the note if recording is active.
  // This ensures the keyboard handler never needs to inspect bp.status.
  const noteOn = useCallback(
    (midiNote: number) => {
      if (statusRef.current === 'recording') {
        const beat =
          (ctx.currentTime - startCtxTimeRef.current) * bpmRef.current / 60;

        if (beat < loopBeats) {
          inFlightRef.current.set(midiNote, {midiNote, startBeat: beat});
        }
      }

      playNoteRef.current(midiNote);
    },
    [ctx],
  );

  const noteOff = useCallback(
    (midiNote: number) => {
      if (statusRef.current !== 'recording') {
        return;
      }

      const rawNote = inFlightRef.current.get(midiNote);

      if (!rawNote) {
        return;
      }

      const beat =
        (ctx.currentTime - startCtxTimeRef.current) * bpmRef.current / 60;
      completedRawRef.current.push({
        note: rawNote,
        endBeat: Math.min(beat, loopBeats),
      });
      inFlightRef.current.delete(midiNote);

      if (inFlightRef.current.size === 0) {
        stopRef.current();
      }
    },
    [ctx],
  );

  return {
    bpm,
    setBpm: updateBpm,
    status,
    notes,
    playheadBeat,
    countDown,
    startRecording,
    stopRecordingEarly,
    togglePlayback,
    clearAll,
    noteOn,
    noteOff,
  };
}

// ─── Piano Roll ───────────────────────────────────────────────────────────────

const rowHeight = 12;
const rollHeight = displayNoteCount * rowHeight; // 204
const labelWidth = 28;
const viewWidth = loopBeats * 100; // 1600 units (100 per quarter-note beat)

const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

type PianoRollProps = {
  notes: QuantizedNote[];
  playheadBeat: number;
  status: BeatProgrammerStatus;
};

function PianoRoll({notes, playheadBeat, status}: PianoRollProps) {
  const playheadX = (playheadBeat / loopBeats) * viewWidth;

  return (
    <div style={{display: 'flex', height: rollHeight}}>
      {/* Note label column */}
      <svg
        height={rollHeight}
        style={{flexShrink: 0}}
        viewBox={`0 0 ${labelWidth} ${rollHeight}`}
        width={labelWidth}
      >
        {Array.from({length: displayNoteCount}, (_, i) => {
          const midi = maxDisplayMidi - i;
          const y = i * rowHeight;
          const black = isBlackKey(midi);

          return (
            <g key={midi}>
              <rect
                fill={black ? '#1a1a1a' : '#222'}
                height={rowHeight}
                width={labelWidth}
                x={0}
                y={y}
              />
              <text
                fill='#555'
                fontFamily='monospace'
                fontSize={7}
                textAnchor='end'
                x={labelWidth - 2}
                y={y + rowHeight - 3}
              >
                {midiLabel(midi)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Roll area */}
      <svg
        height={rollHeight}
        preserveAspectRatio='none'
        style={{display: 'block'}}
        viewBox={`0 0 ${viewWidth} ${rollHeight}`}
        width='100%'
      >
        {/* Row backgrounds */}
        {Array.from({length: displayNoteCount}, (_, i) => {
          const midi = maxDisplayMidi - i;
          const black = isBlackKey(midi);

          return (
            <rect
              key={midi}
              fill={black ? '#111' : '#161616'}
              height={rowHeight}
              width={viewWidth}
              x={0}
              y={i * rowHeight}
            />
          );
        })}

        {/* Grid lines */}
        {Array.from({length: loopBeats * 2 + 1}, (_, i) => {
          const beat = i * 0.5;
          const x = (beat / loopBeats) * viewWidth;
          const isBarLine = beat % beatsPerBar === 0;
          const isBeatLine = beat % 1 === 0;

          return (
            <line
              key={i}
              stroke={isBarLine ? '#333' : isBeatLine ? '#222' : '#191919'}
              strokeWidth={isBarLine ? 2 : 1}
              x1={x}
              x2={x}
              y1={0}
              y2={rollHeight}
            />
          );
        })}

        {/* Bar numbers */}
        {Array.from({length: loopBars}, (_, i) => (
          <text
            key={i}
            fill='#333'
            fontFamily='monospace'
            fontSize={10}
            x={(i / loopBars) * viewWidth + 4}
            y={11}
          >
            {i + 1}
          </text>
        ))}

        {/* Notes */}
        {notes.map((note) => {
          const x = (note.startBeat / loopBeats) * viewWidth;
          const w = Math.max(
            4,
            (note.durationBeats / loopBeats) * viewWidth - 2,
          );
          const row = maxDisplayMidi - note.midiNote;
          const y = row * rowHeight + 1;
          const h = rowHeight - 2;

          return (
            <rect
              key={note.id}
              fill='#4ade80'
              height={h}
              opacity={0.9}
              rx={2}
              width={w}
              x={x}
              y={y}
            />
          );
        })}

        {/* Playhead */}
        {status !== 'idle' && status !== 'counting' && (
          <line
            opacity={0.8}
            stroke='#fff'
            strokeWidth={2}
            x1={playheadX}
            x2={playheadX}
            y1={0}
            y2={rollHeight}
          />
        )}
      </svg>
    </div>
  );
}

// ─── Transport button ─────────────────────────────────────────────────────────

type TransportButtonProps = {
  color: 'red' | 'green' | 'neutral';
  isActive?: boolean;
  isDisabled?: boolean;
  label: string;
  onClick: () => void;
};

function TransportButton({
  color,
  isActive,
  isDisabled,
  label,
  onClick,
}: TransportButtonProps) {
  const base =
    'px-3 py-1 text-xs font-mono rounded border transition-colors disabled:opacity-30 disabled:cursor-not-allowed';
  const colorClass = {
    red: isActive
      ? 'bg-red-500 text-white border-red-400'
      : 'text-red-400 border-red-900 hover:border-red-500',
    green: isActive
      ? 'bg-green-500 text-white border-green-400'
      : 'text-green-400 border-green-900 hover:border-green-500',
    neutral: 'text-neutral-400 border-neutral-700 hover:border-neutral-500',
  }[color];

  return (
    <button
      className={`${base} ${colorClass}`}
      disabled={isDisabled}
      type='button'
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ─── BeatProgrammer component ─────────────────────────────────────────────────

export type BeatProgrammerHandle = ReturnType<typeof useBeatProgrammer>;

type BeatProgrammerProps = {
  handle: BeatProgrammerHandle;
};

export function BeatProgrammer({handle}: BeatProgrammerProps) {
  const {
    bpm,
    setBpm,
    status,
    notes,
    playheadBeat,
    countDown,
    startRecording,
    stopRecordingEarly,
    togglePlayback,
    clearAll,
  } = handle;

  const bar = Math.floor(playheadBeat / beatsPerBar) + 1;
  const beatInBar = Math.floor(playheadBeat % beatsPerBar) + 1;
  const beatsLeft = Math.ceil(loopBeats - playheadBeat);
  const isRecordingOrCounting = status === 'recording' || status === 'counting';

  return (
    <div
      className='w-full max-w-xl flex flex-col gap-3 p-4 rounded-lg'
      style={{border: '1px solid #2a2a2a', backgroundColor: '#0d0d0d'}}
    >
      {/* Header */}
      <div className='flex items-center justify-between'>
        <span
          className='text-xs font-semibold tracking-widest uppercase'
          style={{color: '#737373'}}
        >
          Beat Programmer
        </span>
        <span className='text-xs font-mono' style={{color: '#525252'}}>
          {status === 'idle' || status === 'counting'
            ? '─ : ─'
            : `${bar} : ${beatInBar}`}
        </span>
      </div>

      {/* BPM row */}
      <div className='flex items-center gap-3'>
        <span className='text-xs w-8 shrink-0' style={{color: '#525252'}}>
          BPM
        </span>
        <input
          className='flex-1 h-1'
          max={240}
          min={40}
          step={1}
          type='range'
          value={bpm}
          onChange={(e) => {
            setBpm(Number(e.target.value));
          }}
        />
        <input
          className='w-12 text-xs font-mono text-right outline-none'
          max={240}
          min={40}
          style={{
            background: 'transparent',
            borderBottom: '1px solid #333',
            color: '#d4d4d4',
          }}
          type='number'
          value={bpm}
          onChange={(e) => {
            const v = Number(e.target.value);

            if (v >= 40 && v <= 240) {
              setBpm(v);
            }
          }}
        />
      </div>

      {/* Transport row */}
      <div className='flex items-center gap-2 flex-wrap'>
        {isRecordingOrCounting ? (
          <TransportButton
            isActive
            color='red'
            label='■ Stop Rec'
            onClick={stopRecordingEarly}
          />
        ) : (
          <TransportButton
            color='red'
            label='● Rec'
            onClick={startRecording}
          />
        )}
        <TransportButton
          color='green'
          isActive={status === 'playing'}
          isDisabled={notes.length === 0 && status !== 'playing'}
          label={status === 'playing' ? '■ Stop' : '▶ Play'}
          onClick={togglePlayback}
        />
        <TransportButton
          color='neutral'
          label='✕ Clear'
          onClick={clearAll}
        />

        {/* Count-in countdown */}
        {status === 'counting' && (
          <span
            className='ml-auto text-2xl font-bold font-mono animate-pulse'
            style={{color: '#f87171'}}
          >
            {countDown}
          </span>
        )}

        {/* Recording beat countdown */}
        {status === 'recording' && (
          <span
            className='text-xs font-mono ml-auto animate-pulse'
            style={{color: '#f87171'}}
          >
            {beatsLeft} beat{beatsLeft === 1 ? '' : 's'} left
          </span>
        )}
      </div>

      {/* Piano roll */}
      <div
        style={{
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid #1e1e1e',
        }}
      >
        <PianoRoll
          notes={notes}
          playheadBeat={playheadBeat}
          status={status}
        />
      </div>

      {/* Status hint */}
      <p className='text-xs' style={{color: '#404040'}}>
        {status === 'idle' && notes.length === 0
          ? 'Press Rec then play via Musical Typing or MIDI to record a 4-bar loop.'
          : status === 'counting'
            ? 'Count-in — get ready to play…'
            : status === 'recording'
              ? 'Recording — notes will be quantized to 1/8 notes on stop.'
              : `${notes.length} note${notes.length === 1 ? '' : 's'} recorded — quantized to 1/8 notes.`}
      </p>
    </div>
  );
}
