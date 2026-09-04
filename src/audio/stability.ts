import type { PitchReading } from './pitch'

export interface StablePitch extends PitchReading {
  stable: boolean
  sampleCount: number
  spreadCents: number
}

export class PitchStabilityTracker {
  private history: Array<PitchReading & { time: number }> = []

  constructor(
    private readonly windowMs = 450,
    private readonly minReadings = 6,
    private readonly maxSpreadCents = 18,
    private readonly minClarity = 0.78,
  ) {}

  update(reading: PitchReading | null, time = performance.now()): StablePitch | null {
    if (!reading) {
      this.history = this.history.filter((entry) => time - entry.time < 120)
      return null
    }

    this.history.push({ ...reading, time })
    this.history = this.history.filter((entry) => time - entry.time <= this.windowMs)
    const frequencies = this.history.map((entry) => entry.frequency).sort((a, b) => a - b)
    const median = frequencies[Math.floor(frequencies.length / 2)]
    const deviations = frequencies.map((frequency) => Math.abs(1200 * Math.log2(frequency / median)))
    const spreadCents = Math.max(...deviations, 0)
    const clarity = this.history.reduce((sum, entry) => sum + entry.clarity, 0) / this.history.length
    const rms = this.history.reduce((sum, entry) => sum + entry.rms, 0) / this.history.length

    return {
      frequency: median,
      clarity,
      rms,
      sampleCount: this.history.length,
      spreadCents,
      stable:
        this.history.length >= this.minReadings &&
        spreadCents <= this.maxSpreadCents &&
        clarity >= this.minClarity,
    }
  }

  reset() {
    this.history = []
  }
}
