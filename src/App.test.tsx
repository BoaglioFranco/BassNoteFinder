// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioSnapshot } from './audio/microphone'
import App from './App'

const microphone = vi.hoisted(() => ({
  callback: undefined as ((snapshot: AudioSnapshot) => void) | undefined,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
}))

vi.mock('./audio/microphone', () => ({
  BassMicrophoneAnalyzer: class {
    constructor(callback: (snapshot: AudioSnapshot) => void) { microphone.callback = callback }
    start() { return microphone.start() }
    stop() { microphone.stop() }
  },
}))

function stableSnapshot(frequency: number): AudioSnapshot {
  return {
    state: 'listening',
    signalLevel: 0.08,
    reading: { frequency, clarity: 0.96, rms: 0.08, stable: true, sampleCount: 7, spreadCents: 3 },
  }
}

async function renderApp() {
  const view = render(<App />)
  await screen.findByRole('button', { name: 'Start practice' })
  return view
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    window.history.replaceState(null, '', '/')
    vi.spyOn(Math, 'random').mockReturnValue(0)
    microphone.callback = undefined
    microphone.start.mockClear()
    microphone.stop.mockClear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('opens directly in note-name practice with routed tool tabs', async () => {
    render(<App />)

    expect(await screen.findByText('PLAY THIS NOTE')).toBeTruthy()
    expect(screen.getByLabelText('Play C')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Tools' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Tuner' }).getAttribute('href')).toBe('/tuner')
    expect(screen.getByRole('link', { name: 'Metronome' }).getAttribute('href')).toBe('/metronome')
  })

  it('matches any octave in note-name mode and gives green feedback', async () => {
    await renderApp()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start practice' })))

    act(() => microphone.callback?.(stableSnapshot(65.4064))) // C2

    expect(screen.getByText('That’s it')).toBeTruthy()
    expect(document.querySelector('.app')?.classList.contains('feedback-correct')).toBe(true)
  })

  it('advances hands-free after a short success confirmation', async () => {
    await renderApp()
    vi.useFakeTimers()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start practice' })))
    act(() => microphone.callback?.(stableSnapshot(65.4064))) // target C

    expect(screen.getByLabelText('Play C')).toBeTruthy()
    act(() => vi.advanceTimersByTime(480))

    expect(screen.getByLabelText('Play D♭')).toBeTruthy()
    expect(screen.getByText('Listening…')).toBeTruthy()
  })

  it('shows red feedback only for a stable wrong note', async () => {
    await renderApp()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start practice' })))

    act(() => microphone.callback?.({ ...stableSnapshot(73.416), reading: { ...stableSnapshot(73.416).reading!, stable: false } }))
    expect(screen.queryByText('Try another note')).toBeNull()

    act(() => microphone.callback?.(stableSnapshot(73.416))) // D2, target C
    expect(screen.getByText('Try another note')).toBeTruthy()
  })

  it('remembers bass-clef mode and requires the exact pitch', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Bass clef' }))

    expect(localStorage.getItem('bass-note-finder-mode')).toBe('staff')
    expect(screen.getByRole('img', { name: 'Play the note shown on the bass clef' })).toBeTruthy()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start practice' })))
    act(() => microphone.callback?.(stableSnapshot(61.7354))) // B1, target is low B0

    expect(screen.getByText('Try another note')).toBeTruthy()
  })

  it('routes to the tuner without creating another microphone session', async () => {
    await renderApp()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start practice' })))
    act(() => microphone.callback?.(stableSnapshot(30.8677)))
    fireEvent.click(screen.getByRole('link', { name: 'Tuner' }))

    expect(await screen.findByText('TUNER')).toBeTruthy()
    expect(window.location.pathname).toBe('/tuner')
    expect(screen.getByText('30.87')).toBeTruthy()
    expect(microphone.start).toHaveBeenCalledOnce()
  })

  it('routes to a configurable metronome and saves its settings', async () => {
    await renderApp()
    fireEvent.click(screen.getByRole('link', { name: 'Metronome' }))

    expect(await screen.findByRole('region', { name: 'Metronome' })).toBeTruthy()
    expect(window.location.pathname).toBe('/metronome')
    expect(screen.getByRole('spinbutton', { name: 'Tempo in BPM' }).getAttribute('value')).toBe('80')
    fireEvent.click(screen.getByRole('button', { name: '♬ 16th' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Tempo in BPM' }), { target: { value: '96' } })
    expect((screen.getByRole('combobox', { name: 'SOUND' }) as HTMLSelectElement).value).toBe('woodblock')
    fireEvent.change(screen.getByRole('combobox', { name: 'SOUND' }), { target: { value: 'drums' } })
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.4' } })

    expect(localStorage.getItem('bass-metronome-settings')).toContain('"bpm":96')
    expect(localStorage.getItem('bass-metronome-settings')).toContain('"sound":"drums"')
    expect(localStorage.getItem('bass-metronome-settings')).toContain('"volume":0.4')
    expect(screen.getByLabelText('4 beat bar with 4 subdivisions per beat').children).toHaveLength(16)
  })

  it('stops an active analyzer when the component unmounts', async () => {
    const view = await renderApp()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start practice' })))
    view.unmount()
    expect(microphone.stop).toHaveBeenCalledOnce()
  })
})
