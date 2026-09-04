export interface PitchReading {
  frequency: number
  clarity: number
  rms: number
}

export interface PitchDetectorOptions {
  minFrequency?: number
  maxFrequency?: number
  clarityThreshold?: number
  rmsThreshold?: number
}

/**
 * Normalized square-difference detector tuned for bass fundamentals.
 * It deliberately favors the earliest strong correlation peak to reduce
 * harmonic/octave errors on bright bass signals.
 */
export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  options: PitchDetectorOptions = {},
): PitchReading | null {
  const minFrequency = options.minFrequency ?? 27
  const maxFrequency = options.maxFrequency ?? 400
  const clarityThreshold = options.clarityThreshold ?? 0.72
  const rmsThreshold = options.rmsThreshold ?? 0.008

  let mean = 0
  for (const sample of samples) mean += sample
  mean /= samples.length

  const centered = new Float32Array(samples.length)
  let energy = 0
  for (let i = 0; i < samples.length; i += 1) {
    centered[i] = samples[i] - mean
    energy += centered[i] * centered[i]
  }
  const rms = Math.sqrt(energy / samples.length)
  if (rms < rmsThreshold) return null

  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency))
  const maxLag = Math.min(Math.ceil(sampleRate / minFrequency), samples.length - 3)
  if (maxLag <= minLag) return null

  const correlations = new Float32Array(maxLag + 1)
  let bestLag = minLag
  let bestCorrelation = -1

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let product = 0
    let leftEnergy = 0
    let rightEnergy = 0
    const count = samples.length - lag
    for (let i = 0; i < count; i += 1) {
      const left = centered[i]
      const right = centered[i + lag]
      product += left * right
      leftEnergy += left * left
      rightEnergy += right * right
    }
    const correlation = product / Math.sqrt(leftEnergy * rightEnergy || 1)
    correlations[lag] = correlation
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestLag = lag
    }
  }

  // Choose the first convincing local peak. This resists locking to a
  // multiple of the period while still allowing a weak fundamental.
  const strongPeak = Math.max(clarityThreshold, bestCorrelation * 0.92)
  for (let lag = minLag + 1; lag < bestLag; lag += 1) {
    if (
      correlations[lag] >= strongPeak &&
      correlations[lag] >= correlations[lag - 1] &&
      correlations[lag] > correlations[lag + 1]
    ) {
      bestLag = lag
      bestCorrelation = correlations[lag]
      break
    }
  }

  if (bestCorrelation < clarityThreshold) return null

  // Parabolic interpolation gives sub-sample period resolution.
  const left = correlations[bestLag - 1]
  const center = correlations[bestLag]
  const right = correlations[bestLag + 1]
  const denominator = left - 2 * center + right
  const adjustment = denominator === 0 ? 0 : 0.5 * (left - right) / denominator
  const period = bestLag + Math.max(-0.5, Math.min(0.5, adjustment))

  return { frequency: sampleRate / period, clarity: bestCorrelation, rms }
}

export interface NoteInfo {
  midi: number
  note: string
  octave: number
  cents: number
  referenceFrequency: number
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

export function frequencyToNote(frequency: number): NoteInfo {
  const exactMidi = 69 + 12 * Math.log2(frequency / 440)
  const midi = Math.round(exactMidi)
  const referenceFrequency = 440 * 2 ** ((midi - 69) / 12)
  return {
    midi,
    note: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents: 1200 * Math.log2(frequency / referenceFrequency),
    referenceFrequency,
  }
}
