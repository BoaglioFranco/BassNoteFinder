import { describe, expect, it } from 'vitest'
import { detectPitch, frequencyToNote } from './pitch'

const sampleRate = 48_000

function sine(frequency: number, length = 8192, amplitude = 0.6, harmonics: Array<[number, number]> = []) {
  return Float32Array.from({ length }, (_, index) => {
    const time = index / sampleRate
    return amplitude * Math.sin(2 * Math.PI * frequency * time) +
      harmonics.reduce((sum, [multiple, gain]) => sum + gain * Math.sin(2 * Math.PI * frequency * multiple * time), 0)
  })
}

describe('frequencyToNote', () => {
  it('maps concert A exactly', () => expect(frequencyToNote(440)).toMatchObject({ note: 'A', octave: 4, midi: 69, cents: 0 }))
  it('maps five-string low B', () => {
    const note = frequencyToNote(30.8677)
    expect(note).toMatchObject({ note: 'B', octave: 0, midi: 23 })
    expect(note.cents).toBeCloseTo(0, 1)
  })
  it('reports cents around the nearest pitch', () => expect(frequencyToNote(445).cents).toBeCloseTo(19.56, 1))
})

describe('detectPitch', () => {
  it.each([
    ['low B', 30.8677], ['open E', 41.2034], ['open A', 55], ['open D', 73.416], ['open G', 97.999],
  ])('detects %s at bass frequencies', (_name, frequency) => {
    const result = detectPitch(sine(frequency), sampleRate)
    expect(result).not.toBeNull()
    expect(result!.frequency).toBeCloseTo(frequency, 1)
    expect(result!.clarity).toBeGreaterThan(0.9)
  })

  it('detects the fundamental in a harmonic-rich bass-like wave', () => {
    const result = detectPitch(sine(41.2034, 8192, 0.25, [[2, 0.5], [3, 0.2]]), sampleRate)
    expect(result!.frequency).toBeCloseTo(41.2034, 1)
  })

  it('rejects silence and weak input', () => {
    expect(detectPitch(new Float32Array(8192), sampleRate)).toBeNull()
    expect(detectPitch(sine(55, 8192, 0.001), sampleRate)).toBeNull()
  })
})
