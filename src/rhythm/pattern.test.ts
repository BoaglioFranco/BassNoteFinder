import { describe, expect, it } from 'vitest'
import {
  createMetronomePattern,
  eventsAtStep,
  GRID_STEPS_PER_BEAT,
  patternLength,
  stepToTicks,
  validateRhythmPattern,
  type RhythmPattern,
} from './pattern'

describe('rhythm pattern model', () => {
  it('uses a stable sixteenth-note grid independent of BPM', () => {
    expect(GRID_STEPS_PER_BEAT).toBe(4)
    expect(stepToTicks(0)).toBe(0)
    expect(stepToTicks(1)).toBe(48)
    expect(stepToTicks(4)).toBe(192)
  })

  it.each([
    [1, [0, 4, 8, 12]],
    [2, [0, 2, 4, 6, 8, 10, 12, 14]],
    [4, Array.from({ length: 16 }, (_, index) => index)],
  ] as const)('creates %i-per-beat metronome attacks on the canonical grid', (subdivision, expectedSteps) => {
    const pattern = createMetronomePattern({ beatsPerBar: 4, subdivision, sound: 'woodblock', accentFirstBeat: true })
    expect(pattern.events.map((event) => event.startStep)).toEqual(expectedSteps)
    expect(patternLength(pattern)).toBe(16)
    expect(pattern.events[0]).toMatchObject({ voice: 'woodblock', velocity: 1, accent: true, emphasis: 'downbeat' })
  })

  it('labels downbeats, beats, and subdivisions for audible pulse hierarchy', () => {
    const pattern = createMetronomePattern({ beatsPerBar: 4, subdivision: 4, sound: 'click', accentFirstBeat: true })

    expect(eventsAtStep(pattern, 0)[0].emphasis).toBe('downbeat')
    expect(eventsAtStep(pattern, 1)[0].emphasis).toBe('subdivision')
    expect(eventsAtStep(pattern, 4)[0].emphasis).toBe('beat')
  })

  it('builds a kick/snare backbeat with hats at the chosen subdivision', () => {
    const pattern = createMetronomePattern({ beatsPerBar: 4, subdivision: 2, sound: 'drums', accentFirstBeat: true })

    expect(pattern.events.filter((event) => event.voice === 'hihat')).toHaveLength(8)
    expect(eventsAtStep(pattern, 0).map((event) => event.voice)).toEqual(['hihat', 'kick'])
    expect(eventsAtStep(pattern, 4).map((event) => event.voice)).toEqual(['hihat', 'snare'])
    expect(eventsAtStep(pattern, 8).map((event) => event.voice)).toEqual(['hihat', 'kick'])
    expect(eventsAtStep(pattern, 12).map((event) => event.voice)).toEqual(['hihat', 'snare'])
  })

  it('continues the kick/snare alternation in odd meters', () => {
    const pattern = createMetronomePattern({ beatsPerBar: 5, subdivision: 1, sound: 'drums', accentFirstBeat: false })
    const drums = pattern.events.filter((event) => event.voice !== 'hihat')
    expect(drums.map((event) => event.voice)).toEqual(['kick', 'snare', 'kick', 'snare', 'kick'])
  })

  it('represents note length separately from attack position for the future ruler', () => {
    const pattern: RhythmPattern = {
      id: 'ruler-example', beatsPerBar: 4, stepsPerBeat: 4,
      events: [{ id: 'long-note', startStep: 2, durationSteps: 6, voice: 'bass', velocity: 0.8 }],
    }
    expect(validateRhythmPattern(pattern)).toEqual([])
    expect(eventsAtStep(pattern, 2)[0].durationSteps).toBe(6)
  })

  it('rejects malformed and out-of-bounds events', () => {
    const pattern: RhythmPattern = {
      id: '', beatsPerBar: 1, stepsPerBeat: 4,
      events: [
        { id: 'same', startStep: -1, durationSteps: 0, voice: 'bass', velocity: -0.1 },
        { id: 'same', startStep: 3, durationSteps: 2, voice: 'bass', velocity: 1.1 },
      ],
    }
    const errors = validateRhythmPattern(pattern)
    expect(errors).toHaveLength(7)
    expect(errors.join(' ')).toContain('Duplicate event id')
    expect(errors.join(' ')).toContain('extends past the pattern')
  })
})
