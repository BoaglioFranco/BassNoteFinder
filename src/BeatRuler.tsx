import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  NativeSelect,
  NumberInput,
  Paper,
  Text,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { LockKeyhole, Pencil, Play, Square } from 'lucide-react'
import {
  BeatRulerEngine,
  type BeatRulerCueSound,
  type BeatRulerPlaybackSettings,
} from './audio/beatRuler'
import {
  addBeatRulerNote,
  fitNotesToBar,
  moveBeatRulerNote,
  removeBeatRulerNote,
  fitNotesToGrid,
  resizeBeatRulerNote,
  snapSize,
  totalStepsForBar,
  totalStepsForPattern,
  validateBeatRulerNotes,
  type BeatRulerNote,
  type BeatRulerSnap,
} from './rhythm/beatRuler'
import { GRID_STEPS_PER_BEAT, type MetronomeSound } from './rhythm/pattern'
import { ToolPanelHeader } from './ToolPanelHeader'

type RulerMode = 'edit' | 'playback'

interface BeatRulerDocument {
  version: 1 | 2 | 3 | 4
  settings: BeatRulerPlaybackSettings
  snap: BeatRulerSnap
  notes: BeatRulerNote[]
}

const DEFAULT_SETTINGS: BeatRulerPlaybackSettings = {
  bpm: 80,
  beatsPerBar: 4,
  bars: 1,
  volume: 0.7,
  metronomeEnabled: true,
  metronomeSound: 'woodblock',
  cueEnabled: true,
  cueSound: 'bass',
}

const DEFAULT_NOTES: BeatRulerNote[] = [
  { id: 'note-0', startStep: 0, durationSteps: 4 },
  { id: 'note-6', startStep: 6, durationSteps: 2 },
  { id: 'note-8', startStep: 8, durationSteps: 4 },
  { id: 'note-14', startStep: 14, durationSteps: 2 },
]

const METRONOME_SOUNDS: ReadonlyArray<[MetronomeSound, string]> = [
  ['woodblock', 'Woodblock'], ['click', 'Electronic click'], ['drums', 'Drum kit'], ['hihat', 'Hi-hat'],
]

const CUE_SOUNDS: ReadonlyArray<[BeatRulerCueSound, string]> = [
  ['bass', 'Fingered bass'], ['pickedBass', 'Picked bass'], ['synthBass', 'Synth bass'],
]

function loadDocument(): BeatRulerDocument {
  try {
    const saved = JSON.parse(localStorage.getItem('bass-beat-ruler') ?? '') as Partial<BeatRulerDocument>
    if ((saved.version !== 1 && saved.version !== 2 && saved.version !== 3 && saved.version !== 4) || !saved.settings || !Array.isArray(saved.notes)) throw new Error('Unsupported document')
    const beatsPerBar = [2, 3, 4, 5, 6].includes(saved.settings.beatsPerBar) ? saved.settings.beatsPerBar : 4
    const bars = saved.version === 4 && [1, 2, 3, 4].includes(saved.settings.bars) ? saved.settings.bars : 1
    const totalSteps = totalStepsForPattern(beatsPerBar, bars)
    const notes = fitNotesToBar(saved.notes, totalSteps)
    if (validateBeatRulerNotes(notes, totalSteps).length) throw new Error('Invalid pattern')
    return {
      version: 4,
      settings: {
        bpm: Math.min(240, Math.max(30, Number(saved.settings.bpm) || 80)),
        beatsPerBar,
        bars,
        volume: Math.min(1, Math.max(0, Number(saved.settings.volume) || 0)),
        metronomeEnabled: saved.settings.metronomeEnabled !== false,
        metronomeSound: METRONOME_SOUNDS.some(([sound]) => sound === saved.settings?.metronomeSound) ? saved.settings.metronomeSound : 'woodblock',
        cueEnabled: saved.settings.cueEnabled !== false,
        cueSound: (saved.version === 3 || saved.version === 4) && CUE_SOUNDS.some(([sound]) => sound === saved.settings?.cueSound) ? saved.settings.cueSound : 'bass',
      },
      snap: saved.snap === 2 ? 2 : 4,
      notes,
    }
  } catch {
    return { version: 4, settings: DEFAULT_SETTINGS, snap: 4, notes: DEFAULT_NOTES }
  }
}

function stepLabel(step: number, beatsPerBar: number, bars: number) {
  const stepsPerBar = totalStepsForBar(beatsPerBar)
  const bar = Math.floor(step / stepsPerBar) + 1
  const stepWithinBar = step % stepsPerBar
  const beat = Math.floor(stepWithinBar / GRID_STEPS_PER_BEAT) + 1
  const part = ['', ' e', ' &', ' a'][step % GRID_STEPS_PER_BEAT]
  return bars === 1 ? `${beat}${part}` : `bar ${bar}, beat ${beat}${part}`
}

export default function BeatRuler() {
  const isCompactRuler = useMediaQuery('(max-width: 40.625em)')
  const [initial] = useState(loadDocument)
  const [settings, setSettings] = useState(initial.settings)
  const [tempoInput, setTempoInput] = useState<string | number>(initial.settings.bpm)
  const [snap, setSnap] = useState(initial.snap)
  const [notes, setNotes] = useState(initial.notes)
  const [mode, setMode] = useState<RulerMode>('edit')
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [playhead, setPlayhead] = useState<number | null>(null)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const engine = useRef<BeatRulerEngine | null>(null)
  const mounted = useRef(true)
  const drag = useRef<null | { kind: 'move' | 'resize', noteId: string, pointerOffsetSteps: number }>(null)
  const longPress = useRef<null | { pointerId: number, noteId: string, startX: number, startY: number, triggered: boolean, timer: ReturnType<typeof setTimeout> }>(null)
  const suppressGridClickUntil = useRef(0)
  const nextId = useRef(notes.reduce((largest, note) => Math.max(largest, Number(note.id.split('-').pop()) || 0), 0) + 1)
  const stepsPerBar = totalStepsForBar(settings.beatsPerBar)
  const totalSteps = totalStepsForPattern(settings.beatsPerBar, settings.bars)
  const gridUnit = snapSize(snap)
  const visibleGridSteps = Array.from({ length: totalSteps / gridUnit }, (_, index) => index * gridUnit)
  const barsPerRow = isCompactRuler ? 1 : 2
  const rulerRows = Array.from({ length: Math.ceil(settings.bars / barsPerRow) }, (_, rowIndex) => {
    const startBar = rowIndex * barsPerRow
    const bars = Math.min(barsPerRow, settings.bars - startBar)
    return {
      rowIndex,
      startBar,
      bars,
      startStep: startBar * stepsPerBar,
      steps: bars * stepsPerBar,
    }
  })

  const cancelLongPress = () => {
    if (longPress.current) clearTimeout(longPress.current.timer)
    longPress.current = null
  }

  useEffect(() => {
    localStorage.setItem('bass-beat-ruler', JSON.stringify({ version: 4, settings, snap, notes }))
    engine.current?.update(settings, notes)
  }, [settings, snap, notes])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      cancelLongPress()
      engine.current?.dispose()
    }
  }, [])

  const stop = () => {
    engine.current?.stop()
    setRunning(false)
    setPlayhead(null)
    setActiveNoteId(null)
  }

  const selectMode = (nextMode: RulerMode) => {
    if (nextMode === 'edit' && running) stop()
    setMode(nextMode)
  }

  const togglePlayback = async () => {
    if (running) {
      stop()
      return
    }
    setMode('playback')
    setStarting(true)
    setAudioError(null)
    engine.current ??= new BeatRulerEngine(settings, notes, (frame) => {
      setPlayhead(frame.gridStep)
      setActiveNoteId(frame.activeNoteId)
    })
    engine.current.update(settings, notes)
    try {
      const started = await engine.current.start()
      if (mounted.current && started) setRunning(true)
    } catch {
      engine.current.stop()
      if (mounted.current) setAudioError('Could not start playback. Reload the page and try again.')
    } finally {
      if (mounted.current) setStarting(false)
    }
  }

  const changeBeats = (beatsPerBar: number) => {
    const nextTotal = totalStepsForPattern(beatsPerBar, settings.bars)
    setSettings((current) => ({ ...current, beatsPerBar }))
    setNotes((current) => fitNotesToBar(current, nextTotal))
  }

  const changeBars = (bars: number) => {
    const nextTotal = totalStepsForPattern(settings.beatsPerBar, bars)
    setSettings((current) => ({ ...current, bars }))
    setNotes((current) => fitNotesToBar(current, nextTotal))
  }

  const changeGrid = (nextSnap: BeatRulerSnap) => {
    if (nextSnap === snap) return
    setNotes((current) => fitNotesToGrid(current, nextSnap, totalSteps))
    setSnap(nextSnap)
  }

  const changeTempoInput = (value: string | number) => {
    setTempoInput(value)
    if (value === '') return
    const bpm = Number(value)
    if (Number.isFinite(bpm) && bpm >= 30 && bpm <= 240) {
      setSettings((current) => ({ ...current, bpm }))
    }
  }

  const commitTempoInput = () => {
    const value = tempoInput === '' ? settings.bpm : Number(tempoInput)
    const bpm = Number.isFinite(value) ? Math.min(240, Math.max(30, value)) : settings.bpm
    setTempoInput(bpm)
    setSettings((current) => current.bpm === bpm ? current : { ...current, bpm })
  }

  const addNote = (step: number) => {
    if (mode !== 'edit') return
    setNotes((current) => addBeatRulerNote(current, step, snap, totalSteps, `note-${nextId.current++}`))
  }

  const resizeFromPointer = (clientX: number, track: HTMLElement | null, rowStartStep: number, rowSteps: number) => {
    const currentDrag = drag.current
    if (!currentDrag || !track || mode !== 'edit') return
    const rect = track.getBoundingClientRect()
    if (!rect.width) return
    const pointerStep = rowStartStep + ((clientX - rect.left) / rect.width) * rowSteps
    if (currentDrag.kind === 'resize') {
      setNotes((current) => resizeBeatRulerNote(current, currentDrag.noteId, pointerStep, snap, totalSteps))
    } else {
      setNotes((current) => moveBeatRulerNote(current, currentDrag.noteId, pointerStep - currentDrag.pointerOffsetSteps, snap, totalSteps))
    }
  }

  return <Container size="lg" w="100%" px={{ base: 'sm', sm: 'md' }}><Paper component="section" className="beat-ruler" withBorder shadow="xs" bg="white" style={{ overflow: 'hidden' }} aria-label="Beat Ruler">
    <ToolPanelHeader title="BEAT RULER" status={<Badge color={running ? 'green' : mode === 'edit' ? 'myColor' : 'gray'} variant="light">
        {starting ? 'Loading sounds' : running ? 'Playing' : mode === 'edit' ? 'Editing' : 'Ready'}
      </Badge>} />

    <Group className="ruler-toolbar" mih={76} px={{ base: 14, sm: 22 }} py={16} justify="space-between" align="flex-end" gap="md" wrap="nowrap">
      <Button.Group aria-label="Ruler mode">
        <Button type="button" leftSection={<Pencil size={15} />} variant={mode === 'edit' ? 'filled' : 'default'} className={mode === 'edit' ? 'selected' : ''} onClick={() => selectMode('edit')}>Edit</Button>
        <Button type="button" leftSection={<Play size={15} />} variant={mode === 'playback' ? 'filled' : 'default'} className={mode === 'playback' ? 'selected' : ''} onClick={() => selectMode('playback')}>Playback</Button>
      </Button.Group>
      <NumberInput className="compact-tempo" label="BPM" aria-label="Beat ruler tempo in BPM" role="spinbutton" min={30} max={240}
        value={tempoInput} clampBehavior="none" allowDecimal={false} allowNegative={false} inputMode="numeric" hideControls
        onChange={changeTempoInput} onBlur={commitTempoInput} />
    </Group>

    <div className="ruler-track-stack" data-total-bars={settings.bars}
      aria-label={`${settings.bars} ${settings.bars === 1 ? 'bar' : 'bars'}, ${settings.beatsPerBar} beats per bar, ${snap === 2 ? 'eighth' : 'sixteenth'}-note grid`}>
      {rulerRows.map((row) => <div key={row.rowIndex}
        className={`beat-ruler-track ${mode}`}
        data-testid={row.rowIndex === 0 ? 'beat-ruler-track' : `beat-ruler-track-row-${row.rowIndex + 1}`}
        data-row-bars={row.bars}
        onPointerMove={(event) => {
          const pending = longPress.current
          if (pending?.pointerId === event.pointerId && !pending.triggered && Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 8) {
            cancelLongPress()
          }
          resizeFromPointer(event.clientX, event.currentTarget, row.startStep, row.steps)
        }}
        onPointerUp={(event) => {
          const pending = longPress.current
          if (pending?.pointerId === event.pointerId && pending.triggered) {
            suppressGridClickUntil.current = performance.now() + 500
            setNotes((current) => removeBeatRulerNote(current, pending.noteId))
          }
          cancelLongPress()
          drag.current = null
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        }}
        onPointerCancel={() => {
          cancelLongPress()
          drag.current = null
        }}>
        <div className="ruler-grid">
          {visibleGridSteps.filter((step) => step >= row.startStep && step < row.startStep + row.steps).map((step) => <button
            key={step}
            type="button"
            className={`${step % GRID_STEPS_PER_BEAT === 0 ? 'beat' : ''} ${step % stepsPerBar === 0 ? 'bar-start' : ''}`}
            aria-label={`Add note at ${stepLabel(step, settings.beatsPerBar, settings.bars)}`}
            disabled={mode !== 'edit'}
            onClick={(event) => {
              if (performance.now() < suppressGridClickUntil.current) {
                event.preventDefault()
                suppressGridClickUntil.current = 0
                return
              }
              addNote(step)
            }}
          ><span>{step % GRID_STEPS_PER_BEAT === 0 ? Math.floor((step % stepsPerBar) / GRID_STEPS_PER_BEAT) + 1 : ['e', '&', 'a'][step % GRID_STEPS_PER_BEAT - 1]}</span></button>)}
        </div>
        <div className="ruler-bar-labels" aria-hidden="true">
          {Array.from({ length: row.bars }, (_, index) => <span key={index}>BAR {row.startBar + index + 1}</span>)}
        </div>
        <div className="ruler-notes">
          {notes.flatMap((note) => {
            const fragmentStart = Math.max(note.startStep, row.startStep)
            const fragmentEnd = Math.min(note.startStep + note.durationSteps, row.startStep + row.steps)
            if (fragmentStart >= fragmentEnd) return []
            const includesAttack = note.startStep >= row.startStep
            const includesRelease = note.startStep + note.durationSteps <= row.startStep + row.steps
            return <div
              key={`${note.id}-${row.rowIndex}`}
              className={`ruler-note ${includesAttack ? '' : 'continuation'} ${activeNoteId === note.id ? 'active' : ''}`}
              data-testid={includesAttack ? `ruler-note-${note.id}` : `ruler-note-${note.id}-continuation-${row.rowIndex}`}
              aria-label={`${includesAttack ? 'Note' : 'Continuation of note'} at ${stepLabel(note.startStep, settings.beatsPerBar, settings.bars)}, ${note.durationSteps} sixteenth-note steps`}
              role={mode === 'edit' && includesAttack ? 'button' : undefined}
              tabIndex={mode === 'edit' && includesAttack ? 0 : undefined}
              style={{ left: `${(fragmentStart - row.startStep) / row.steps * 100}%`, width: `${(fragmentEnd - fragmentStart) / row.steps * 100}%` } as CSSProperties}
              onPointerDown={(event) => {
                if (mode !== 'edit' || event.button !== 0) return
                const track = event.currentTarget.closest<HTMLElement>('.beat-ruler-track')
                const rect = track?.getBoundingClientRect()
                if (!track || !rect?.width) return
                const pointerStep = row.startStep + ((event.clientX - rect.left) / rect.width) * row.steps
                drag.current = { kind: 'move', noteId: note.id, pointerOffsetSteps: pointerStep - note.startStep }
                track.setPointerCapture?.(event.pointerId)
                if (event.pointerType === 'touch' || event.pointerType === 'pen') {
                  cancelLongPress()
                  const pointerId = event.pointerId
                  const startX = event.clientX
                  const startY = event.clientY
                  const timer = setTimeout(() => {
                    const pending = longPress.current
                    if (pending?.pointerId !== pointerId) return
                    pending.triggered = true
                    drag.current = null
                  }, 550)
                  longPress.current = { pointerId, noteId: note.id, startX, startY, triggered: false, timer }
                }
              }}
              onKeyDown={(event) => {
                if (mode !== 'edit' || !includesAttack || (event.key !== 'Delete' && event.key !== 'Backspace')) return
                event.preventDefault()
                setNotes((current) => removeBeatRulerNote(current, note.id))
              }}
              onContextMenu={(event) => {
                event.preventDefault()
                if (mode !== 'edit') return
                if (longPress.current) {
                  longPress.current.triggered = true
                  drag.current = null
                } else {
                  setNotes((current) => removeBeatRulerNote(current, note.id))
                }
              }}>
              {includesAttack && <b aria-hidden="true">×</b>}
              <span />
              {mode === 'edit' && includesRelease && <button type="button" className="note-resize" aria-label={`Resize note at ${stepLabel(note.startStep, settings.beatsPerBar, settings.bars)}`}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  drag.current = { kind: 'resize', noteId: note.id, pointerOffsetSteps: 0 }
                  event.currentTarget.closest<HTMLElement>('.beat-ruler-track')?.setPointerCapture?.(event.pointerId)
                }}
              />}
            </div>
          })}
        </div>
        {playhead !== null && playhead >= row.startStep && playhead < row.startStep + row.steps && <i className="ruler-playhead" data-testid="ruler-playhead"
          style={{ left: `${(playhead - row.startStep) / row.steps * 100}%` } as CSSProperties} />}
      </div>)}
    </div>

    <Text className="ruler-help" c="dimmed" size="xs">Tap to add · drag a note to move · drag its right edge to resize · press and hold to delete</Text>

    <div className="ruler-options">
      <section className={`ruler-settings-section ruler-edit-settings ${mode === 'playback' ? 'is-locked' : ''}`} aria-label="Rhythm settings">
        <div className="ruler-section-heading">
          <span>PATTERN</span>
          {mode === 'playback' && <Badge size="xs" variant="light" color="gray" leftSection={<LockKeyhole size={10} />}>Locked</Badge>}
        </div>
        <div className="ruler-rhythm-controls">
          <fieldset aria-label="Grid resolution" disabled={mode !== 'edit'}>
            <legend>GRID</legend>
            <Button.Group>
              <Button size="sm" type="button" variant={snap === 2 ? 'filled' : 'default'} className={snap === 2 ? 'selected' : ''} onClick={() => changeGrid(2)}>Eighth</Button>
              <Button size="sm" type="button" variant={snap === 4 ? 'filled' : 'default'} className={snap === 4 ? 'selected' : ''} onClick={() => changeGrid(4)}>16th</Button>
            </Button.Group>
          </fieldset>
          <NativeSelect label="BEATS PER BAR" value={String(settings.beatsPerBar)} disabled={mode !== 'edit'} onChange={(event) => changeBeats(Number(event.target.value))}
            data={[2, 3, 4, 5, 6].map(String)} />
          <NativeSelect className="ruler-bars-control" label="BARS" value={String(settings.bars)} disabled={mode !== 'edit'} onChange={(event) => changeBars(Number(event.target.value))}
            data={[1, 2, 3, 4].map(String)} />
        </div>
      </section>

      <section className="ruler-settings-section ruler-playback-settings" aria-label="Playback settings">
        <div className="ruler-section-heading">
          <span>PLAYBACK</span>
        </div>
        <div className="ruler-playback-controls">
          <div className="ruler-sound-control">
            <Checkbox className="channel-toggle" aria-label="Sound metronome" label="On" checked={settings.metronomeEnabled}
              onChange={(event) => {
                const metronomeEnabled = event.currentTarget.checked
                setSettings((current) => ({ ...current, metronomeEnabled }))
              }} />
            <NativeSelect label="METRONOME" id="ruler-metronome-sound" value={settings.metronomeSound} disabled={!settings.metronomeEnabled}
              onChange={(event) => setSettings((current) => ({ ...current, metronomeSound: event.target.value as MetronomeSound }))}
              data={METRONOME_SOUNDS.map(([value, label]) => ({ value, label }))} />
          </div>
          <div className="ruler-sound-control">
            <Checkbox className="channel-toggle" aria-label="Sound ruler notes" label="On" checked={settings.cueEnabled}
              onChange={(event) => {
                const cueEnabled = event.currentTarget.checked
                setSettings((current) => ({ ...current, cueEnabled }))
              }} />
            <NativeSelect label="RULER CUE" id="ruler-cue-sound" value={settings.cueSound} disabled={!settings.cueEnabled}
              onChange={(event) => setSettings((current) => ({ ...current, cueSound: event.target.value as BeatRulerCueSound }))}
              data={CUE_SOUNDS.map(([value, label]) => ({ value, label }))} />
          </div>
          <label className="volume-control">VOLUME
            <span><input aria-label="Beat ruler volume" type="range" min="0" max="1" step="0.01" value={settings.volume}
              onChange={(event) => setSettings((current) => ({ ...current, volume: Number(event.target.value) }))} />
              <output>{Math.round(settings.volume * 100)}%</output></span>
          </label>
        </div>
      </section>
    </div>

    {audioError && <Alert mx="lg" mb="md" color="red" role="alert">{audioError}</Alert>}
    <div className="ruler-transport">
      <Button className="primary-button ruler-start" size="md" type="button" loading={starting} onClick={() => void togglePlayback()}
        leftSection={running ? <Square size={16} fill="currentColor" /> : <Play size={17} fill="currentColor" />}>
        {starting ? 'Loading…' : running ? 'Stop' : 'Start'}
      </Button>
    </div>
  </Paper></Container>
}
