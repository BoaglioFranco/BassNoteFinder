import { describe, expect, it, vi } from 'vitest'
import type { RhythmEvent } from '../rhythm/pattern'
import type { BeatRulerNote } from '../rhythm/beatRuler'
import { BeatRulerEngine, type BeatRulerPlaybackSettings } from './beatRuler'
import type { RhythmAudioPort } from './toneAdapter'

const settings: BeatRulerPlaybackSettings = {
  bpm: 90,
  beatsPerBar: 4,
  bars: 1,
  volume: 0.65,
  metronomeEnabled: true,
  metronomeSound: 'woodblock',
  cueEnabled: true,
  cueSound: 'bass',
}

const notes: BeatRulerNote[] = [
  { id: 'long', startStep: 0, durationSteps: 3 },
  { id: 'later', startStep: 6, durationSteps: 2 },
]

class FakeAudio implements RhythmAudioPort {
  prepare = vi.fn<() => Promise<void>>(async () => undefined)
  setBpm = vi.fn()
  setBeatsPerBar = vi.fn()
  setVolume = vi.fn()
  clearSchedule = vi.fn()
  startTransport = vi.fn()
  stopTransport = vi.fn()
  dispose = vi.fn()
  trigger = vi.fn<(event: RhythmEvent, time: number, duration: number) => void>()
  scheduleDraw = vi.fn((callback: () => void) => callback())
  scheduledCallback?: (time: number) => void
  scheduleEveryTicks = vi.fn((callback: (time: number) => void) => {
    this.scheduledCallback = callback
    return 72
  })
  tick(time = 10) { this.scheduledCallback?.(time) }
}

describe('BeatRulerEngine', () => {
  it('configures audio and schedules the canonical sixteenth grid', async () => {
    const audio = new FakeAudio()
    const engine = new BeatRulerEngine(settings, notes, vi.fn(), audio)
    await expect(engine.start()).resolves.toBe(true)

    expect(audio.setBpm).toHaveBeenLastCalledWith(90)
    expect(audio.setBeatsPerBar).toHaveBeenLastCalledWith(4)
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.65)
    expect(audio.scheduleEveryTicks).toHaveBeenCalledWith(expect.any(Function), 48)
    expect(audio.startTransport).toHaveBeenCalledOnce()
  })

  it('layers the ruler attack over the background metronome', async () => {
    const audio = new FakeAudio()
    const engine = new BeatRulerEngine(settings, notes, vi.fn(), audio)
    await engine.start()
    audio.tick(12)

    expect(audio.trigger).toHaveBeenCalledTimes(2)
    expect(audio.trigger.mock.calls.map(([event]) => event.voice)).toEqual(['woodblock', 'bass'])
    expect(audio.trigger.mock.calls.map(([event]) => event.audioTrack)).toEqual(['pulse', 'cue'])
    expect(audio.trigger.mock.calls[1]).toEqual([
      expect.objectContaining({ id: 'cue-long', durationSteps: 3, emphasis: 'downbeat' }), 12, 144,
    ])
  })

  it('keeps a note visually active for its complete duration', async () => {
    const audio = new FakeAudio()
    const onFrame = vi.fn()
    const engine = new BeatRulerEngine(settings, notes, onFrame, audio)
    await engine.start()
    for (let step = 0; step < 4; step += 1) audio.tick()

    expect(onFrame.mock.calls.map(([frame]) => frame.activeNoteId)).toEqual(['long', 'long', 'long', null])
    expect(onFrame.mock.calls.map(([frame]) => frame.gridStep)).toEqual([0, 1, 2, 3])
  })

  it('plays every configured bar as one loop and repeats the metronome each bar', async () => {
    const audio = new FakeAudio()
    const onFrame = vi.fn()
    const multiBarNotes = [...notes, { id: 'bar-two', startStep: 16, durationSteps: 2 }]
    const engine = new BeatRulerEngine({ ...settings, bars: 2 }, multiBarNotes, onFrame, audio)
    await engine.start()
    for (let step = 0; step < 33; step += 1) audio.tick(step)

    const pulses = audio.trigger.mock.calls.filter(([event]) => event.audioTrack === 'pulse')
    const secondBarCues = audio.trigger.mock.calls.filter(([event]) => event.id === 'cue-bar-two')
    expect(pulses).toHaveLength(9)
    expect(secondBarCues).toHaveLength(1)
    expect(onFrame.mock.calls[31][0].gridStep).toBe(31)
    expect(onFrame.mock.calls[32][0].gridStep).toBe(0)
  })

  it('can mute ruler cues without muting the metronome', async () => {
    const audio = new FakeAudio()
    const engine = new BeatRulerEngine({ ...settings, cueEnabled: false }, notes, vi.fn(), audio)
    await engine.start()
    audio.tick()

    expect(audio.trigger).toHaveBeenCalledOnce()
    expect(audio.trigger.mock.calls[0][0].voice).toBe('woodblock')
  })

  it('can mute the metronome without muting ruler cues or visuals', async () => {
    const audio = new FakeAudio()
    const onFrame = vi.fn()
    const engine = new BeatRulerEngine({ ...settings, metronomeEnabled: false }, notes, onFrame, audio)
    await engine.start()
    audio.tick()

    expect(audio.trigger).toHaveBeenCalledOnce()
    expect(audio.trigger.mock.calls[0][0]).toMatchObject({ voice: 'bass', audioTrack: 'cue' })
    expect(onFrame).toHaveBeenCalledWith({ gridStep: 0, activeNoteId: 'long' })
  })

  it('keeps pulse and sustained cue attacks bounded across loops and silent after stop', async () => {
    const audio = new FakeAudio()
    const engine = new BeatRulerEngine({ ...settings, metronomeSound: 'click', cueSound: 'synthBass' }, notes, vi.fn(), audio)
    await engine.start()
    for (let step = 0; step < 32; step += 1) audio.tick(step)

    const pulses = audio.trigger.mock.calls.filter(([event]) => event.audioTrack === 'pulse')
    const cues = audio.trigger.mock.calls.filter(([event]) => event.audioTrack === 'cue')
    expect(pulses).toHaveLength(8)
    expect(cues).toHaveLength(4)
    engine.stop()
    audio.tick(99)
    expect(audio.trigger).toHaveBeenCalledTimes(12)
  })

  it('applies BPM, volume, and sound updates while running', async () => {
    const audio = new FakeAudio()
    const engine = new BeatRulerEngine(settings, notes, vi.fn(), audio)
    await engine.start()
    engine.update({ ...settings, bpm: 130, volume: 0.3, metronomeSound: 'hihat', cueSound: 'pickedBass' }, notes)
    audio.tick()

    expect(audio.setBpm).toHaveBeenLastCalledWith(130)
    expect(audio.setVolume).toHaveBeenLastCalledWith(0.3)
    expect(audio.trigger.mock.calls.map(([event]) => event.voice)).toEqual(['hihat', 'pickedBass'])
  })

  it('rejects overlapping patterns before scheduling them', () => {
    const audio = new FakeAudio()
    expect(() => new BeatRulerEngine(settings, [
      { id: 'a', startStep: 0, durationSteps: 3 },
      { id: 'b', startStep: 2, durationSteps: 2 },
    ], vi.fn(), audio)).toThrow('overlaps')
    expect(audio.scheduleEveryTicks).not.toHaveBeenCalled()
  })

  it('stops, clears scheduling, and disposes safely', async () => {
    const audio = new FakeAudio()
    const engine = new BeatRulerEngine(settings, notes, vi.fn(), audio)
    await engine.start()
    engine.stop()
    engine.dispose()

    expect(audio.clearSchedule).toHaveBeenCalledWith(72)
    expect(audio.stopTransport).toHaveBeenCalledTimes(2)
    expect(audio.dispose).toHaveBeenCalledOnce()
    await expect(engine.start()).rejects.toThrow('disposed')
  })
})
