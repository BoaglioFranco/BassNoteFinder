import {
  createMetronomePattern,
  eventsAtStep,
  GRID_STEPS_PER_BEAT,
  patternLength,
  stepToTicks,
  TICKS_PER_GRID_STEP,
  type MetronomeSound,
  type RhythmPattern,
  type Subdivision,
} from '../rhythm/pattern'
import { ToneRhythmAudio, type RhythmAudioPort } from './toneAdapter'

export type { MetronomeSound, Subdivision } from '../rhythm/pattern'

export interface MetronomeSettings {
  bpm: number
  beatsPerBar: number
  subdivision: Subdivision
  accentFirstBeat: boolean
  volume: number
  sound: MetronomeSound
}

export interface MetronomeTick {
  /** Position on the canonical sixteenth-note grid. */
  gridStep: number
  beat: number
  subdivision: number
  audioTime: number
}

export function secondsPerStep(bpm: number, subdivision: Subdivision) {
  return 60 / bpm / subdivision
}

export function positionForStep(step: number, stepsPerBeat = GRID_STEPS_PER_BEAT): Pick<MetronomeTick, 'beat' | 'subdivision'> {
  return {
    beat: Math.floor(step / stepsPerBeat),
    subdivision: step % stepsPerBeat,
  }
}

function patternFromSettings(settings: MetronomeSettings) {
  return createMetronomePattern(settings)
}

/**
 * Application-facing transport. Tone.js provides the clock and sample-accurate
 * scheduling; this class owns our library-neutral pattern and lifecycle.
 */
export class MetronomeEngine {
  private pattern: RhythmPattern
  private pendingRhythm?: { pattern: RhythmPattern, subdivision: Subdivision }
  private activeBeatsPerBar: number
  private activeSubdivision: Subdivision
  private scheduleId?: number
  private gridStep = 0
  private running = false
  private startAttempt = 0
  private disposed = false

  constructor(
    private settings: MetronomeSettings,
    private readonly onTick: (tick: MetronomeTick) => void,
    private readonly audio: RhythmAudioPort = new ToneRhythmAudio(),
  ) {
    this.pattern = patternFromSettings(settings)
    this.activeBeatsPerBar = settings.beatsPerBar
    this.activeSubdivision = settings.subdivision
    this.configureImmediateSettings(settings)
  }

  get isRunning() { return this.running }

  update(settings: MetronomeSettings) {
    const nextPattern = patternFromSettings(settings)
    this.settings = settings
    this.audio.setBpm(settings.bpm)
    this.audio.setVolume(settings.volume)

    if (this.running) {
      const meterChanged = settings.beatsPerBar !== this.activeBeatsPerBar

      // Sound, accent, and subdivision choices are safe to hear on the next
      // unscheduled grid pulse. Only a meter edit waits for a new bar because
      // changing the bar's length halfway through would create a partial bar.
      this.activeSubdivision = settings.subdivision
      this.pattern = patternFromSettings({
        ...settings,
        beatsPerBar: this.activeBeatsPerBar,
      })
      this.pendingRhythm = meterChanged
        ? { pattern: nextPattern, subdivision: settings.subdivision }
        : undefined
    } else {
      this.pattern = nextPattern
      this.activeBeatsPerBar = settings.beatsPerBar
      this.activeSubdivision = settings.subdivision
      this.audio.setBeatsPerBar(settings.beatsPerBar)
      this.gridStep = 0
    }
  }

  async start() {
    if (this.running) return
    if (this.disposed) throw new Error('Cannot start a disposed metronome engine.')
    const attempt = ++this.startAttempt
    await this.audio.prepare()
    if (this.disposed || attempt !== this.startAttempt) return false
    this.configureImmediateSettings(this.settings)
    this.pattern = patternFromSettings(this.settings)
    this.pendingRhythm = undefined
    this.activeBeatsPerBar = this.settings.beatsPerBar
    this.activeSubdivision = this.settings.subdivision
    this.gridStep = 0
    this.scheduleId = this.audio.scheduleEveryTicks(this.handleGridStep, TICKS_PER_GRID_STEP)
    this.running = true
    this.audio.startTransport()
    return true
  }

  stop() {
    this.startAttempt += 1
    this.running = false
    this.audio.stopTransport()
    if (this.scheduleId !== undefined) this.audio.clearSchedule(this.scheduleId)
    this.scheduleId = undefined
    if (this.pendingRhythm) {
      this.pattern = this.pendingRhythm.pattern
      this.activeBeatsPerBar = this.pendingRhythm.pattern.beatsPerBar
      this.activeSubdivision = this.pendingRhythm.subdivision
    }
    this.pendingRhythm = undefined
    this.gridStep = 0
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.audio.dispose()
  }

  private configureImmediateSettings(settings: MetronomeSettings) {
    this.audio.setBpm(settings.bpm)
    this.audio.setBeatsPerBar(settings.beatsPerBar)
    this.audio.setVolume(settings.volume)
  }

  private handleGridStep = (audioTime: number) => {
    if (!this.running) return
    if (this.gridStep === 0 && this.pendingRhythm) {
      this.pattern = this.pendingRhythm.pattern
      this.activeBeatsPerBar = this.pendingRhythm.pattern.beatsPerBar
      this.activeSubdivision = this.pendingRhythm.subdivision
      this.pendingRhythm = undefined
      this.audio.setBeatsPerBar(this.pattern.beatsPerBar)
    }

    const currentStep = this.gridStep
    for (const event of eventsAtStep(this.pattern, currentStep)) {
      this.audio.trigger(event, audioTime, stepToTicks(event.durationSteps))
    }

    const position = positionForStep(currentStep)
    this.audio.scheduleDraw(() => {
      if (this.running) this.onTick({ gridStep: currentStep, audioTime, ...position })
    }, audioTime)

    this.gridStep = (currentStep + 1) % patternLength(this.pattern)
  }
}
