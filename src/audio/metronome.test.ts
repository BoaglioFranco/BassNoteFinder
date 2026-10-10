import { describe, expect, it } from 'vitest'
import { positionForStep, secondsPerStep } from './metronome'

describe('metronome timing', () => {
  it('calculates quarter, eighth, and sixteenth-note durations from BPM', () => {
    expect(secondsPerStep(120, 1)).toBe(0.5)
    expect(secondsPerStep(120, 2)).toBe(0.25)
    expect(secondsPerStep(120, 4)).toBe(0.125)
  })

  it('maps scheduler steps to beats and subdivisions', () => {
    expect(positionForStep(0, 4)).toEqual({ beat: 0, subdivision: 0 })
    expect(positionForStep(3, 4)).toEqual({ beat: 0, subdivision: 3 })
    expect(positionForStep(4, 4)).toEqual({ beat: 1, subdivision: 0 })
  })
})
