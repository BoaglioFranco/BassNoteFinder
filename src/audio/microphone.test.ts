import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BassMicrophoneAnalyzer, type AudioSnapshot } from './microphone'

class FakeAnalyser {
  fftSize = 2048
  smoothingTimeConstant = 1

  getFloatTimeDomainData(buffer: Float32Array) {
    buffer.fill(0)
  }
}

class FakeAudioContext {
  static latest: FakeAudioContext | undefined

  sampleRate = 48_000
  analyser = new FakeAnalyser()
  resume = vi.fn().mockResolvedValue(undefined)
  close = vi.fn().mockResolvedValue(undefined)
  connect = vi.fn()
  createMediaStreamSource = vi.fn(() => ({ connect: this.connect }))
  createAnalyser = vi.fn(() => this.analyser)

  constructor() {
    FakeAudioContext.latest = this
  }
}

describe('BassMicrophoneAnalyzer', () => {
  const originalNavigator = globalThis.navigator
  const originalAudioContext = globalThis.AudioContext
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame

  beforeEach(() => {
    FakeAudioContext.latest = undefined
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 42))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('navigator', originalNavigator)
    vi.stubGlobal('AudioContext', originalAudioContext)
    vi.stubGlobal('requestAnimationFrame', originalRequestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', originalCancelAnimationFrame)
  })

  it('requests raw microphone input and configures a low-frequency analysis window', async () => {
    const stop = vi.fn()
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const snapshots: AudioSnapshot[] = []
    const analyzer = new BassMicrophoneAnalyzer((snapshot) => snapshots.push(snapshot))

    await analyzer.start()

    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    expect(FakeAudioContext.latest?.resume).toHaveBeenCalledOnce()
    expect(FakeAudioContext.latest?.analyser.fftSize).toBe(8192)
    expect(FakeAudioContext.latest?.analyser.smoothingTimeConstant).toBe(0)
    expect(FakeAudioContext.latest?.connect).toHaveBeenCalledWith(FakeAudioContext.latest?.analyser)
    expect(snapshots.map(({ state }) => state)).toEqual(['requesting', 'listening'])

    analyzer.stop()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
    expect(stop).toHaveBeenCalledOnce()
    expect(FakeAudioContext.latest?.close).toHaveBeenCalledOnce()
    expect(snapshots.at(-1)).toMatchObject({ state: 'idle', reading: null, signalLevel: 0 })
  })

  it('reports unsupported microphone capture', async () => {
    vi.stubGlobal('navigator', {})
    const onSnapshot = vi.fn()

    await new BassMicrophoneAnalyzer(onSnapshot).start()

    expect(onSnapshot).toHaveBeenCalledOnce()
    expect(onSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      state: 'unavailable',
      error: expect.stringContaining('not supported'),
    }))
  })

  it('reports denied microphone permission without starting audio processing', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
    const snapshots: AudioSnapshot[] = []

    await new BassMicrophoneAnalyzer((snapshot) => snapshots.push(snapshot)).start()

    expect(snapshots.map(({ state }) => state)).toEqual(['requesting', 'denied'])
    expect(snapshots.at(-1)?.error).toContain('blocked')
    expect(FakeAudioContext.latest).toBeUndefined()
  })
})
