import * as Tone from 'tone'
import type { RhythmEvent } from '../rhythm/pattern'

export interface RhythmAudioPort {
  prepare(): Promise<void>
  setBpm(bpm: number): void
  setBeatsPerBar(beats: number): void
  setVolume(volume: number): void
  scheduleEveryTicks(callback: (audioTime: number) => void, ticks: number): number
  clearSchedule(id: number): void
  startTransport(): void
  stopTransport(): void
  scheduleDraw(callback: () => void, audioTime: number): void
  trigger(event: RhythmEvent, audioTime: number, durationTicks: number): void
  dispose(): void
}

const DRUM_URLS = {
  kick1: '/audio/drums/kick-1.m4a',
  kick2: '/audio/drums/kick-2.m4a',
  snare1: '/audio/drums/snare-1.m4a',
  snare2: '/audio/drums/snare-2.m4a',
  hihat1: '/audio/drums/hihat-1.m4a',
  hihat2: '/audio/drums/hihat-2.m4a',
} as const

/** Tone.js owns clocking, look-ahead scheduling, buffer reuse, and draw sync. */
export class ToneRhythmAudio implements RhythmAudioPort {
  private master?: Tone.Gain
  private click?: Tone.Synth
  private woodblock?: Tone.Synth
  private drums?: Tone.Players
  private prepared = false
  private volume = 0.7
  private roundRobin = { kick: 0, snare: 0, hihat: 0 }

  async prepare() {
    await Tone.start()
    if (!this.prepared) {
      this.master = new Tone.Gain(this.volume).toDestination()
      this.click = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 },
        volume: -10,
      }).connect(this.master)
      this.woodblock = new Tone.Synth({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.055, sustain: 0, release: 0.025 },
        volume: -7,
      }).connect(this.master)
      this.drums = new Tone.Players({ urls: DRUM_URLS, fadeOut: 0.015, volume: -5 }).connect(this.master)
      this.prepared = true
    }
    await Tone.loaded()
  }

  setBpm(bpm: number) {
    Tone.getTransport().bpm.value = bpm
  }

  setBeatsPerBar(beats: number) {
    Tone.getTransport().timeSignature = beats
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume))
    this.master?.gain.rampTo(this.volume, 0.02)
  }

  scheduleEveryTicks(callback: (audioTime: number) => void, ticks: number) {
    return Tone.getTransport().scheduleRepeat(callback, `${ticks}i`, 0)
  }

  clearSchedule(id: number) {
    Tone.getTransport().clear(id)
  }

  startTransport() {
    const transport = Tone.getTransport()
    transport.stop()
    transport.position = 0
    transport.start('+0.05')
  }

  stopTransport() {
    const transport = Tone.getTransport()
    transport.stop()
    transport.position = 0
    this.drums?.stopAll()
    Tone.getDraw().cancel()
  }

  scheduleDraw(callback: () => void, audioTime: number) {
    Tone.getDraw().schedule(callback, audioTime)
  }

  trigger(event: RhythmEvent, audioTime: number, durationTicks: number) {
    if (!this.prepared) return
    const duration = `${durationTicks}i`
    if (event.voice === 'click') {
      const pitch = event.emphasis === 'downbeat' ? 'E6' : event.emphasis === 'beat' ? 'C6' : 'G5'
      this.click?.triggerAttackRelease(pitch, duration, audioTime, event.velocity)
    } else if (event.voice === 'woodblock') {
      const pitch = event.emphasis === 'downbeat' ? 'D6' : event.emphasis === 'beat' ? 'B5' : 'G5'
      this.woodblock?.triggerAttackRelease(pitch, duration, audioTime, event.velocity)
    } else if (event.voice === 'kick' || event.voice === 'snare' || event.voice === 'hihat') {
      const variant = this.roundRobin[event.voice]++ % 2 + 1
      this.drums?.player(`${event.voice}${variant}`).start(audioTime)
    }
  }

  dispose() {
    this.stopTransport()
    this.click?.dispose()
    this.woodblock?.dispose()
    this.drums?.dispose()
    this.master?.dispose()
    this.click = undefined
    this.woodblock = undefined
    this.drums = undefined
    this.master = undefined
    this.prepared = false
  }
}
