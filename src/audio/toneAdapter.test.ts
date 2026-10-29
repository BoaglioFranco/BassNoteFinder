import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RhythmEvent } from '../rhythm/pattern'

const mocks = vi.hoisted(() => {
  const polySynths: Array<{ options: Record<string, unknown>, triggerAttackRelease: ReturnType<typeof vi.fn> }> = []
  const samplers: Array<{ options: Record<string, unknown>, triggerAttack: ReturnType<typeof vi.fn>, triggerAttackRelease: ReturnType<typeof vi.fn> }> = []
  const transport = {
    bpm: { value: 120 }, timeSignature: 4, position: 0 as string | number,
    scheduleRepeat: vi.fn(() => 9), clear: vi.fn(), start: vi.fn(), stop: vi.fn(),
  }
  const draw = { schedule: vi.fn((callback: () => void) => callback()), cancel: vi.fn() }
  return {
    polySynths, samplers, transport, draw,
    start: vi.fn(async () => undefined), loaded: vi.fn(async () => undefined),
    gainRamp: vi.fn(), gainDispose: vi.fn(), polyRelease: vi.fn(), polyDispose: vi.fn(),
    samplerRelease: vi.fn(), samplerDispose: vi.fn(),
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
  Synth: class {},
  PolySynth: class {
    triggerAttackRelease = vi.fn()
    options: Record<string, unknown>
    constructor(_voice: unknown, options: Record<string, unknown>) { this.options = options; mocks.polySynths.push(this) }
    connect() { return this }
    releaseAll() { mocks.polyRelease() }
    dispose() { mocks.polyDispose() }
  },
  Sampler: class {
    triggerAttack = vi.fn()
    triggerAttackRelease = vi.fn()
    options: Record<string, unknown>
    constructor(options: Record<string, unknown>) { this.options = options; mocks.samplers.push(this) }
    connect() { return this }
    releaseAll() { mocks.samplerRelease() }
    dispose() { mocks.samplerDispose() }
  },
}))

import { ToneRhythmAudio } from './toneAdapter'

function event(voice: RhythmEvent['voice'], emphasis: RhythmEvent['emphasis'] = 'beat'): RhythmEvent {
  return { id: `${voice}-0`, startStep: 0, durationSteps: 1, voice, velocity: 0.8, accent: emphasis === 'downbeat', emphasis }
}

describe('ToneRhythmAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.polySynths.length = 0
    mocks.samplers.length = 0
    mocks.transport.bpm.value = 120
    mocks.transport.timeSignature = 4
  })

  it('unlocks audio, creates reusable instruments once, and waits for samples', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    await audio.prepare()

    expect(mocks.start).toHaveBeenCalledTimes(2)
    expect(mocks.loaded).toHaveBeenCalledTimes(2)
    expect(mocks.polySynths).toHaveLength(3)
    expect(mocks.samplers).toHaveLength(8)
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

    expect(mocks.polySynths[0].triggerAttackRelease.mock.calls.map(([pitch]) => pitch)).toEqual(['E6', 'C6', 'G5'])
    expect(mocks.polySynths[1].triggerAttackRelease.mock.calls.map(([pitch]) => pitch)).toEqual(['D6', 'B5', 'G5'])
  })

  it('routes pulse and sustained cues through dedicated polyphonic voices', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.trigger({ ...event('click'), audioTrack: 'pulse' }, 1, 48)
    audio.trigger({ ...event('bass'), audioTrack: 'cue' }, 1, 192)

    expect(mocks.polySynths[0].triggerAttackRelease).toHaveBeenCalledWith('C6', '48i', 1, 0.8)
    expect(mocks.samplers[6].triggerAttackRelease).toHaveBeenCalledWith('E1', '192i', 1, 0.8)
  })

  it('holds the sustained ruler tone for the full scheduled note duration', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.trigger({ ...event('bass', 'downbeat'), durationSteps: 16, audioTrack: 'cue' }, 2, 768)
    audio.trigger({ ...event('bass', 'beat'), durationSteps: 8, audioTrack: 'cue' }, 3, 384)
    audio.trigger({ ...event('bass', 'subdivision'), durationSteps: 4, audioTrack: 'cue' }, 4, 192)

    expect(mocks.samplers[6].triggerAttackRelease.mock.calls.map(([pitch]) => pitch)).toEqual(['E1', 'E1', 'E1'])
    expect(mocks.samplers[6].triggerAttackRelease.mock.calls.map(([, duration]) => duration)).toEqual(['768i', '384i', '192i'])
  })

  it('provides two recorded bass articulations and a synth bass at one stable pitch', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    for (const [index, voice] of ['bass', 'pickedBass', 'synthBass'].entries()) {
      audio.trigger({ ...event(voice as RhythmEvent['voice']), audioTrack: 'cue' }, index, 192)
    }

    expect(mocks.samplers[6].options.urls).toEqual({ E1: '/audio/bass/finger-e1.wav' })
    expect(mocks.samplers[7].options.urls).toEqual({ E1: '/audio/bass/picked-e1.wav' })
    expect(mocks.samplers[6].triggerAttackRelease).toHaveBeenCalledWith('E1', '192i', 0, 0.8)
    expect(mocks.samplers[7].triggerAttackRelease).toHaveBeenCalledWith('E1', '192i', 1, 0.8)
    expect(mocks.polySynths[2].triggerAttackRelease).toHaveBeenCalledWith('E1', '192i', 2, 0.8)
  })

  it('round-robins recorded drum samples instead of allocating sounds per hit', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.trigger(event('kick'), 1, 48)
    audio.trigger(event('kick'), 2, 48)
    audio.trigger(event('kick'), 3, 48)

    expect(mocks.samplers[0].triggerAttack).toHaveBeenNthCalledWith(1, 'C1', 1, 0.8)
    expect(mocks.samplers[1].triggerAttack).toHaveBeenCalledWith('C1', 2, 0.8)
    expect(mocks.samplers[0].triggerAttack).toHaveBeenNthCalledWith(2, 'C1', 3, 0.8)
  })

  it('applies per-voice trims so quiet hi-hat recordings remain audible', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.trigger(event('hihat'), 1, 48)

    expect(mocks.samplers[0].options.volume).toBe(8)
    expect(mocks.samplers[2].options.volume).toBe(0)
    expect(mocks.samplers[4].options.volume).toBe(18)
    expect(mocks.samplers[4].triggerAttack).toHaveBeenCalledWith('C1', 1, 0.8)
  })

  it('disposes every audio resource and cancels pending draws', async () => {
    const audio = new ToneRhythmAudio()
    await audio.prepare()
    audio.dispose()

    expect(mocks.polyRelease).toHaveBeenCalledTimes(3)
    expect(mocks.samplerRelease).toHaveBeenCalledTimes(8)
    expect(mocks.polyDispose).toHaveBeenCalledTimes(3)
    expect(mocks.samplerDispose).toHaveBeenCalledTimes(8)
    expect(mocks.gainDispose).toHaveBeenCalledOnce()
    expect(mocks.draw.cancel).toHaveBeenCalledOnce()
  })
})
