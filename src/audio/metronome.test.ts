import { describe, expect, it, vi } from 'vitest'
import type { RhythmEvent } from '../rhythm/pattern'
import { MetronomeEngine, positionForStep, secondsPerStep, type MetronomeSettings } from './metronome'
import type { RhythmAudioPort } from './toneAdapter'

const settings: MetronomeSettings = {
  bpm: 80,
  beatsPerBar: 4,
  subdivision: 1,
  accentFirstBeat: true,
  volume: 0.7,
  sound: 'woodblock',
}

class FakeAudio implements RhythmAudioPort {
  prepare = vi.fn<() => Promise<void>>(async () => undefined)
  setBpm = vi.fn()
  setBeatsPerBar = vi.fn()
  setVolume = vi.fn()
  clearSchedule = vi.fn()
  startTransport = vi.fn()
  stopTransport = vi.fn()
  dispose = vi.fn()
  trigger = vi.fn<(event: RhythmEvent, audioTime: number, durationTicks: number) => void>()
  scheduleDraw = vi.fn((callback: () => void) => callback())
  scheduledCallback?: (time: number) => void
  scheduleEveryTicks = vi.fn((callback: (time: number) => void) => {
    this.scheduledCallback = callback
    return 41
  })

  tick(time = 10) { this.scheduledCallback?.(time) }
}

describe('metronome timing', () => {
  it('calculates quarter, eighth, and sixteenth-note durations from BPM', () => {
    expect(secondsPerStep(120, 1)).toBe(0.5)
    expect(secondsPerStep(120, 2)).toBe(0.25)
    expect(secondsPerStep(120, 4)).toBe(0.125)
  })

  it('maps canonical grid steps to beats and sixteenth subdivisions', () => {
    expect(positionForStep(0)).toEqual({ beat: 0, subdivision: 0 })
    expect(positionForStep(3)).toEqual({ beat: 0, subdivision: 3 })
    expect(positionForStep(4)).toEqual({ beat: 1, subdivision: 0 })
  })
})

describe('MetronomeEngine', () => {
  it('configures Tone, schedules sixteenth ticks, and starts once', async () => {
    const audio = new FakeAudio()
    const engine = new MetronomeEngine(settings, vi.fn(), audio)

    await expect(engine.start()).resolves.toBe(true)
    await expect(engine.start()).resolves.toBeUndefined()

    expect(audio.prepare).toHaveBeenCalledOnce()
    expect(audio.setBpm).toHaveBeenLastCalledWith(80)
    expect(audio.setBeatsPerBar).toHaveBeenLastCalledWith(4)
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.7)
    expect(audio.scheduleEveryTicks).toHaveBeenCalledWith(expect.any(Function), 48)
    expect(audio.startTransport).toHaveBeenCalledOnce()
    expect(engine.isRunning).toBe(true)
  })

  it('uses the pattern for attacks while emitting a visual tick for every grid step', async () => {
    const audio = new FakeAudio()
    const onTick = vi.fn()
    const engine = new MetronomeEngine(settings, onTick, audio)
    await engine.start()

    for (let step = 0; step < 5; step += 1) audio.tick(20 + step)

    expect(onTick.mock.calls.map(([tick]) => tick.gridStep)).toEqual([0, 1, 2, 3, 4])
    expect(audio.trigger).toHaveBeenCalledTimes(2)
    expect(audio.trigger.mock.calls[0]).toEqual([
      expect.objectContaining({ startStep: 0, voice: 'woodblock', accent: true }), 20, 48,
    ])
    expect(audio.trigger.mock.calls[1][0]).toMatchObject({ startStep: 4, voice: 'woodblock' })
  })

  it('applies BPM and master volume immediately', () => {
    const audio = new FakeAudio()
    const engine = new MetronomeEngine(settings, vi.fn(), audio)
    engine.update({ ...settings, bpm: 132, volume: 0.25 })

    expect(audio.setBpm).toHaveBeenLastCalledWith(132)
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.25)
  })

  it('applies sound changes on the next pulse instead of waiting for a new bar', async () => {
    const audio = new FakeAudio()
    const sixteenths = { ...settings, subdivision: 4 as const }
    const engine = new MetronomeEngine(sixteenths, vi.fn(), audio)
    await engine.start()
    audio.tick() // woodblock downbeat

    engine.update({ ...sixteenths, sound: 'click' })
    audio.tick() // subdivision inside the same bar

    expect(audio.trigger.mock.calls.map(([event]) => event.voice)).toEqual(['woodblock', 'click'])
    expect(audio.trigger.mock.calls[1][0]).toMatchObject({ emphasis: 'subdivision' })
  })

  it('applies subdivision changes on the next grid pulse', async () => {
    const audio = new FakeAudio()
    const engine = new MetronomeEngine(settings, vi.fn(), audio)
    await engine.start()
    audio.tick() // quarter-note downbeat
    audio.tick() // step 1 is silent

    engine.update({ ...settings, subdivision: 2 })
    audio.tick() // step 2 is the eighth-note offbeat

    expect(audio.trigger).toHaveBeenCalledTimes(2)
    expect(audio.trigger.mock.calls[1][0]).toMatchObject({
      startStep: 2,
      voice: 'woodblock',
      emphasis: 'subdivision',
    })
  })

  it('commits meter edits atomically on the next downbeat', async () => {
    const audio = new FakeAudio()
    const engine = new MetronomeEngine(settings, vi.fn(), audio)
    await engine.start()
    audio.tick() // old pattern downbeat
    engine.update({ ...settings, beatsPerBar: 3, subdivision: 2, sound: 'drums' })

    for (let step = 1; step < 16; step += 1) audio.tick()
    expect(audio.setBeatsPerBar).not.toHaveBeenLastCalledWith(3)
    const callsBeforeNewBar = audio.trigger.mock.calls.length

    audio.tick(30) // next downbeat
    expect(audio.setBeatsPerBar).toHaveBeenLastCalledWith(3)
    expect(audio.trigger.mock.calls.length).toBe(callsBeforeNewBar + 2)
    expect(audio.trigger.mock.calls.slice(-2).map(([event]) => event.voice)).toEqual(['hihat', 'kick'])
  })

  it('stops scheduled work, resets, and can start cleanly again', async () => {
    const audio = new FakeAudio()
    const onTick = vi.fn()
    const engine = new MetronomeEngine(settings, onTick, audio)
    await engine.start()
    audio.tick()
    engine.stop()
    audio.tick()

    expect(engine.isRunning).toBe(false)
    expect(audio.stopTransport).toHaveBeenCalledOnce()
    expect(audio.clearSchedule).toHaveBeenCalledWith(41)
    expect(onTick).toHaveBeenCalledOnce()

    await engine.start()
    audio.tick()
    expect(onTick.mock.calls[1][0].gridStep).toBe(0)
    expect(audio.scheduleEveryTicks).toHaveBeenCalledTimes(2)
  })

  it('does not start the transport when audio preparation fails', async () => {
    const audio = new FakeAudio()
    audio.prepare.mockRejectedValueOnce(new Error('decode failed'))
    const engine = new MetronomeEngine(settings, vi.fn(), audio)

    await expect(engine.start()).rejects.toThrow('decode failed')
    expect(engine.isRunning).toBe(false)
    expect(audio.scheduleEveryTicks).not.toHaveBeenCalled()
    expect(audio.startTransport).not.toHaveBeenCalled()
  })

  it('cancels an in-flight start when disposed', async () => {
    let finishPrepare!: () => void
    const audio = new FakeAudio()
    audio.prepare.mockImplementationOnce(() => new Promise<void>((resolve) => { finishPrepare = resolve }))
    const engine = new MetronomeEngine(settings, vi.fn(), audio)

    const start = engine.start()
    engine.dispose()
    finishPrepare()

    await expect(start).resolves.toBe(false)
    expect(audio.startTransport).not.toHaveBeenCalled()
    expect(audio.dispose).toHaveBeenCalledOnce()
    await expect(engine.start()).rejects.toThrow('disposed')
  })
})
