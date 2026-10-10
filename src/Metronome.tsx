import { useEffect, useRef, useState } from 'react'
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

  return <section className="tool-panel metronome" aria-label="Metronome">
    <div className="tool-heading">
      <span>METRONOME</span>
      <small>{starting ? 'Loading sounds' : running ? 'Playing' : 'Ready'}</small>
    </div>

    <div className="tempo-control">
      <button type="button" aria-label="Decrease tempo" onClick={() => adjustBpm(-1)}>−</button>
      <label>
        <input
          aria-label="Tempo in BPM"
          type="number"
          min="30"
          max="240"
          value={settings.bpm}
          onChange={(event) => setSettings((current) => ({ ...current, bpm: Math.min(240, Math.max(30, Number(event.target.value) || 30)) }))}
        />
        <span>BPM</span>
      </label>
      <button type="button" aria-label="Increase tempo" onClick={() => adjustBpm(1)}>+</button>
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

    <div className="metronome-options">
      <fieldset>
        <legend>SUBDIVISION</legend>
        <div className="segmented-control">
          {([[1, '♩ Quarter'], [2, '♪ Eighth'], [4, '♬ 16th']] as const).map(([value, label]) =>
            <button key={value} type="button" className={settings.subdivision === value ? 'selected' : ''} onClick={() => setSettings((current) => ({ ...current, subdivision: value as Subdivision }))}>{label}</button>
          )}
        </div>
      </fieldset>
      <label className="select-control">BEATS PER BAR
        <select value={settings.beatsPerBar} onChange={(event) => setSettings((current) => ({ ...current, beatsPerBar: Number(event.target.value) }))}>
          {[2, 3, 4, 5, 6].map((beats) => <option key={beats} value={beats}>{beats}</option>)}
        </select>
      </label>
      <label className="select-control">SOUND
        <select value={settings.sound} onChange={(event) => setSettings((current) => ({ ...current, sound: event.target.value as MetronomeSound }))}>
          {SOUNDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
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
      <label className="check-control">
        <input type="checkbox" checked={settings.accentFirstBeat} onChange={(event) => setSettings((current) => ({ ...current, accentFirstBeat: event.target.checked }))} />
        Accent first beat
      </label>
    </div>

    {audioError && <p className="error" role="alert">{audioError}</p>}
    <button className="primary-button metronome-start" type="button" disabled={starting} onClick={() => void toggle()}>{starting ? 'Loading…' : running ? 'Stop' : 'Start'}</button>
    <p className="keyboard-hint">30–240 BPM · settings are saved automatically</p>
  </section>
}
