import {
  createMetronomePattern,
  eventsAtStep,
  GRID_STEPS_PER_BEAT,
  stepToTicks,
  TICKS_PER_GRID_STEP,
  type MetronomeSound,
  type RhythmEvent,
  type RhythmPattern,
} from '../rhythm/pattern'
import {
  emphasisForStep,
  noteAtStep,
  totalStepsForBar,
  totalStepsForPattern,
  validateBeatRulerNotes,
  type BeatRulerNote,
} from '../rhythm/beatRuler'
import { ToneRhythmAudio, type RhythmAudioPort } from './toneAdapter'

export type BeatRulerCueSound = 'bass' | 'pickedBass' | 'synthBass'

export interface BeatRulerPlaybackSettings {
  bpm: number
  beatsPerBar: number
  bars: number
  volume: number
  metronomeEnabled: boolean
  metronomeSound: MetronomeSound
  cueEnabled: boolean
  cueSound: BeatRulerCueSound
}

export interface BeatRulerFrame {
  gridStep: number
  activeNoteId: string | null
}

export class BeatRulerEngine {
  private metronomePattern: RhythmPattern
  private scheduleId?: number
  private gridStep = 0
  private running = false
  private startAttempt = 0
  private disposed = false

  constructor(
    private settings: BeatRulerPlaybackSettings,
    private notes: readonly BeatRulerNote[],
    private readonly onFrame: (frame: BeatRulerFrame) => void,
    private readonly audio: RhythmAudioPort = new ToneRhythmAudio(),
  ) {
    this.validate(notes, settings.beatsPerBar, settings.bars)
    this.metronomePattern = this.createBackgroundPattern(settings)
    this.configureAudio()
  }

  get isRunning() { return this.running }

  update(settings: BeatRulerPlaybackSettings, notes: readonly BeatRulerNote[]) {
    this.validate(notes, settings.beatsPerBar, settings.bars)
    this.settings = settings
    this.notes = notes
    this.metronomePattern = this.createBackgroundPattern(settings)
    this.configureAudio()
    const length = totalStepsForPattern(settings.beatsPerBar, settings.bars)
    if (this.gridStep >= length) this.gridStep = 0
  }

  async start() {
    if (this.running) return
    if (this.disposed) throw new Error('Cannot start a disposed beat ruler engine.')
    const attempt = ++this.startAttempt
    await this.audio.prepare()
    if (this.disposed || attempt !== this.startAttempt) return false
    this.configureAudio()
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
    this.gridStep = 0
  }

  dispose() {
    this.disposed = true
    this.stop()
    this.audio.dispose()
  }

  private configureAudio() {
    this.audio.setBpm(this.settings.bpm)
    this.audio.setBeatsPerBar(this.settings.beatsPerBar)
    this.audio.setVolume(this.settings.volume)
  }

  private validate(notes: readonly BeatRulerNote[], beatsPerBar: number, bars: number) {
    const errors = validateBeatRulerNotes(notes, totalStepsForPattern(beatsPerBar, bars))
    if (errors.length) throw new Error(errors.join(' '))
  }

  private createBackgroundPattern(settings: BeatRulerPlaybackSettings) {
    return createMetronomePattern({
      beatsPerBar: settings.beatsPerBar,
      subdivision: 1,
      sound: settings.metronomeSound,
      accentFirstBeat: true,
    })
  }

  private handleGridStep = (audioTime: number) => {
    if (!this.running) return
    const currentStep = this.gridStep
    if (this.settings.metronomeEnabled) {
      const stepWithinBar = currentStep % totalStepsForBar(this.settings.beatsPerBar)
      for (const event of eventsAtStep(this.metronomePattern, stepWithinBar)) {
        this.audio.trigger(event, audioTime, stepToTicks(event.durationSteps))
      }
    }

    const startingNote = this.notes.find((note) => note.startStep === currentStep)
    if (startingNote && this.settings.cueEnabled) {
      const cue: RhythmEvent = {
        id: `cue-${startingNote.id}`,
        startStep: startingNote.startStep,
        durationSteps: startingNote.durationSteps,
        voice: this.settings.cueSound,
        velocity: 0.9,
        emphasis: emphasisForStep(startingNote.startStep),
        audioTrack: 'cue',
      }
      this.audio.trigger(cue, audioTime, stepToTicks(cue.durationSteps))
    }

    const activeNote = noteAtStep(this.notes, currentStep)
    this.audio.scheduleDraw(() => {
      if (this.running) this.onFrame({ gridStep: currentStep, activeNoteId: activeNote?.id ?? null })
    }, audioTime)
    this.gridStep = (currentStep + 1) % totalStepsForPattern(this.settings.beatsPerBar, this.settings.bars)
  }
}
