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

type PercussionVoice = Extract<RhythmEvent['voice'], 'kick' | 'snare' | 'hihat'>
type PulseSynthBank = {
  click: Tone.PolySynth<Tone.Synth>
  woodblock: Tone.PolySynth<Tone.Synth>
}

type CueSynthBank = {
  synthBass: Tone.PolySynth<Tone.Synth>
}

type BassSampleVoice = Extract<RhythmEvent['voice'], 'bass' | 'pickedBass'>

const DRUM_SAMPLES: Record<PercussionVoice, readonly [string, string]> = {
  kick: ['/audio/drums/kick-1.m4a', '/audio/drums/kick-2.m4a'],
  snare: ['/audio/drums/snare-1.m4a', '/audio/drums/snare-2.m4a'],
  hihat: ['/audio/drums/hihat-1.m4a', '/audio/drums/hihat-2.m4a'],
}

// The source recordings have very different peak levels. These trims bring
// them into the same useful range while leaving headroom for layered hits.
const DRUM_TRIM_DB: Record<PercussionVoice, number> = { kick: 8, snare: 0, hihat: 18 }

/** Tone.js owns clocking, look-ahead scheduling, buffer reuse, and draw sync. */
export class ToneRhythmAudio implements RhythmAudioPort {
  private master?: Tone.Gain
  private pulseSynths?: PulseSynthBank
  private cueSynths?: CueSynthBank
  private drums?: Record<PercussionVoice, Tone.Sampler[]>
  private bassSamples?: Record<BassSampleVoice, Tone.Sampler>
  private prepared = false
  private volume = 0.7
  private roundRobin = { kick: 0, snare: 0, hihat: 0 }

  async prepare() {
    await Tone.start()
    if (!this.prepared) {
      this.master = new Tone.Gain(this.volume).toDestination()
      this.pulseSynths = this.createPulseSynthBank(this.master)
      this.cueSynths = this.createCueSynthBank(this.master)
      this.drums = {
        kick: this.createSamplerPool('kick', this.master),
        snare: this.createSamplerPool('snare', this.master),
        hihat: this.createSamplerPool('hihat', this.master),
      }
      this.bassSamples = {
        bass: this.createBassSampler('/audio/bass/finger-e1.wav', this.master),
        pickedBass: this.createBassSampler('/audio/bass/picked-e1.wav', this.master),
      }
      this.prepared = true
    }
    // A single sample that Safari cannot decode must not prevent the synth
    // voices (or any samples that did load) from starting. Sample-backed
    // voices fall back to the synth banks in trigger().
    await Tone.loaded().catch(() => undefined)
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
    for (const synth of Object.values(this.pulseSynths ?? {})) synth.releaseAll()
    for (const synth of Object.values(this.cueSynths ?? {})) synth.releaseAll()
    for (const pool of Object.values(this.drums ?? {})) {
      for (const sampler of pool) sampler.releaseAll()
    }
    for (const sampler of Object.values(this.bassSamples ?? {})) sampler.releaseAll()
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
      this.pulseSynths?.click.triggerAttackRelease(pitch, duration, audioTime, event.velocity)
    } else if (event.voice === 'woodblock') {
      const pitch = event.emphasis === 'downbeat' ? 'D6' : event.emphasis === 'beat' ? 'B5' : 'G5'
      this.pulseSynths?.woodblock.triggerAttackRelease(pitch, duration, audioTime, event.velocity)
    } else if (event.voice === 'bass' || event.voice === 'pickedBass') {
      const sampler = this.bassSamples?.[event.voice]
      if (sampler?.loaded) {
        sampler.triggerAttackRelease('E1', duration, audioTime, event.velocity)
      } else {
        this.cueSynths?.synthBass.triggerAttackRelease('E1', duration, audioTime, event.velocity)
      }
    } else if (event.voice === 'synthBass') {
      this.cueSynths?.synthBass.triggerAttackRelease('E1', duration, audioTime, event.velocity)
    } else if (event.voice === 'kick' || event.voice === 'snare' || event.voice === 'hihat') {
      const pool = this.drums?.[event.voice]
      const variant = this.roundRobin[event.voice]++ % 2
      const sampler = pool?.[variant]
      if (sampler?.loaded) {
        sampler.triggerAttack('C1', audioTime, event.velocity)
      } else {
        const fallbackPitch = event.voice === 'kick' ? 'E2' : event.voice === 'snare' ? 'C5' : 'G6'
        this.pulseSynths?.click.triggerAttackRelease(fallbackPitch, duration, audioTime, event.velocity)
      }
    }
  }

  private createPulseSynthBank(master: Tone.Gain): PulseSynthBank {
    return {
      click: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.025, sustain: 0, release: 0.01 },
        volume: -10,
      }).connect(master),
      woodblock: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.055, sustain: 0, release: 0.025 },
        volume: -7,
      }).connect(master),
    }
  }

  private createCueSynthBank(master: Tone.Gain): CueSynthBank {
    return {
      synthBass: new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.004, decay: 0.12, sustain: 0.5, release: 0.05 },
        volume: -16,
      }).connect(master),
    }
  }

  private createBassSampler(url: string, master: Tone.Gain) {
    return new Tone.Sampler({
      urls: { E1: url },
      release: 0.06,
      volume: -5,
    }).connect(master)
  }

  private createSamplerPool(voice: PercussionVoice, master: Tone.Gain) {
    return DRUM_SAMPLES[voice].map((url) => new Tone.Sampler({
      urls: { C1: url },
      release: 0.02,
      volume: DRUM_TRIM_DB[voice],
    }).connect(master))
  }

  dispose() {
    this.stopTransport()
    for (const synth of Object.values(this.pulseSynths ?? {})) synth.dispose()
    for (const synth of Object.values(this.cueSynths ?? {})) synth.dispose()
    for (const pool of Object.values(this.drums ?? {})) {
      for (const sampler of pool) sampler.dispose()
    }
    for (const sampler of Object.values(this.bassSamples ?? {})) sampler.dispose()
    this.master?.dispose()
    this.pulseSynths = undefined
    this.cueSynths = undefined
    this.drums = undefined
    this.bassSamples = undefined
    this.master = undefined
    this.prepared = false
  }
}
