import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RhythmEvent } from '../rhythm/pattern'

const mocks = vi.hoisted(() => {
  const players = new Map<string, { start: ReturnType<typeof vi.fn> }>()
  const transport = {
    bpm: { value: 120 }, timeSignature: 4, position: 0 as string | number,
    scheduleRepeat: vi.fn(() => 9), clear: vi.fn(), start: vi.fn(), stop: vi.fn(),
  }
  const draw = { schedule: vi.fn((callback: () => void) => callback()), cancel: vi.fn() }
  return {
    players, transport, draw,
    start: vi.fn(async () => undefined), loaded: vi.fn(async () => undefined),
    gainRamp: vi.fn(), gainDispose: vi.fn(), synthTrigger: vi.fn(), synthDispose: vi.fn(),
    playersStop: vi.fn(), playersDispose: vi.fn(),
  }
})

vi.mock('tone', () => ({
  start: mocks.start,
  loaded: mocks.loaded,
  getTransport: () => mocks.transport,
  getDraw: () => mocks.draw,
  Gain: class {
    gain = { rampTo: mocks.gainRamp }
    toDestination() { return this }
    dispose() { mocks.gainDispose() }
  },
  Synth: class {
    connect() { return this }
    triggerAttackRelease(...args: unknown[]) { mocks.synthTrigger(...args) }
    dispose() { mocks.synthDispose() }
  },
  Players: class {
    constructor(options: { urls: Record<string, string> }) {
      Object.keys(options.urls).forEach((name) => mocks.players.set(name, { start: vi.fn() }))
    }
    connect() { return this }
    player(name: string) { return mocks.players.get(name)! }
    stopAll() { mocks.playersStop() }
    dispose() { mocks.playersDispose() }
  },
}))

import { ToneRhythmAudio } from './toneAdapter'

function event(voice: RhythmEvent['voice'], emphasis: RhythmEvent['emphasis'] = 'beat'): RhythmEvent {
  return { id: `${voice}-0`, startStep: 0, durationSteps: 1, voice, velocity: 0.8, accent: emphasis === 'downbeat', emphasis }
}

describe('ToneRhythmAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.players.clear()
    mocks.transport.bpm.value = 120
    mocks.transport.timeSignature = 4
  })

  it('unlocks audio, creates reusable instruments once, and waits for samples', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    await audio.prepare()

    expect(mocks.start).toHaveBeenCalledTimes(2)
    expect(mocks.loaded).toHaveBeenCalledTimes(2)
    expect(mocks.players.size).toBe(6)
  })

  it('delegates musical scheduling and draw synchronization to Tone', () => {
    const audio = new ToneRhythmAudio()
    const callback = vi.fn()
    const draw = vi.fn()

    expect(audio.scheduleEveryTicks(callback, 48)).toBe(9)
    expect(mocks.transport.scheduleRepeat).toHaveBeenCalledWith(callback, '48i', 0)
    audio.scheduleDraw(draw, 12.5)
    expect(mocks.draw.schedule).toHaveBeenCalledWith(draw, 12.5)
    expect(draw).toHaveBeenCalledOnce()
  })

  it('sets tempo, meter, master gain, and resets transport lifecycle', () => {
    const audio = new ToneRhythmAudio()
    audio.setBpm(96)
    audio.setBeatsPerBar(5)
    audio.setVolume(0.35)
    audio.startTransport()
    audio.clearSchedule(9)
    audio.stopTransport()

    expect(mocks.transport.bpm.value).toBe(96)
    expect(mocks.transport.timeSignature).toBe(5)
    expect(mocks.transport.start).toHaveBeenCalledWith('+0.05')
    expect(mocks.transport.clear).toHaveBeenCalledWith(9)
    expect(mocks.transport.stop).toHaveBeenCalledTimes(2)
    expect(mocks.transport.position).toBe(0)
    expect(mocks.draw.cancel).toHaveBeenCalledOnce()
  })

  it('gives click and woodblock distinct downbeat, beat, and subdivision pitches', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.trigger(event('click', 'downbeat'), 1, 48)
    audio.trigger(event('click', 'beat'), 2, 48)
    audio.trigger(event('click', 'subdivision'), 3, 48)
    audio.trigger(event('woodblock', 'downbeat'), 4, 48)
    audio.trigger(event('woodblock', 'beat'), 5, 48)
    audio.trigger(event('woodblock', 'subdivision'), 6, 48)

    expect(mocks.synthTrigger.mock.calls.map(([pitch]) => pitch)).toEqual([
      'E6', 'C6', 'G5', 'D6', 'B5', 'G5',
    ])
  })

  it('round-robins recorded drum samples instead of allocating sounds per hit', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.trigger(event('kick'), 1, 48)
    audio.trigger(event('kick'), 2, 48)
    audio.trigger(event('kick'), 3, 48)

    expect(mocks.players.get('kick1')?.start).toHaveBeenNthCalledWith(1, 1)
    expect(mocks.players.get('kick2')?.start).toHaveBeenCalledWith(2)
    expect(mocks.players.get('kick1')?.start).toHaveBeenNthCalledWith(2, 3)
  })

  it('disposes every audio resource and cancels pending draws', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.dispose()

    expect(mocks.synthDispose).toHaveBeenCalledTimes(2)
    expect(mocks.playersDispose).toHaveBeenCalledOnce()
    expect(mocks.gainDispose).toHaveBeenCalledOnce()
    expect(mocks.draw.cancel).toHaveBeenCalledOnce()
  })
})
