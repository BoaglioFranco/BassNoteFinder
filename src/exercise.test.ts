import { describe, expect, it, vi } from 'vitest'
import { HIGH_G_MIDI, LOW_B_MIDI, randomTarget, targetForMidi, targetMatches } from './exercise'

describe('exercise targets', () => {
  it('uses the five-string, twelve-fret range for staff practice', () => {
    const random = vi.spyOn(Math, 'random')
    random.mockReturnValue(0)
    expect(randomTarget('staff').midi).toBe(LOW_B_MIDI)
    random.mockReturnValue(0.9999)
    expect(randomTarget('staff').midi).toBe(HIGH_G_MIDI)
    vi.restoreAllMocks()
  })

  it('treats octaves differently in the two modes', () => {
    const lowB = targetForMidi(23)
    expect(targetMatches(lowB, 35, 'note')).toBe(true)
    expect(targetMatches(lowB, 35, 'staff')).toBe(false)
    expect(targetMatches(lowB, 23, 'staff')).toBe(true)
  })

  it('writes electric-bass pitches one octave above sounding pitch', () => {
    const openE = targetForMidi(28)
    expect(openE.displayOctave).toBe(2)
    expect(openE.name).toBe('E')
    expect(targetForMidi(LOW_B_MIDI).displayOctave).toBe(1)
    expect(targetForMidi(HIGH_G_MIDI).displayOctave).toBe(4)
  })

  it('supports flat and sharp enharmonic spellings', () => {
    expect(targetForMidi(25).name).toBe('C♯')
    expect(targetForMidi(25).spanishName).toBe('Do♯')
    expect(targetForMidi(25, true).name).toBe('D♭')
    expect(targetForMidi(25, true).spanishName).toBe('Re♭')
    expect(targetForMidi(25).letter).not.toBe(targetForMidi(25, true).letter)
  })
})
