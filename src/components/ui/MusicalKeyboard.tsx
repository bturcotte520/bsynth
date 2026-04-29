'use client';
import {midiToKey} from '@/utils/keyboard/musicalTyping';

// Show C4 (60) through B5 (83) — two full octaves
const startMidi = 60;
const endMidi = 83;

const whiteKeyWidth = 36;
const whiteKeyHeight = 112;
const blackKeyWidth = 22;
const blackKeyHeight = 68;

// For each note-in-octave (0–11), the x position in white-key units from C.
// White keys land on integer positions; black keys share the integer of the
// white key to their right and are shifted left by blackKeyWidth/2 at render.
const noteOffsets = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

const isBlackNote = [
  false, true, false, true, false,
  false, true, false, true, false, true, false,
];

type KeyData = {
  midi: number;
  isBlack: boolean;
  left: number;
  label: string;
};

function buildKeys(): KeyData[] {
  const keys: KeyData[] = [];

  for (let midi = startMidi; midi <= endMidi; midi++) {
    const noteInOctave = midi % 12;
    const octave = Math.floor((midi - startMidi) / 12);
    const isBlack = isBlackNote[noteInOctave];
    const xUnits = octave * 7 + noteOffsets[noteInOctave];
    const left = isBlack
      ? xUnits * whiteKeyWidth - blackKeyWidth / 2
      : xUnits * whiteKeyWidth;
    const label = midiToKey[midi] ?? '';

    keys.push({midi, isBlack, left, label});
  }

  return keys;
}

const allKeys = buildKeys();
const whiteKeys = allKeys.filter((k) => !k.isBlack);
const blackKeys = allKeys.filter((k) => k.isBlack);

// 14 white keys across 2 octaves
const totalWidth = 14 * whiteKeyWidth;

export type MusicalKeyboardProps = {
  pressedMidiNotes: ReadonlySet<number>;
  onClose: () => void;
};

export function MusicalKeyboard({
  pressedMidiNotes,
  onClose,
}: MusicalKeyboardProps) {
  return (
    // Pointer-events:none lets clicks pass through to the synth controls below
    <div
      className='fixed inset-0 z-50 flex items-end justify-center pb-6'
      style={{pointerEvents: 'none'}}
    >
      <div
        className='flex flex-col gap-3 rounded-2xl p-5 shadow-2xl'
        style={{
          border: '1px solid #d4c8b8',
          backgroundColor: '#ede6de',
          pointerEvents: 'auto',
          boxShadow: '4px 4px 16px rgba(0,0,0,0.1), -1px -1px 4px rgba(255,255,255,0.3)',
        }}
      >
        <div className='flex items-center justify-between gap-8'>
          <span
            className='text-xs font-semibold tracking-widest uppercase'
            style={{color: '#2a2018'}}
          >
            Musical Typing
          </span>
          <button
            className='text-xs px-3 py-1 rounded-lg font-medium'
            style={{color: '#6a5a4a', border: '1px solid #c4b8a8', backgroundColor: '#e5ddd3'}}
            type='button'
            onClick={onClose}
          >
            close
          </button>
        </div>

        <div
          className='relative overflow-x-auto'
          style={{width: totalWidth, height: whiteKeyHeight}}
        >
          {whiteKeys.map((key) => (
            <PianoKey
              key={key.midi}
              keyData={key}
              isPressed={pressedMidiNotes.has(key.midi)}
            />
          ))}
          {blackKeys.map((key) => (
            <PianoKey
              key={key.midi}
              keyData={key}
              isPressed={pressedMidiNotes.has(key.midi)}
            />
          ))}
        </div>

        <p className='text-center text-xs' style={{color: '#8a7a6a'}}>
          Keys shown on the piano correspond to your keyboard
        </p>
      </div>
    </div>
  );
}

function PianoKey({
  keyData,
  isPressed,
}: {
  keyData: KeyData;
  isPressed: boolean;
}) {
  const {isBlack, left, label} = keyData;

  const width = isBlack ? blackKeyWidth : whiteKeyWidth - 1;
  const height = isBlack ? blackKeyHeight : whiteKeyHeight;
  const zIndex = isBlack ? 2 : 1;

  let bg: string;
  if (isBlack) {
    bg = isPressed ? '#c4652a' : '#6a5a4a';
  } else {
    bg = isPressed ? '#d4894a' : '#f5f0eb';
  }

  const labelColor = isPressed
    ? isBlack
      ? '#f5f0eb'
      : '#2a2018'
    : isBlack
      ? '#c4b8a8'
      : '#8a7a6a';

  return (
    <div
      style={{
        position: 'absolute',
        left,
        width,
        height,
        zIndex,
        backgroundColor: bg,
        border: isBlack ? '1px solid #8a7a6a' : '1px solid #c4b8a8',
        borderRadius: '0 0 8px 8px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 4,
        transition: 'background-color 60ms',
        boxShadow: isBlack
          ? `2px 2px 6px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.1)`
          : `inset 2px 2px 4px rgba(0,0,0,0.05), inset -1px -1px 2px rgba(255,255,255,0.3)`,
      }}
    >
      {label && (
        <span
          style={{
            fontSize: isBlack ? 9 : 10,
            fontFamily: 'monospace',
            fontWeight: 700,
            color: labelColor,
            textTransform: 'uppercase',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
