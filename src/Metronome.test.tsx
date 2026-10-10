// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Metronome from './Metronome'

const engine = vi.hoisted(() => ({
  instances: [] as Array<{ callback: (tick: { gridStep: number }) => void }>,
  start: vi.fn<() => Promise<boolean | undefined>>(async () => true),
  stop: vi.fn(),
  update: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock('./audio/metronome', () => ({
  MetronomeEngine: class {
    constructor(_settings: unknown, callback: (tick: { gridStep: number }) => void) {
      engine.instances.push({ callback })
    }
    start() { return engine.start() }
    stop() { engine.stop() }
    update(settings: unknown) { engine.update(settings) }
    dispose() { engine.dispose() }
  },
}))

describe('Metronome UI', () => {
  beforeEach(() => {
    localStorage.clear()
    engine.instances.length = 0
    engine.start.mockReset().mockResolvedValue(true)
    engine.stop.mockClear()
    engine.update.mockClear()
    engine.dispose.mockClear()
  })

  afterEach(cleanup)

  it('uses safe defaults and persists a versioned settings document', () => {
    render(<Metronome />)

    expect((screen.getByRole('spinbutton', { name: 'Tempo in BPM' }) as HTMLInputElement).value).toBe('80')
    const sound = screen.getByRole('combobox', { name: 'SOUND' }) as HTMLSelectElement
    expect(sound.value).toBe('woodblock')
    expect(sound.options[0].value).toBe('woodblock')
    expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).value).toBe('0.7')
    expect(localStorage.getItem('bass-metronome-settings')).toContain('"soundVersion":2')
  })

  it('migrates old settings to woodblock and clamps unsafe values', () => {
    localStorage.setItem('bass-metronome-settings', JSON.stringify({
      bpm: 900, beatsPerBar: 19, subdivision: 3, volume: -4, sound: 'click',
    }))
    render(<Metronome />)

    expect((screen.getByRole('spinbutton', { name: 'Tempo in BPM' }) as HTMLInputElement).value).toBe('240')
    expect((screen.getByRole('combobox', { name: 'BEATS PER BAR' }) as HTMLSelectElement).value).toBe('4')
    expect((screen.getByRole('combobox', { name: 'SOUND' }) as HTMLSelectElement).value).toBe('woodblock')
    expect((screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement).value).toBe('0')
  })

  it('updates all controls and the visible ruler', () => {
    render(<Metronome />)
    fireEvent.click(screen.getByRole('button', { name: '♬ 16th' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'BEATS PER BAR' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'SOUND' }), { target: { value: 'drums' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.42' } })

    expect(screen.getByLabelText('3 beat bar with 4 subdivisions per beat').children).toHaveLength(12)
    expect(screen.getByText('42%')).toBeTruthy()
    expect(localStorage.getItem('bass-metronome-settings')).toContain('"beatsPerBar":3')
    expect(localStorage.getItem('bass-metronome-settings')).toContain('"sound":"drums"')
  })

  it('waits for audio preparation, starts, receives visual ticks, and stops', async () => {
    let finishStart!: (started: boolean) => void
    engine.start.mockImplementationOnce(() => new Promise((resolve) => { finishStart = resolve }))
    render(<Metronome />)

    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('button', { name: 'Loading…' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Loading sounds')).toBeTruthy()
    await act(async () => finishStart(true))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()

    act(() => engine.instances[0].callback({ gridStep: 4 }))
    const steps = document.querySelectorAll('.pulse-step')
    expect(steps[1].classList.contains('active')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(engine.stop).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('shows a recoverable error when the audio engine cannot start', async () => {
    engine.start.mockRejectedValueOnce(new Error('sample decode failed'))
    render(<Metronome />)

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start' })))
    expect(screen.getByRole('alert').textContent).toContain('Could not start the audio engine')
    expect(engine.stop).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy()
  })

  it('disposes the engine when navigating away', async () => {
    const view = render(<Metronome />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start' })))
    view.unmount()
    expect(engine.dispose).toHaveBeenCalledOnce()
  })
})
