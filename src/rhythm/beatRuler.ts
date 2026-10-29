import { GRID_STEPS_PER_BEAT, type RhythmEmphasis, type Subdivision } from './pattern'

export interface BeatRulerNote {
  id: string
  startStep: number
  durationSteps: number
}

export type BeatRulerSnap = Extract<Subdivision, 2 | 4>

export function snapSize(snap: BeatRulerSnap) {
  return GRID_STEPS_PER_BEAT / snap
}

export function totalStepsForBar(beatsPerBar: number) {
  return beatsPerBar * GRID_STEPS_PER_BEAT
}

export function totalStepsForPattern(beatsPerBar: number, bars: number) {
  return totalStepsForBar(beatsPerBar) * bars
}

export function emphasisForStep(step: number, accentFirstBeat = true): RhythmEmphasis {
  if (accentFirstBeat && step === 0) return 'downbeat'
  return step % GRID_STEPS_PER_BEAT === 0 ? 'beat' : 'subdivision'
}

export function noteAtStep(notes: readonly BeatRulerNote[], step: number) {
  return notes.find((note) => step >= note.startStep && step < note.startStep + note.durationSteps)
}

export function addBeatRulerNote(
  notes: readonly BeatRulerNote[],
  step: number,
  snap: BeatRulerSnap,
  totalSteps: number,
  id = `note-${step}`,
): BeatRulerNote[] {
  const unit = snapSize(snap)
  const startStep = Math.floor(step / unit) * unit
  if (startStep < 0 || startStep >= totalSteps || noteAtStep(notes, startStep)) return [...notes]
  const nextStart = notes.filter((note) => note.startStep > startStep).reduce((nearest, note) => Math.min(nearest, note.startStep), totalSteps)
  const durationSteps = Math.min(unit, nextStart - startStep)
  if (durationSteps < 1) return [...notes]
  return [...notes, { id, startStep, durationSteps }].sort((a, b) => a.startStep - b.startStep)
}

export function removeBeatRulerNote(notes: readonly BeatRulerNote[], id: string) {
  return notes.filter((note) => note.id !== id)
}

export function fitNotesToGrid(notes: readonly BeatRulerNote[], snap: BeatRulerSnap, totalSteps: number) {
  const unit = snapSize(snap)
  const aligned = notes
    .filter((note) => note.startStep % unit === 0)
    .sort((a, b) => a.startStep - b.startStep)

  return aligned.map((note, index) => {
    const nextStart = aligned[index + 1]?.startStep ?? totalSteps
    const roundedDuration = Math.ceil(note.durationSteps / unit) * unit
    return { ...note, durationSteps: Math.min(roundedDuration, nextStart - note.startStep, totalSteps - note.startStep) }
  })
}

export function moveBeatRulerNote(
  notes: readonly BeatRulerNote[],
  id: string,
  requestedStartStep: number,
  snap: BeatRulerSnap,
  totalSteps: number,
): BeatRulerNote[] {
  const target = notes.find((note) => note.id === id)
  if (!target) return [...notes]
  const unit = snapSize(snap)
  const previousEnd = notes
    .filter((note) => note.id !== id && note.startStep < target.startStep)
    .reduce((latest, note) => Math.max(latest, note.startStep + note.durationSteps), 0)
  const nextStart = notes
    .filter((note) => note.id !== id && note.startStep > target.startStep)
    .reduce((nearest, note) => Math.min(nearest, note.startStep), totalSteps)
  const snappedStart = Math.round(requestedStartStep / unit) * unit
  const startStep = Math.min(nextStart - target.durationSteps, totalSteps - target.durationSteps, Math.max(previousEnd, 0, snappedStart))
  return notes
    .map((note) => note.id === id ? { ...note, startStep } : note)
    .sort((a, b) => a.startStep - b.startStep)
}

export function resizeBeatRulerNote(
  notes: readonly BeatRulerNote[],
  id: string,
  requestedEndStep: number,
  snap: BeatRulerSnap,
  totalSteps: number,
): BeatRulerNote[] {
  const target = notes.find((note) => note.id === id)
  if (!target) return [...notes]
  const unit = snapSize(snap)
  const nextStart = notes.filter((note) => note.startStep > target.startStep).reduce((nearest, note) => Math.min(nearest, note.startStep), totalSteps)
  const snappedEnd = Math.round(requestedEndStep / unit) * unit
  const endStep = Math.min(nextStart, totalSteps, Math.max(target.startStep + unit, snappedEnd))
  return notes.map((note) => note.id === id ? { ...note, durationSteps: endStep - note.startStep } : note)
}

export function fitNotesToBar(notes: readonly BeatRulerNote[], totalSteps: number) {
  return notes
    .filter((note) => note.startStep < totalSteps)
    .map((note) => ({ ...note, durationSteps: Math.min(note.durationSteps, totalSteps - note.startStep) }))
}

export function validateBeatRulerNotes(notes: readonly BeatRulerNote[], totalSteps: number): string[] {
  const errors: string[] = []
  const sorted = [...notes].sort((a, b) => a.startStep - b.startStep)
  const ids = new Set<string>()
  sorted.forEach((note, index) => {
    if (!note.id || ids.has(note.id)) errors.push(`Invalid or duplicate note id: ${note.id || '(empty)'}.`)
    ids.add(note.id)
    if (!Number.isInteger(note.startStep) || note.startStep < 0 || note.startStep >= totalSteps) errors.push(`Note ${note.id} starts outside the bar.`)
    if (!Number.isInteger(note.durationSteps) || note.durationSteps < 1 || note.startStep + note.durationSteps > totalSteps) errors.push(`Note ${note.id} has an invalid duration.`)
    const next = sorted[index + 1]
    if (next && note.startStep + note.durationSteps > next.startStep) errors.push(`Note ${note.id} overlaps ${next.id}.`)
  })
  return errors
}
