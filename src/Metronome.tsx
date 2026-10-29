import { useEffect, useRef, useState } from 'react'
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
  Stack,
  Text,
} from '@mantine/core'
import { Minus, Play, Plus, Square } from 'lucide-react'
import {
  MetronomeEngine,
  type MetronomeSound,
  type MetronomeSettings,
  type Subdivision,
} from './audio/metronome'
import { GRID_STEPS_PER_BEAT } from './rhythm/pattern'

const DEFAULT_SETTINGS: MetronomeSettings = {
  bpm: 80,
  beatsPerBar: 4,
  subdivision: 1,
  accentFirstBeat: true,
  volume: 0.7,
  sound: 'woodblock',
}

const SOUNDS: ReadonlyArray<[MetronomeSound, string]> = [
  ['woodblock', 'Woodblock'],
  ['click', 'Electronic click'],
  ['drums', 'Drum kit'],
  ['hihat', 'Hi-hat'],
]

function savedSettings(): MetronomeSettings {
  try {
    const value = JSON.parse(localStorage.getItem('bass-metronome-settings') ?? '') as Partial<MetronomeSettings> & { soundVersion?: number }
    const subdivision = value.subdivision === 2 || value.subdivision === 4 ? value.subdivision : 1
    // Before soundVersion 2, the app wrote "click" automatically even when the
    // user had never chosen a sound. Migrate those settings to the new default.
    const sound = value.soundVersion === 2 && SOUNDS.some(([id]) => id === value.sound)
      ? value.sound as MetronomeSound
      : 'woodblock'
    const savedVolume = Number(value.volume)
    return {
      bpm: Math.min(240, Math.max(30, Number(value.bpm) || DEFAULT_SETTINGS.bpm)),
      beatsPerBar: [2, 3, 4, 5, 6].includes(Number(value.beatsPerBar)) ? Number(value.beatsPerBar) : 4,
      subdivision,
      accentFirstBeat: value.accentFirstBeat !== false,
      volume: Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : DEFAULT_SETTINGS.volume,
      sound,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export default function Metronome() {
  const [settings, setSettings] = useState(savedSettings)
  const [running, setRunning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<number | null>(null)
  const engine = useRef<MetronomeEngine | null>(null)
  const settingsRef = useRef(settings)
  const mounted = useRef(true)

  useEffect(() => {
    settingsRef.current = settings
    localStorage.setItem('bass-metronome-settings', JSON.stringify({ ...settings, soundVersion: 2 }))
    engine.current?.update(settings)
  }, [settings])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      engine.current?.dispose()
    }
  }, [])

  const toggle = async () => {
    if (running) {
      engine.current?.stop()
      setRunning(false)
      setActiveStep(null)
      return
    }
    setStarting(true)
    setAudioError(null)
    engine.current ??= new MetronomeEngine(settings, (tick) => {
      const spacing = GRID_STEPS_PER_BEAT / settingsRef.current.subdivision
      if (tick.gridStep % spacing === 0) setActiveStep(tick.gridStep / spacing)
    })
    engine.current.update(settings)
    try {
      const started = await engine.current.start()
      if (mounted.current && started) setRunning(true)
    } catch {
      engine.current.stop()
      if (mounted.current) setAudioError('Could not start the audio engine. Reload the page and try again.')
    } finally {
      if (mounted.current) setStarting(false)
    }
  }

  const adjustBpm = (amount: number) => {
    setSettings((current) => ({ ...current, bpm: Math.min(240, Math.max(30, current.bpm + amount)) }))
  }

  const totalSteps = settings.beatsPerBar * settings.subdivision

  return <Container size="md" className="tool-container"><Paper component="section" className="tool-panel metronome" withBorder aria-label="Metronome">
    <Group className="tool-heading" justify="space-between">
      <Text fw={800}>METRONOME</Text>
      <Badge color={running ? 'green' : 'gray'} variant="light">{starting ? 'Loading sounds' : running ? 'Playing' : 'Ready'}</Badge>
    </Group>

    <div className="tempo-control">
      <Button variant="default" size="lg" px="sm" type="button" aria-label="Decrease tempo" onClick={() => adjustBpm(-1)}><Minus size={20} /></Button>
      <Stack gap={4} align="center">
        <NumberInput
          aria-label="Tempo in BPM"
          role="spinbutton"
          min={30}
          max={240}
          value={settings.bpm}
          clampBehavior="strict"
          hideControls
          onChange={(value) => setSettings((current) => ({ ...current, bpm: Math.min(240, Math.max(30, Number(value) || 30)) }))}
        />
        <Text size="xs" c="dimmed" fw={700}>BPM</Text>
      </Stack>
      <Button variant="default" size="lg" px="sm" type="button" aria-label="Increase tempo" onClick={() => adjustBpm(1)}><Plus size={20} /></Button>
    </div>

    <div className="pulse-ruler" aria-label={`${settings.beatsPerBar} beat bar with ${settings.subdivision} subdivisions per beat`}>
      {Array.from({ length: totalSteps }, (_, step) => {
        const isBeat = step % settings.subdivision === 0
        return <div key={step} className={`pulse-step ${isBeat ? 'beat' : ''} ${activeStep === step ? 'active' : ''}`}>
          <i />
          {isBeat && <span>{Math.floor(step / settings.subdivision) + 1}</span>}
        </div>
      })}
    </div>

    <div className="metronome-options" aria-label="Metronome settings">
      <fieldset className="control-fieldset">
        <legend>SUBDIVISION</legend>
        <Button.Group>
          {([[1, '♩ Quarter'], [2, '♪ Eighth'], [4, '♬ 16th']] as const).map(([value, label]) =>
            <Button key={value} type="button" variant={settings.subdivision === value ? 'filled' : 'default'} size="sm" onClick={() => setSettings((current) => ({ ...current, subdivision: value as Subdivision }))}>{label}</Button>
          )}
        </Button.Group>
      </fieldset>
      <NativeSelect id="metronome-beats" label="BEATS PER BAR" value={String(settings.beatsPerBar)} onChange={(event) => setSettings((current) => ({ ...current, beatsPerBar: Number(event.target.value) }))}
        data={[2, 3, 4, 5, 6].map(String)} />
      <NativeSelect id="metronome-sound" label="SOUND" value={settings.sound} onChange={(event) => setSettings((current) => ({ ...current, sound: event.target.value as MetronomeSound }))}
        data={SOUNDS.map(([value, label]) => ({ value, label }))} />
      <label className="volume-control">VOLUME
        <span>
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={settings.volume}
            onChange={(event) => setSettings((current) => ({ ...current, volume: Number(event.target.value) }))}
          />
          <output>{Math.round(settings.volume * 100)}%</output>
        </span>
      </label>
      <Checkbox id="metronome-accent" className="check-control" label="Accent first beat" checked={settings.accentFirstBeat}
        onChange={(event) => setSettings((current) => ({ ...current, accentFirstBeat: event.currentTarget.checked }))} />
    </div>

    {audioError && <Alert mx="lg" mb="md" color="red" role="alert">{audioError}</Alert>}
    <Button className="primary-button metronome-start" size="md" type="button" loading={starting} onClick={() => void toggle()}
      leftSection={running ? <Square size={16} fill="currentColor" /> : <Play size={17} fill="currentColor" />}>
      {starting ? 'Loading…' : running ? 'Stop' : 'Start'}
    </Button>
    <Text className="keyboard-hint" c="dimmed" size="xs">30–240 BPM · settings are saved automatically</Text>
  </Paper></Container>
}
