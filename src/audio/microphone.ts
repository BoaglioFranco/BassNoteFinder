import { detectPitch } from './pitch'
import { PitchStabilityTracker, type StablePitch } from './stability'

export type ListeningState = 'idle' | 'requesting' | 'listening' | 'denied' | 'unavailable' | 'error'

export interface AudioSnapshot {
  state: ListeningState
  reading: StablePitch | null
  signalLevel: number
  error?: string
}

export class BassMicrophoneAnalyzer {
  private context?: AudioContext
  private stream?: MediaStream
  private analyser?: AnalyserNode
  private frame?: number
  private buffer?: Float32Array<ArrayBuffer>
  private lastAnalysisAt = 0
  private lastReading: StablePitch | null = null
  private readonly stability = new PitchStabilityTracker()

  constructor(private readonly onSnapshot: (snapshot: AudioSnapshot) => void) {}

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.onSnapshot({ state: 'unavailable', reading: null, signalLevel: 0, error: 'Microphone capture is not supported in this browser.' })
      return
    }
    this.onSnapshot({ state: 'requesting', reading: null, signalLevel: 0 })
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      this.context = new AudioContext()
      await this.context.resume()
      const source = this.context.createMediaStreamSource(this.stream)
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 8192
      this.analyser.smoothingTimeConstant = 0
      source.connect(this.analyser)
      this.buffer = new Float32Array(this.analyser.fftSize)
      this.tick()
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      this.onSnapshot({
        state: denied ? 'denied' : 'error',
        reading: null,
        signalLevel: 0,
        error: denied ? 'Microphone access was blocked. Allow it in your browser settings, then try again.' : 'Could not start the microphone. Check that another app is not using it.',
      })
    }
  }

  stop() {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.context?.close()
    this.stability.reset()
    this.lastReading = null
    this.lastAnalysisAt = 0
    this.onSnapshot({ state: 'idle', reading: null, signalLevel: 0 })
  }

  private tick = () => {
    if (!this.analyser || !this.context || !this.buffer) return
    this.analyser.getFloatTimeDomainData(this.buffer)
    let energy = 0
    for (const sample of this.buffer) energy += sample * sample
    const signalLevel = Math.sqrt(energy / this.buffer.length)
    const now = performance.now()
    // Full-period correlation is intentionally substantial at low B. Run it
    // around 16 times/second while allowing the lightweight meter to animate.
    if (now - this.lastAnalysisAt >= 60) {
      const raw = detectPitch(this.buffer, this.context.sampleRate)
      this.lastReading = this.stability.update(raw, now)
      this.lastAnalysisAt = now
    }
    this.onSnapshot({ state: 'listening', reading: this.lastReading, signalLevel })
    this.frame = requestAnimationFrame(this.tick)
  }
}
