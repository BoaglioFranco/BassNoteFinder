export const GRID_STEPS_PER_BEAT = 4
export const TONE_PPQ = 192
export const TICKS_PER_GRID_STEP = TONE_PPQ / GRID_STEPS_PER_BEAT

export type Subdivision = 1 | 2 | 4
export type MetronomeSound = 'click' | 'woodblock' | 'drums' | 'hihat'
export type RhythmVoice = 'click' | 'woodblock' | 'kick' | 'snare' | 'hihat' | 'bass'
export type RhythmEmphasis = 'downbeat' | 'beat' | 'subdivision'

export interface RhythmEvent {
  id: string
  startStep: number
  durationSteps: number
  voice: RhythmVoice
  velocity: number
  accent?: boolean
  /** Musical role used by instruments to make the pulse hierarchy audible. */
  emphasis?: RhythmEmphasis
}

export interface RhythmPattern {
  id: string
  beatsPerBar: number
  stepsPerBeat: typeof GRID_STEPS_PER_BEAT
  events: readonly RhythmEvent[]
}

export interface MetronomePatternOptions {
  beatsPerBar: number
  subdivision: Subdivision
  sound: MetronomeSound
  accentFirstBeat: boolean
}

export function patternLength(pattern: RhythmPattern) {
  return pattern.beatsPerBar * pattern.stepsPerBeat
}

export function stepToTicks(step: number) {
  return step * TICKS_PER_GRID_STEP
}

export function eventsAtStep(pattern: RhythmPattern, step: number) {
  return pattern.events.filter((event) => event.startStep === step)
}

export function validateRhythmPattern(pattern: RhythmPattern): string[] {
  const errors: string[] = []
  if (!pattern.id.trim()) errors.push('Pattern id is required.')
  if (!Number.isInteger(pattern.beatsPerBar) || pattern.beatsPerBar < 1 || pattern.beatsPerBar > 32) {
    errors.push('beatsPerBar must be an integer from 1 to 32.')
  }
  if (pattern.stepsPerBeat !== GRID_STEPS_PER_BEAT) errors.push('stepsPerBeat must use the canonical sixteenth-note grid.')

  const length = patternLength(pattern)
  const ids = new Set<string>()
  for (const event of pattern.events) {
    if (!event.id.trim()) errors.push('Every event requires an id.')
    else if (ids.has(event.id)) errors.push(`Duplicate event id: ${event.id}.`)
    ids.add(event.id)
    if (!Number.isInteger(event.startStep) || event.startStep < 0 || event.startStep >= length) {
      errors.push(`Event ${event.id || '(unnamed)'} starts outside the pattern.`)
    }
    if (!Number.isInteger(event.durationSteps) || event.durationSteps < 1) {
      errors.push(`Event ${event.id || '(unnamed)'} must last at least one step.`)
    } else if (event.startStep + event.durationSteps > length) {
      errors.push(`Event ${event.id || '(unnamed)'} extends past the pattern.`)
    }
    if (!Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 1) {
      errors.push(`Event ${event.id || '(unnamed)'} velocity must be between 0 and 1.`)
    }
  }
  return errors
}

export function assertValidRhythmPattern(pattern: RhythmPattern) {
  const errors = validateRhythmPattern(pattern)
  if (errors.length) throw new Error(errors.join(' '))
}

export function createMetronomePattern(options: MetronomePatternOptions): RhythmPattern {
  const stepSpacing = GRID_STEPS_PER_BEAT / options.subdivision
  const totalSteps = options.beatsPerBar * GRID_STEPS_PER_BEAT
  const events: RhythmEvent[] = []

  for (let startStep = 0; startStep < totalSteps; startStep += stepSpacing) {
    const onBeat = startStep % GRID_STEPS_PER_BEAT === 0
    const beat = Math.floor(startStep / GRID_STEPS_PER_BEAT)
    const accent = options.accentFirstBeat && startStep === 0
    const emphasis: RhythmEmphasis = accent ? 'downbeat' : onBeat ? 'beat' : 'subdivision'

    if (options.sound === 'drums') {
      events.push({
        id: `hat-${startStep}`,
        startStep,
        durationSteps: 1,
        voice: 'hihat',
        velocity: onBeat ? 0.5 : 0.34,
        accent,
        emphasis,
      })
      if (onBeat) {
        events.push({
          id: `${beat % 2 === 0 ? 'kick' : 'snare'}-${startStep}`,
          startStep,
          durationSteps: 1,
          voice: beat % 2 === 0 ? 'kick' : 'snare',
          velocity: accent ? 1 : 0.82,
          accent,
          emphasis,
        })
      }
      continue
    }

    events.push({
      id: `${options.sound}-${startStep}`,
      startStep,
      durationSteps: 1,
      voice: options.sound,
      velocity: accent ? 1 : onBeat ? 0.78 : 0.48,
      accent,
      emphasis,
    })
  }

  const pattern: RhythmPattern = {
    id: 'metronome',
    beatsPerBar: options.beatsPerBar,
    stepsPerBeat: GRID_STEPS_PER_BEAT,
    events,
  }
  assertValidRhythmPattern(pattern)
  return pattern
}
