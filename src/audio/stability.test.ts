import { describe, expect, it } from 'vitest'
import { PitchStabilityTracker } from './stability'

describe('PitchStabilityTracker', () => {
  it('requires several consistent readings before locking', () => {
    const tracker = new PitchStabilityTracker(500, 4, 15, 0.75)
    expect(tracker.update({ frequency: 55, clarity: 0.95, rms: 0.1 }, 0)?.stable).toBe(false)
    tracker.update({ frequency: 55.1, clarity: 0.94, rms: 0.1 }, 30)
    tracker.update({ frequency: 54.95, clarity: 0.96, rms: 0.1 }, 60)
    expect(tracker.update({ frequency: 55.02, clarity: 0.95, rms: 0.1 }, 90)?.stable).toBe(true)
  })

  it('does not lock onto unstable attack readings', () => {
    const tracker = new PitchStabilityTracker(500, 4, 15, 0.75)
    ;[45, 65, 51, 70].forEach((frequency, index) => tracker.update({ frequency, clarity: 0.9, rms: 0.1 }, index * 30))
    expect(tracker.update({ frequency: 55, clarity: 0.9, rms: 0.1 }, 130)?.stable).toBe(false)
  })
})
