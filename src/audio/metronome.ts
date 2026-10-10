export type Subdivision = 1 | 2 | 4
export type MetronomeSound = 'click' | 'woodblock' | 'drums' | 'hihat'

export interface MetronomeSettings {
  bpm: number
  beatsPerBar: number
  subdivision: Subdivision
  accentFirstBeat: boolean
  volume: number
  sound: MetronomeSound
}

export interface MetronomeTick {
  step: number
  beat: number
  subdivision: number
  audioTime: number
}

const LOOK_AHEAD_MS = 25
const SCHEDULE_AHEAD_SECONDS = 0.1

export function secondsPerStep(bpm: number, subdivision: Subdivision) {
  return 60 / bpm / subdivision
}

export function positionForStep(step: number, subdivision: Subdivision): Pick<MetronomeTick, 'beat' | 'subdivision'> {
  return {
    beat: Math.floor(step / subdivision),
    subdivision: step % subdivision,
  }
}

/**
 * Web Audio owns the clock so clicks remain steady even when React or the
 * browser's rendering thread is briefly busy. Tick callbacks are for visuals.
 */
export class MetronomeEngine {
  private context?: AudioContext
  private timer?: ReturnType<typeof setInterval>
  private visualTimers = new Set<ReturnType<typeof setTimeout>>()
  private scheduledSources = new Set<AudioScheduledSourceNode>()
  private nextStepTime = 0
  private step = 0
  private running = false

  constructor(
    private settings: MetronomeSettings,
    private readonly onTick: (tick: MetronomeTick) => void,
  ) {}

  get isRunning() { return this.running }

  update(settings: MetronomeSettings) {
    this.settings = settings
    this.step %= settings.beatsPerBar * settings.subdivision
  }

  async start() {
    if (this.running) return
    this.context ??= new AudioContext()
    await this.context.resume()
    this.running = true
    this.step = 0
    this.nextStepTime = this.context.currentTime + 0.05
    this.schedule()
    this.timer = setInterval(this.schedule, LOOK_AHEAD_MS)
  }

  stop() {
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
    for (const timer of this.visualTimers) clearTimeout(timer)
    this.visualTimers.clear()
    for (const source of this.scheduledSources) {
      try { source.stop() } catch { /* already stopped */ }
    }
    this.scheduledSources.clear()
  }

  async dispose() {
    this.stop()
    await this.context?.close()
    this.context = undefined
  }

  private schedule = () => {
    if (!this.running || !this.context) return

    while (this.nextStepTime < this.context.currentTime + SCHEDULE_AHEAD_SECONDS) {
      const position = positionForStep(this.step, this.settings.subdivision)
      const tick: MetronomeTick = { step: this.step, audioTime: this.nextStepTime, ...position }
      this.scheduleClick(tick)
      this.scheduleVisual(tick)

      this.nextStepTime += secondsPerStep(this.settings.bpm, this.settings.subdivision)
      this.step = (this.step + 1) % (this.settings.beatsPerBar * this.settings.subdivision)
    }
  }

  private scheduleClick(tick: MetronomeTick) {
    if (!this.context) return
    const isDownbeat = tick.beat === 0 && tick.subdivision === 0
    const isBeat = tick.subdivision === 0

    if (this.settings.sound === 'drums') {
      this.scheduleDrumKit(tick, isDownbeat, isBeat)
    } else if (this.settings.sound === 'hihat') {
      this.scheduleHiHat(tick.audioTime, isDownbeat, isBeat)
    } else {
      this.scheduleTone(tick.audioTime, isDownbeat, isBeat)
    }
  }

  private scheduleTone(time: number, isDownbeat: boolean, isBeat: boolean) {
    if (!this.context) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const woodblock = this.settings.sound === 'woodblock'
    const accented = isDownbeat && this.settings.accentFirstBeat

    oscillator.type = woodblock ? 'sine' : 'square'
    oscillator.frequency.value = woodblock
      ? accented ? 1120 : isBeat ? 820 : 610
      : accented ? 1320 : isBeat ? 940 : 620
    gain.gain.setValueAtTime(Math.max(0.0001, this.settings.volume * (isBeat ? 0.16 : 0.075)), time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (woodblock ? 0.055 : 0.035))
    oscillator.connect(gain).connect(this.context.destination)
    this.trackSource(oscillator)
    oscillator.start(time)
    oscillator.stop(time + (woodblock ? 0.06 : 0.04))
  }

  private scheduleKick(time: number, isDownbeat: boolean, isBeat: boolean) {
    if (!this.context) return
    const oscillator = this.context.createOscillator()
    const gain = this.context.createGain()
    const accented = isDownbeat && this.settings.accentFirstBeat

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(accented ? 170 : isBeat ? 145 : 115, time)
    oscillator.frequency.exponentialRampToValueAtTime(48, time + 0.11)
    gain.gain.setValueAtTime(Math.max(0.0001, this.settings.volume * (isBeat ? 0.7 : 0.34)), time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.13)
    oscillator.connect(gain).connect(this.context.destination)
    this.trackSource(oscillator)
    oscillator.start(time)
    oscillator.stop(time + 0.14)
  }

  private scheduleDrumKit(tick: MetronomeTick, isDownbeat: boolean, isBeat: boolean) {
    // A quiet closed hi-hat keeps the subdivision audible. The numbered beats
    // alternate kick and snare, producing the familiar 1/3 and 2/4 pattern in 4/4.
    this.scheduleHiHat(tick.audioTime, isDownbeat, isBeat, 0.42)
    if (!isBeat) return
    if (tick.beat % 2 === 0) this.scheduleKick(tick.audioTime, isDownbeat, true)
    else this.scheduleSnare(tick.audioTime)
  }

  private scheduleSnare(time: number) {
    if (!this.context) return
    const duration = 0.16
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) {
      const envelope = 1 - index / samples.length
      samples[index] = (Math.random() * 2 - 1) * envelope
    }

    const noise = this.context.createBufferSource()
    const noiseFilter = this.context.createBiquadFilter()
    const noiseGain = this.context.createGain()
    noise.buffer = buffer
    noiseFilter.type = 'highpass'
    noiseFilter.frequency.value = 1150 + Math.random() * 180
    noiseGain.gain.setValueAtTime(Math.max(0.0001, this.settings.volume * 0.38), time)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    noise.connect(noiseFilter).connect(noiseGain).connect(this.context.destination)
    this.trackSource(noise)

    const body = this.context.createOscillator()
    const bodyGain = this.context.createGain()
    body.type = 'triangle'
    body.frequency.setValueAtTime(185 + Math.random() * 12, time)
    bodyGain.gain.setValueAtTime(Math.max(0.0001, this.settings.volume * 0.22), time)
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.075)
    body.connect(bodyGain).connect(this.context.destination)
    this.trackSource(body)

    noise.start(time)
    noise.stop(time + duration)
    body.start(time)
    body.stop(time + 0.08)
  }

  private scheduleHiHat(time: number, isDownbeat: boolean, isBeat: boolean, level = 1) {
    if (!this.context) return
    const duration = 0.045
    const buffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * duration), this.context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1

    const source = this.context.createBufferSource()
    const filter = this.context.createBiquadFilter()
    const gain = this.context.createGain()
    const accented = isDownbeat && this.settings.accentFirstBeat
    source.buffer = buffer
    filter.type = 'highpass'
    filter.frequency.value = accented ? 6200 : 7600
    gain.gain.setValueAtTime(Math.max(0.0001, this.settings.volume * (isBeat ? 0.24 : 0.12) * level), time)
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration)
    source.connect(filter).connect(gain).connect(this.context.destination)
    this.trackSource(source)
    source.start(time)
    source.stop(time + duration)
  }

  private trackSource(source: AudioScheduledSourceNode) {
    this.scheduledSources.add(source)
    source.onended = () => this.scheduledSources.delete(source)
  }

  private scheduleVisual(tick: MetronomeTick) {
    if (!this.context) return
    const delay = Math.max(0, (tick.audioTime - this.context.currentTime) * 1000)
    const timer = setTimeout(() => {
      this.visualTimers.delete(timer)
      if (this.running) this.onTick(tick)
    }, delay)
    this.visualTimers.add(timer)
  }
}
