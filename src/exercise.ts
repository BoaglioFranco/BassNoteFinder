export type PracticeMode = 'note' | 'staff'
export type BassStringCount = 4 | 5
export type Accidental = 'sharp' | 'flat' | null

export interface ExerciseTarget {
  midi: number
  pitchClass: number
  name: string
  spanishName: string
  accidental: Accidental
  letter: string
  displayOctave: number
}

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
const SPANISH_NAMES: Record<string, string> = {
  C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si',
}

export const LOW_B_MIDI = 23
export const LOW_E_MIDI = 28
export const HIGH_G_MIDI = 55

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

export function targetForMidi(midi: number, preferFlats = false): ExerciseTarget {
  const pitchClass = positiveModulo(midi, 12)
  const name = (preferFlats ? FLAT_NAMES : SHARP_NAMES)[pitchClass]
  const accidental = name.includes('♯') ? 'sharp' : name.includes('♭') ? 'flat' : null
  // Bass guitar sounds one octave below its written bass-clef notation.
  const writtenMidi = midi + 12

  return {
    midi,
    pitchClass,
    name,
    spanishName: `${SPANISH_NAMES[name[0]]}${name.slice(1)}`,
    accidental,
    letter: name[0],
    displayOctave: Math.floor(writtenMidi / 12) - 1,
  }
}

export function randomTarget(mode: PracticeMode, previous?: ExerciseTarget, stringCount: BassStringCount = 5): ExerciseTarget {
  const min = mode === 'staff' ? stringCount === 4 ? LOW_E_MIDI : LOW_B_MIDI : 0
  const max = mode === 'staff' ? HIGH_G_MIDI : 11
  let midi = min + Math.floor(Math.random() * (max - min + 1))

  if (previous && max > min) {
    const repeats = mode === 'note' ? midi === previous.pitchClass : midi === previous.midi
    if (repeats) midi = min + ((midi - min + 1) % (max - min + 1))
  }

  const chromatic = [1, 3, 6, 8, 10].includes(positiveModulo(midi, 12))
  return targetForMidi(midi, chromatic && Math.random() < 0.5)
}

export function targetMatches(target: ExerciseTarget, playedMidi: number, mode: PracticeMode) {
  return mode === 'note'
    ? positiveModulo(playedMidi, 12) === target.pitchClass
    : playedMidi === target.midi
}
