'use client';
import {useCallback, useEffect, useRef, useState} from 'react';
import {keyToMidi} from '@/utils/keyboard/musicalTyping';
import {MusicalKeyboard} from '@/components/ui/MusicalKeyboard';
import {useBeatProgrammer, BeatProgrammer} from './BeatProgrammer';
import WebAudioRenderer from '@elemaudio/web-renderer';
import {el} from '@elemaudio/core';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '@/../tailwind.config';
import {
  LinearSmoothedValueRealtime,
  clamp,
  dbMin,
  gainToDecibels,
  mapTo01Linear,
} from '@/utils/math';
import {midiNoteToFreq} from '@/utils/math/midi';
import {keyCodes} from '@/constants/key-codes';
import {useElConst} from '@/components/hooks/useElConst';
import {useElConstBool} from '@/components/hooks/useElConstBool';
import {Meter} from '@/components/ui/Meter';
import {KnobPercentage} from '@/components/ui/KnobPercentage';
import {KnobAdr} from '@/components/ui/KnobAdr';
import {KnobFrequency} from '@/components/ui/KnobFrequency';
import {InteractionArea} from '@/components/ui/InteractionArea';
import {PlayIcon} from '@/components/icons';
import {title} from './constants';
import {SynthContainer} from './SynthContainer';
import {SynthPageSkeleton} from './SynthPageSkeleton';
import {KnobsLayout} from './KnobsLayout';
import {SynthPageLayout} from './SynthPageLayout';
import {MidiSelector} from './MidiSelector';

const {colors} = resolveConfig(tailwindConfig).theme;

export function SynthPage() {
  const [isReady, setIsReady] = useState<boolean>(false);

  const ctxRef = useRef<AudioContext>();
  const coreRef = useRef<WebAudioRenderer>();

  useEffect(() => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }

    if (!coreRef.current) {
      coreRef.current = new WebAudioRenderer();
    }

    const ctx = ctxRef.current;
    const core = coreRef.current;

    (async () => {
      const node = await core.initialize(ctx);
      node.connect(ctx.destination);
    })();

    let timeoutId: ReturnType<typeof setTimeout>;

    core.on('load', () => {
      timeoutId = setTimeout(() => {
        setIsReady(true);
      }, 500); // Giving 0.5s more, so UI won't be janky when this component lazy-loaded very quickly.
    });

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  if (!isReady) {
    return <SynthPageSkeleton />;
  }

  const ctx = ctxRef.current;
  const core = coreRef.current;

  if (!ctx) {
    throw new Error("Audio context wasn't initialized properly");
  }

  if (!core) {
    throw new Error("Elementary core wasn't initialized properly");
  }

  return <SynthPageMain ctx={ctx} core={core} />;
}

type SynthPageMainProps = {
  ctx: AudioContext;
  core: WebAudioRenderer;
};

function SynthPageMain({ctx, core}: SynthPageMainProps) {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);
  const [pressedMidiNotes, setPressedMidiNotes] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const heldMidiNotes = useRef<Set<number>>(new Set());

  const gateKey = 'gate';
  const gateDefault = false;
  const gateConst = useElConstBool(gateKey, gateDefault);

  const freqKey = 'freq';
  const freqDefault = 440;
  const freqConst = useElConst(freqKey, freqDefault);
  const [freq, setFreq] = useState<number>(freqDefault);

  const attackKey = 'attack';
  const attackDefault = 0.001;
  const attackConst = useElConst(attackKey, attackDefault);

  const decayKey = 'decay';
  const decayDefault = 0.6;
  const decayConst = useElConst(decayKey, decayDefault);

  const sustainKey = 'sustain';
  const sustainDefault = 0.7;
  const sustainConst = useElConst(sustainKey, sustainDefault);

  const releaseKey = 'release';
  const releaseDefault = 0.6;
  const releaseConst = useElConst(releaseKey, releaseDefault);

  const meterLeftSource = 'meter:left';
  const meterRightSource = 'meter:right';

  const meterLeftRef = useRef<HTMLCanvasElement>(null);
  const meterRightRef = useRef<HTMLCanvasElement>(null);

  useMeter({core, meterRef: meterLeftRef, source: meterLeftSource});
  useMeter({core, meterRef: meterRightRef, source: meterRightSource});

  const renderAudio = useCallback(async () => {
    if (ctx.state !== 'running') {
      await ctx.resume();
    }

    const gate = gateConst.get();
    const freq = freqConst.get();
    const attack = attackConst.get();
    const decay = decayConst.get();
    const sustain = sustainConst.get();
    const release = releaseConst.get();
    const envelope = el.adsr(attack, decay, sustain, release, gate);
    const sine = el.cycle(freq);
    const out = el.mul(envelope, sine);
    core.render(
      el.meter({name: meterLeftSource}, out),
      el.meter({name: meterRightSource}, out),
    );
  }, [
    ctx,
    core,
    gateConst,
    freqConst,
    attackConst,
    decayConst,
    sustainConst,
    releaseConst,
  ]);

  const play = useCallback(() => {
    gateConst.update(true);
    void renderAudio();
  }, [gateConst, renderAudio]);

  const stop = useCallback(() => {
    gateConst.update(false);
    void renderAudio();
  }, [gateConst, renderAudio]);

  const playNote = useCallback(
    (midiNote: number) => {
      const value = midiNoteToFreq(midiNote);
      freqConst.update(value);
      setFreq(value);
      play();
    },
    [freqConst, play],
  );

  const bp = useBeatProgrammer({ctx, playNote, stop});

  // Refs so the keyboard useEffect closure stays fresh without re-running at 60fps
  const bpStatusRef = useRef(bp.status);
  bpStatusRef.current = bp.status;
  const bpNoteOnRef = useRef(bp.noteOn);
  bpNoteOnRef.current = bp.noteOn;
  const bpNoteOffRef = useRef(bp.noteOff);
  bpNoteOffRef.current = bp.noteOff;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Cmd+K — toggle musical keyboard
      if (event.metaKey && event.key === 'k') {
        event.preventDefault();
        setIsKeyboardOpen((open) => {
          if (open) {
            // Closing: release any held notes
            heldMidiNotes.current.clear();
            setPressedMidiNotes(new Set());
            stop();
          }

          return !open;
        });
        return;
      }

      if (event.repeat) {
        // Skip 2nd+ event if key is being held down already
        return;
      }

      // Space bar — play current frequency
      if (event.code === keyCodes.space) {
        play();
        return;
      }

      // Musical typing — only active when the keyboard overlay is open
      if (isKeyboardOpen && !event.metaKey && !event.ctrlKey && !event.altKey) {
        // Escape closes the overlay
        if (event.key === 'Escape') {
          heldMidiNotes.current.clear();
          setPressedMidiNotes(new Set());
          stop();
          setIsKeyboardOpen(false);
          return;
        }

        const midi = keyToMidi[event.key.toLowerCase()];
        if (midi !== undefined) {
          event.preventDefault();
          heldMidiNotes.current.add(midi);
          setPressedMidiNotes(new Set(heldMidiNotes.current));
          // NoteOn always plays live and records if the beat programmer is active
          bpNoteOnRef.current(midi);
        }
      }
    };

    const resumeLastHeldNote = () => {
      const held = Array.from(heldMidiNotes.current);
      const lastHeld = held[held.length - 1];

      if (lastHeld !== undefined) {
        playNote(lastHeld);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === keyCodes.space) {
        stop();
        return;
      }

      if (isKeyboardOpen) {
        const midi = keyToMidi[event.key.toLowerCase()];
        if (midi !== undefined) {
          heldMidiNotes.current.delete(midi);
          setPressedMidiNotes(new Set(heldMidiNotes.current));

          // NoteOff records the note-end when recording (and stops audio if last)
          bpNoteOffRef.current(midi);

          // For non-recording states, manage the live audio stop/resume
          if (bpStatusRef.current !== 'recording') {
            if (heldMidiNotes.current.size === 0) {
              stop();
            } else {
              resumeLastHeldNote();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [play, stop, playNote, isKeyboardOpen]);

  const midiNoteOn = useCallback((midi: number) => {
    // NoteOn always plays live and records if the beat programmer is recording
    bpNoteOnRef.current(midi);
  }, []);

  const midiNoteOff = useCallback(
    (midi: number) => {
      bpNoteOffRef.current(midi);

      // For non-recording states, stop the live audio
      if (bpStatusRef.current !== 'recording') {
        stop();
      }
    },
    [stop],
  );

  return (
    <SynthPageLayout
      topPanel={<MidiSelector playNote={midiNoteOn} stopNote={midiNoteOff} />}
    >
      <SynthContainer
        isEnabled
        title={title}
        meterLeft={<Meter ref={meterLeftRef} />}
        meterRight={<Meter ref={meterRightRef} />}
      >
        <KnobsLayout>
          <KnobInput
            isLarge
            title='Frequency'
            kind='frequency'
            defaultValue={freqDefault}
            value={freq}
            onChange={(newValue) => {
              freqConst.update(newValue);
              void renderAudio();
              setFreq(newValue);
            }}
          />
          <KnobInput
            title='Attack'
            kind='adr'
            defaultValue={attackDefault}
            onChange={(newValue) => {
              attackConst.update(newValue);
              void renderAudio();
            }}
          />
          <KnobInput
            title='Decay'
            kind='adr'
            defaultValue={decayDefault}
            onChange={(newValue) => {
              decayConst.update(newValue);
              void renderAudio();
            }}
          />
          <KnobInput
            title='Sustain'
            kind='percentage'
            defaultValue={sustainDefault}
            onChange={(newValue) => {
              sustainConst.update(newValue);
              void renderAudio();
            }}
          />
          <KnobInput
            title='Release'
            kind='adr'
            defaultValue={releaseDefault}
            onChange={(newValue) => {
              releaseConst.update(newValue);
              void renderAudio();
            }}
          />
        </KnobsLayout>
      </SynthContainer>
      <div className='flex w-full flex-col items-center gap-4 pb-8'>
        <BeatProgrammer handle={bp} />
        <InteractionArea
          icon={<PlayIcon />}
          title="Touch here to play or press the 'Space' key."
          onTouchStart={play}
          onTouchEnd={stop}
          onMouseDown={play}
          onMouseUp={stop}
        />
        <button
          type='button'
          className='text-xs text-gray-5 transition-colors hover:text-gray-4'
          onClick={() => {
            setIsKeyboardOpen((open) => !open);
          }}
        >
          {isKeyboardOpen ? 'Close Musical Typing' : 'Musical Typing  ⌘K'}
        </button>
        {isKeyboardOpen && (
          <MusicalKeyboard
            pressedMidiNotes={pressedMidiNotes}
            onClose={() => {
              heldMidiNotes.current.clear();
              setPressedMidiNotes(new Set());
              stop();
              setIsKeyboardOpen(false);
            }}
          />
        )}
      </div>
    </SynthPageLayout>
  );
}

type KnobInputKind = 'percentage' | 'adr' | 'frequency';
type KnobInputProps = {
  isLarge?: boolean;
  kind: KnobInputKind;
  title: string;
  defaultValue: number;
  value?: number;
  onChange: (newValue: number) => void;
};
function KnobInput({
  isLarge,
  kind,
  title,
  defaultValue,
  value: valueFromProps,
  onChange,
}: KnobInputProps) {
  const [value, setValue] = useState<number>(defaultValue);
  const KnobComponent = resolveKnobComponent(kind);
  return (
    <KnobComponent
      isLarge={isLarge}
      title={title}
      value={valueFromProps ?? value}
      defaultValue={defaultValue}
      onChange={(newValue) => {
        setValue(newValue);
        onChange(newValue);
      }}
    />
  );
}

const resolveKnobComponent = (kind: KnobInputKind) => {
  switch (kind) {
    case 'percentage':
      return KnobPercentage;
    case 'adr':
      return KnobAdr;
    case 'frequency':
      return KnobFrequency;
    default:
      throw new Error('Unknown knob kind', kind);
  }
};

const useMeter = ({
  core,
  meterRef,
  source,
}: {
  core: WebAudioRenderer;
  meterRef: React.RefObject<HTMLCanvasElement>;
  source: string;
}) => {
  useEffect(() => {
    const canvas = meterRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const volumeDbMin = dbMin;
    const volumeDbMax = 0;
    const volumeDb = new LinearSmoothedValueRealtime({
      currentValue: volumeDbMin,
      targetValue: volumeDbMin,
      rampDurationInMilliseconds: 300,
    });

    type MeterEvent = {
      source?: string;
      min: number;
      max: number;
    };

    core.on('meter', (event: MeterEvent) => {
      if (event.source !== source) {
        return;
      }

      const {min, max} = event;
      const gain = Math.max(Math.abs(min), Math.abs(max));
      const db = clamp(gainToDecibels(gain), volumeDbMin, volumeDbMax);
      if (volumeDb.getCurrentValue() < db) {
        volumeDb.setCurrentAndTargetValue(db);
      } else {
        volumeDb.setTargetValue(db);
      }
    });

    let rafHandle: number | undefined;

    ctx.fillStyle = colors.green;

    const drawMeter = () => {
      const {width, height} = canvas;
      ctx.clearRect(0, 0, width, height);

      const volume01 = mapTo01Linear(
        clamp(volumeDb.getCurrentValue(), volumeDbMin, volumeDbMax),
        volumeDbMin,
        volumeDbMax,
      );
      const meterHeight = height * volume01;
      ctx.fillRect(0, height - meterHeight, width, meterHeight);

      rafHandle = requestAnimationFrame(drawMeter);
    };

    rafHandle = requestAnimationFrame(drawMeter);

    return () => {
      if (rafHandle) {
        cancelAnimationFrame(rafHandle);
      }
    };
  }, [core, meterRef, source]);
};
