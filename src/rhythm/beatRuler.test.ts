import { describe, expect, it } from 'vitest'
import {
  addBeatRulerNote,
  emphasisForStep,
  fitNotesToBar,
  moveBeatRulerNote,
  noteAtStep,
  removeBeatRulerNote,
  fitNotesToGrid,
  resizeBeatRulerNote,
  snapSize,
  totalStepsForBar,
  totalStepsForPattern,
  validateBeatRulerNotes,
  type BeatRulerNote,
} from './beatRuler'

const notes: BeatRulerNote[] = [
  { id: 'a', startStep: 0, durationSteps: 2 },
  { id: 'b', startStep: 8, durationSteps: 4 },
]

describe('beat ruler model', () => {
  it('maps eighth and sixteenth snapping onto the canonical grid', () => {
    expect(snapSize(2)).toBe(2)
    expect(snapSize(4)).toBe(1)
    expect(totalStepsForBar(5)).toBe(20)
    expect(totalStepsForPattern(4, 3)).toBe(48)
  })

  it('adds notes at the selected snap and keeps them ordered', () => {
    expect(addBeatRulerNote(notes, 5, 2, 16, 'new')).toEqual([
      notes[0], { id: 'new', startStep: 4, durationSteps: 2 }, notes[1],
    ])
  })

  it('does not add a note inside an existing note', () => {
    expect(addBeatRulerNote(notes, 1, 4, 16, 'blocked')).toEqual(notes)
    expect(noteAtStep(notes, 1)?.id).toBe('a')
    expect(noteAtStep(notes, 2)).toBeUndefined()
  })

  it('fits attacks and durations to an eighth-note grid by removing off-grid notes and rounding up', () => {
    const sixteenthNotes: BeatRulerNote[] = [
      { id: 'beat', startStep: 0, durationSteps: 1 },
      { id: 'e', startStep: 1, durationSteps: 1 },
      { id: 'dotted-eighth', startStep: 4, durationSteps: 3 },
      { id: 'a', startStep: 11, durationSteps: 1 },
    ]

    expect(fitNotesToGrid(sixteenthNotes, 2, 16)).toEqual([
      { id: 'beat', startStep: 0, durationSteps: 2 },
      { id: 'dotted-eighth', startStep: 4, durationSteps: 4 },
    ])
    expect(fitNotesToGrid(sixteenthNotes, 4, 16)).toEqual(sixteenthNotes)
  })

  it('never expands a rounded duration into the next retained note or past the bar', () => {
    expect(fitNotesToGrid([
      { id: 'first', startStep: 0, durationSteps: 3 },
      { id: 'next', startStep: 4, durationSteps: 1 },
      { id: 'last', startStep: 14, durationSteps: 1 },
    ], 2, 16)).toEqual([
      { id: 'first', startStep: 0, durationSteps: 4 },
      { id: 'next', startStep: 4, durationSteps: 2 },
      { id: 'last', startStep: 14, durationSteps: 2 },
    ])
  })

  it('resizes to the snap while preventing overlap and out-of-bar notes', () => {
    expect(resizeBeatRulerNote(notes, 'a', 7, 2, 16)[0].durationSteps).toBe(8)
    expect(resizeBeatRulerNote(notes, 'b', 40, 4, 16)[1].durationSteps).toBe(8)
    expect(resizeBeatRulerNote(notes, 'a', 0, 2, 16)[0].durationSteps).toBe(2)
  })

  it('moves notes in either direction without overlap or changing duration', () => {
    expect(moveBeatRulerNote(notes, 'b', 4, 2, 16)[1]).toEqual({ id: 'b', startStep: 4, durationSteps: 4 })
    expect(moveBeatRulerNote(notes, 'b', -20, 2, 16)[1]).toEqual({ id: 'b', startStep: 2, durationSteps: 4 })
    expect(moveBeatRulerNote(notes, 'a', 20, 4, 16)[0]).toEqual({ id: 'a', startStep: 6, durationSteps: 2 })
  })

  it('removes notes and safely fits a pattern to a shorter bar', () => {
    expect(removeBeatRulerNote(notes, 'a')).toEqual([notes[1]])
    expect(fitNotesToBar(notes, 10)).toEqual([
      notes[0], { id: 'b', startStep: 8, durationSteps: 2 },
    ])
    expect(fitNotesToBar(notes, 8)).toEqual([notes[0]])
  })

  it('labels musical emphasis and validates corrupt patterns', () => {
    expect([0, 1, 4].map((step) => emphasisForStep(step))).toEqual(['downbeat', 'subdivision', 'beat'])
    const corrupt: BeatRulerNote[] = [
      { id: 'same', startStep: -1, durationSteps: 2 },
      { id: 'same', startStep: 0, durationSteps: 20 },
      { id: 'third', startStep: 1, durationSteps: 2 },
    ]
    const errors = validateBeatRulerNotes(corrupt, 16)
    expect(errors.join(' ')).toContain('duplicate')
    expect(errors.join(' ')).toContain('outside')
    expect(errors.join(' ')).toContain('overlaps')
  })
})
