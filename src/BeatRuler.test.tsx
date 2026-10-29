// @vitest-environment jsdom

import { StrictMode } from 'react'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BeatRuler from './BeatRuler'
import { render } from './test-utils'

const engine = vi.hoisted(() => ({
  instances: [] as Array<{ callback: (frame: { gridStep: number, activeNoteId: string | null }) => void }>,
  start: vi.fn<() => Promise<boolean | undefined>>(async () => true),
  stop: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
}))

const DEFAULT_SAVED_SETTINGS = {
  bpm: 80,
  beatsPerBar: 4,
  bars: 1,
  volume: 0.7,
  metronomeEnabled: true,
  metronomeSound: 'woodblock',
  cueEnabled: true,
  cueSound: 'click',
}

vi.mock('./audio/beatRuler', () => ({
  BeatRulerEngine: class {
    constructor(_settings: unknown, _notes: unknown, callback: (frame: { gridStep: number, activeNoteId: string | null }) => void) {
      engine.instances.push({ callback })
    }
    start() { return engine.start() }
    stop() { engine.stop() }
    update(settings: unknown, notes: unknown) { engine.update(settings, notes) }
    dispose() { engine.dispose() }
  },
}))

describe('Beat Ruler UI', () => {
  beforeEach(() => {
    localStorage.clear()
    engine.instances.length = 0
    engine.start.mockReset().mockResolvedValue(true)
    engine.stop.mockClear()
    engine.update.mockClear()
    engine.dispose.mockClear()
  })

  afterEach(cleanup)

  it('loads an editable example rhythm with persisted defaults', () => {
    render(<BeatRuler />)

    expect(screen.getByRole('button', { name: 'Edit' }).classList.contains('selected')).toBe(true)
    expect(screen.getAllByLabelText(/Note at/)).toHaveLength(4)
    expect((screen.getByRole('combobox', { name: 'METRONOME' }) as HTMLSelectElement).value).toBe('woodblock')
    expect((screen.getByRole('combobox', { name: 'RULER CUE' }) as HTMLSelectElement).value).toBe('bass')
    expect(screen.getByRole('combobox', { name: 'RULER CUE' }).textContent).toBe('Fingered bassPicked bassSynth bass')
    expect(screen.getByRole('checkbox', { name: 'Sound metronome' })).toBeTruthy()
    expect((screen.getByRole('combobox', { name: 'BARS' }) as HTMLSelectElement).value).toBe('1')
    expect(localStorage.getItem('bass-beat-ruler')).toContain('"version":4')
  })

  it('migrates older documents to the duration-aware ruler cue', () => {
    localStorage.setItem('bass-beat-ruler', JSON.stringify({
      version: 2,
      settings: { ...DEFAULT_SAVED_SETTINGS, cueSound: 'click' },
      snap: 4,
      notes: [],
    }))

    render(<BeatRuler />)

    expect((screen.getByRole('combobox', { name: 'RULER CUE' }) as HTMLSelectElement).value).toBe('bass')
    expect((screen.getByRole('combobox', { name: 'BARS' }) as HTMLSelectElement).value).toBe('1')
    expect(localStorage.getItem('bass-beat-ruler')).toContain('"version":4')
  })

  it('adds with left click and removes with right click', () => {
    render(<BeatRuler />)
    fireEvent.click(screen.getByRole('button', { name: 'Add note at 2' }))
    const added = screen.getByTestId('ruler-note-note-15')
    expect(added.getAttribute('aria-label')).toContain('Note at 2')

    fireEvent.contextMenu(added)
    expect(screen.queryByTestId('ruler-note-note-15')).toBeNull()
  })

  it('uses the grid control to toggle eighth and sixteenth subdivisions', () => {
    render(<BeatRuler />)

    expect(screen.getByRole('button', { name: 'Add note at 1 e' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add note at 1 a' })).toBeTruthy()
    expect(screen.getByLabelText('1 bar, 4 beats per bar, sixteenth-note grid').querySelectorAll('.ruler-grid button')).toHaveLength(16)

    fireEvent.click(screen.getByRole('button', { name: 'Eighth' }))

    expect(screen.queryByRole('button', { name: 'Add note at 1 e' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add note at 1 a' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add note at 1 &' })).toBeTruthy()
    expect(screen.getByLabelText('1 bar, 4 beats per bar, eighth-note grid').querySelectorAll('.ruler-grid button')).toHaveLength(8)
  })

  it('renders four bars as two joined rows and trims notes when the pattern is shortened', () => {
    render(<BeatRuler />)
    fireEvent.change(screen.getByRole('combobox', { name: 'BARS' }), { target: { value: '3' } })
    expect(screen.getByTestId('beat-ruler-track-row-2').getAttribute('data-row-bars')).toBe('1')
    expect(screen.getByText('BAR 3')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: 'BARS' }), { target: { value: '4' } })

    expect(screen.getByLabelText('4 bars, 4 beats per bar, sixteenth-note grid').querySelectorAll('.ruler-grid button')).toHaveLength(64)
    expect(screen.getByText('BAR 1')).toBeTruthy()
    expect(screen.getByText('BAR 2')).toBeTruthy()
    expect(screen.getByText('BAR 3')).toBeTruthy()
    expect(screen.getByText('BAR 4')).toBeTruthy()
    expect(screen.getByTestId('beat-ruler-track').querySelectorAll('.ruler-bar-labels span')).toHaveLength(2)
    expect(screen.getByTestId('beat-ruler-track-row-2').querySelectorAll('.ruler-bar-labels span')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Add note at bar 4, beat 1' })).toBeTruthy()
    expect(screen.queryByText('4-bar loop · settings saved automatically')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Add note at bar 4, beat 1' }))
    expect(screen.getByTestId('ruler-note-note-15')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'BARS' }), { target: { value: '1' } })

    expect(screen.queryByTestId('ruler-note-note-15')).toBeNull()
    expect(screen.getByLabelText('1 bar, 4 beats per bar, sixteenth-note grid')).toBeTruthy()
  })

  it('removes off-grid attacks and rounds retained durations up when switching to eighths', () => {
    localStorage.setItem('bass-beat-ruler', JSON.stringify({
      version: 3,
      settings: { ...DEFAULT_SAVED_SETTINGS, cueSound: 'bass' },
      snap: 4,
      notes: [
        { id: 'sixteenth', startStep: 0, durationSteps: 1 },
        { id: 'off-grid', startStep: 1, durationSteps: 1 },
        { id: 'dotted-eighth', startStep: 4, durationSteps: 3 },
      ],
    }))
    render(<BeatRuler />)

    fireEvent.click(screen.getByRole('button', { name: 'Eighth' }))

    expect(screen.queryByTestId('ruler-note-off-grid')).toBeNull()
    expect(screen.getByTestId('ruler-note-sixteenth').getAttribute('aria-label')).toContain('2 sixteenth-note steps')
    expect(screen.getByTestId('ruler-note-dotted-eighth').getAttribute('aria-label')).toContain('4 sixteenth-note steps')
    const saved = JSON.parse(localStorage.getItem('bass-beat-ruler') ?? '{}') as { notes: Array<{ startStep: number }> }
    expect(saved.notes.some((note) => note.startStep % 2 === 1)).toBe(false)
  })

  it('drags a note edge to extend it with sixteenth-note snapping', () => {
    render(<BeatRuler />)
    const track = screen.getByTestId('beat-ruler-track')
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 160, bottom: 180, width: 160, height: 180, toJSON: () => ({}),
    })
    const handle = screen.getByRole('button', { name: 'Resize note at 1' })
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 40 })
    fireEvent.pointerMove(track, { pointerId: 1, clientX: 60 })
    fireEvent.pointerUp(track, { pointerId: 1, clientX: 60 })

    expect(screen.getByTestId('ruler-note-note-0').getAttribute('aria-label')).toContain('6 sixteenth-note steps')
  })

  it('drags a note edge back to shorten it', () => {
    render(<BeatRuler />)
    const track = screen.getByTestId('beat-ruler-track')
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 160, bottom: 180, width: 160, height: 180, toJSON: () => ({}),
    })
    const handle = screen.getByRole('button', { name: 'Resize note at 1' })
    fireEvent.pointerDown(handle, { pointerId: 2, clientX: 40 })
    fireEvent.pointerMove(track, { pointerId: 2, clientX: 20 })
    fireEvent.pointerUp(track, { pointerId: 2, clientX: 20 })

    expect(screen.getByTestId('ruler-note-note-0').getAttribute('aria-label')).toContain('2 sixteenth-note steps')
  })

  it('drags a whole note left without changing its duration', () => {
    render(<BeatRuler />)
    const track = screen.getByTestId('beat-ruler-track')
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 160, bottom: 180, width: 160, height: 180, toJSON: () => ({}),
    })
    const note = screen.getByTestId('ruler-note-note-6')
    fireEvent.pointerDown(note, { button: 0, pointerId: 3, clientX: 70 })
    fireEvent.pointerMove(track, { pointerId: 3, clientX: 50 })
    fireEvent.pointerUp(track, { pointerId: 3, clientX: 50 })

    expect(note.getAttribute('aria-label')).toBe('Note at 2, 2 sixteenth-note steps')
  })

  it('maps dragging in the second ruler row back to the global pattern', () => {
    localStorage.setItem('bass-beat-ruler', JSON.stringify({
      version: 4,
      settings: { ...DEFAULT_SAVED_SETTINGS, bars: 4, cueSound: 'bass' },
      snap: 4,
      notes: [{ id: 'later', startStep: 32, durationSteps: 4 }],
    }))
    render(<BeatRuler />)
    const secondRow = screen.getByTestId('beat-ruler-track-row-2')
    vi.spyOn(secondRow, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180, toJSON: () => ({}),
    })
    const note = screen.getByTestId('ruler-note-later')
    fireEvent.pointerDown(note, { button: 0, pointerId: 4, clientX: 0 })
    fireEvent.pointerMove(secondRow, { pointerId: 4, clientX: 40 })
    fireEvent.pointerUp(secondRow, { pointerId: 4, clientX: 40 })

    expect(note.getAttribute('aria-label')).toContain('bar 3, beat 2')
  })

  it('splits a sustained note cleanly across the two-row boundary', () => {
    localStorage.setItem('bass-beat-ruler', JSON.stringify({
      version: 4,
      settings: { ...DEFAULT_SAVED_SETTINGS, bars: 3, cueSound: 'bass' },
      snap: 4,
      notes: [{ id: 'crossing', startStep: 30, durationSteps: 4 }],
    }))
    render(<BeatRuler />)

    expect(screen.getByTestId('beat-ruler-track').contains(screen.getByTestId('ruler-note-crossing'))).toBe(true)
    expect(screen.getByTestId('beat-ruler-track-row-2').contains(screen.getByTestId('ruler-note-crossing-continuation-1'))).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Resize note at bar 2, beat 4 &' })).toHaveLength(1)
  })

  it('locks editing in Playback mode and stops when returning to Edit', async () => {
    render(<BeatRuler />)
    fireEvent.click(screen.getByRole('button', { name: 'Playback' }))
    expect(screen.getByRole('button', { name: 'Add note at 1' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('region', { name: 'Rhythm settings' }).classList.contains('is-locked')).toBe(true)
    expect(screen.getByText('Locked')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Eighth' }) as HTMLButtonElement).matches(':disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: 'BEATS PER BAR' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: 'BARS' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: 'METRONOME' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('slider', { name: 'Beat ruler volume' }).hasAttribute('disabled')).toBe(false)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start' })))
    expect(engine.start).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(engine.stop).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('finishes starting under React Strict Mode', async () => {
    render(<StrictMode><BeatRuler /></StrictMode>)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start' })))

    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(screen.queryByText('Loading sounds')).toBeNull()
  })

  it('highlights a note for frames throughout its duration', async () => {
    render(<BeatRuler />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start' })))
    act(() => engine.instances[0].callback({ gridStep: 2, activeNoteId: 'note-0' }))

    expect(screen.getByTestId('ruler-note-note-0').classList.contains('active')).toBe(true)
    expect(screen.getByTestId('ruler-playhead').getAttribute('style')).toContain('12.5%')
    act(() => engine.instances[0].callback({ gridStep: 4, activeNoteId: null }))
    expect(screen.getByTestId('ruler-note-note-0').classList.contains('active')).toBe(false)
  })

  it('independently disables ruler cues and updates playback settings', () => {
    render(<BeatRuler />)
    const cueToggle = screen.getByRole('checkbox', { name: 'Sound ruler notes' })
    fireEvent.click(cueToggle)

    expect((cueToggle as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('combobox', { name: 'RULER CUE' }).hasAttribute('disabled')).toBe(true)
    expect(localStorage.getItem('bass-beat-ruler')).toContain('"cueEnabled":false')
    expect(engine.update).not.toHaveBeenCalled()
  })

  it('independently disables the metronome and keeps ruler cues configured', () => {
    render(<BeatRuler />)
    const metronomeToggle = screen.getByRole('checkbox', { name: 'Sound metronome' })
    fireEvent.click(metronomeToggle)

    expect((metronomeToggle as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole('combobox', { name: 'METRONOME' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('combobox', { name: 'RULER CUE' }).hasAttribute('disabled')).toBe(false)
    expect(localStorage.getItem('bass-beat-ruler')).toContain('"metronomeEnabled":false')
  })

  it('shows a recoverable error and disposes audio resources', async () => {
    engine.start.mockRejectedValueOnce(new Error('decode failed'))
    const view = render(<BeatRuler />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start' })))

    expect(screen.getByRole('alert').textContent).toContain('Could not start playback')
    expect(engine.stop).toHaveBeenCalledOnce()
    view.unmount()
    expect(engine.dispose).toHaveBeenCalledOnce()
  })
})
