import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits, ResourceMonitorObservation } from '../../../../shared/rate-limit-types'
import { deriveResourceMonitorProviderState } from './resource-monitor-meter-state'

function window(usedPercent: number, resetsAt: number | null = null): ProviderRateLimits['session'] {
  return { usedPercent, windowMinutes: 300, resetsAt, resetDescription: null }
}

function record(overrides: Partial<ProviderRateLimits> = {}): ProviderRateLimits {
  return {
    provider: 'claude',
    session: null,
    weekly: null,
    updatedAt: 1000,
    error: null,
    status: 'ok',
    ...overrides
  }
}

function observation(
  overrides: Partial<ResourceMonitorObservation> = {}
): ResourceMonitorObservation {
  return {
    status: 'ok',
    providers: {},
    ignoredProviders: [],
    records: [],
    error: null,
    ...overrides
  }
}

describe('deriveResourceMonitorProviderState', () => {
  it('returns rm-unavailable when resourceMonitor is null', () => {
    expect(deriveResourceMonitorProviderState(null, 'claude')).toEqual({ kind: 'rm-unavailable' })
  })

  it('returns rm-unavailable when resourceMonitor is undefined', () => {
    expect(deriveResourceMonitorProviderState(undefined, 'claude')).toEqual({
      kind: 'rm-unavailable'
    })
  })

  it('returns rm-unavailable when the aggregate fetch errored, even if providers happens to carry stale data', () => {
    // Why this matters: service.ts always resets `providers` to {} on a
    // failed fetch, but this test locks in the *policy* — the aggregate
    // transport failing must never be papered over by whatever the map
    // contains — independent of what main happens to leave there.
    const rm = observation({
      status: 'error',
      error: 'network down',
      providers: { claude: record({ session: window(50), status: 'ok' }) }
    })
    expect(deriveResourceMonitorProviderState(rm, 'claude')).toEqual({ kind: 'rm-unavailable' })
  })

  it('returns rm-unavailable when the aggregate status is unavailable', () => {
    const rm = observation({ status: 'unavailable', error: 'no credentials' })
    expect(deriveResourceMonitorProviderState(rm, 'codex')).toEqual({ kind: 'rm-unavailable' })
  })

  it('does NOT infer per-provider health from an ok aggregate status — requirement (a)', () => {
    // The aggregate is 'ok' (fetch succeeded) but this provider's own raw
    // status is 'stale'. The result must reflect the per-provider status,
    // not the aggregate.
    const rm = observation({
      status: 'ok',
      providers: {
        claude: record({
          session: window(70),
          usageMetadata: { resourceMonitorStatus: 'stale' }
        })
      }
    })
    const result = deriveResourceMonitorProviderState(rm, 'claude')
    expect(result.kind).toBe('stale')
  })

  it('returns provider-unavailable when RM succeeded but has no record for this provider', () => {
    const rm = observation({ status: 'ok', providers: { claude: record() } })
    expect(deriveResourceMonitorProviderState(rm, 'codex')).toEqual({
      kind: 'provider-unavailable',
      providerId: 'codex'
    })
  })

  it('returns current with per-window usage when raw status is ok and windows exist', () => {
    const rm = observation({
      status: 'ok',
      providers: {
        claude: record({
          session: window(42, 5000),
          weekly: window(10),
          usageMetadata: { resourceMonitorStatus: 'ok' }
        })
      }
    })
    const result = deriveResourceMonitorProviderState(rm, 'claude')
    expect(result).toEqual({
      kind: 'current',
      providerId: 'claude',
      updatedAt: 1000,
      windows: [
        { slot: 'session', usedPercent: 42, resetsAt: 5000, exhausted: false },
        { slot: 'weekly', usedPercent: 10, resetsAt: null, exhausted: false }
      ]
    })
  })

  it('flags a window as exhausted at exactly 100 and not below', () => {
    const rm = observation({
      status: 'ok',
      providers: {
        claude: record({
          session: window(99.9),
          weekly: window(100),
          usageMetadata: { resourceMonitorStatus: 'ok' }
        })
      }
    })
    const result = deriveResourceMonitorProviderState(rm, 'claude')
    expect(result.kind).toBe('current')
    if (result.kind !== 'current') {
      throw new Error('expected current')
    }
    expect(result.windows.find((w) => w.slot === 'session')?.exhausted).toBe(false)
    expect(result.windows.find((w) => w.slot === 'weekly')?.exhausted).toBe(true)
  })

  it('includes the monthly window when present', () => {
    const rm = observation({
      status: 'ok',
      providers: {
        'opencode-go': record({
          provider: 'opencode-go',
          monthly: window(30),
          usageMetadata: { resourceMonitorStatus: 'ok' }
        })
      }
    })
    const result = deriveResourceMonitorProviderState(rm, 'opencode-go')
    expect(result.kind).toBe('current')
    if (result.kind !== 'current') {
      throw new Error('expected current')
    }
    expect(result.windows).toEqual([
      { slot: 'monthly', usedPercent: 30, resetsAt: null, exhausted: false }
    ])
  })

  it('returns unknown when raw status is ok but no window survived adapter validation', () => {
    const rm = observation({
      status: 'ok',
      providers: { claude: record({ usageMetadata: { resourceMonitorStatus: 'ok' } }) }
    })
    expect(deriveResourceMonitorProviderState(rm, 'claude')).toEqual({
      kind: 'unknown',
      providerId: 'claude',
      rawStatus: 'ok'
    })
  })

  it('returns stale with windows still present, never silently upgraded to current', () => {
    const rm = observation({
      status: 'ok',
      providers: {
        claude: record({
          session: window(65, 9000),
          usageMetadata: { resourceMonitorStatus: 'stale' }
        })
      }
    })
    const result = deriveResourceMonitorProviderState(rm, 'claude')
    expect(result).toEqual({
      kind: 'stale',
      providerId: 'claude',
      updatedAt: 1000,
      windows: [{ slot: 'session', usedPercent: 65, resetsAt: 9000, exhausted: false }]
    })
  })

  it('returns unknown when raw status is stale but no window survived adapter validation', () => {
    const rm = observation({
      status: 'ok',
      providers: { claude: record({ usageMetadata: { resourceMonitorStatus: 'stale' } }) }
    })
    expect(deriveResourceMonitorProviderState(rm, 'claude')).toEqual({
      kind: 'unknown',
      providerId: 'claude',
      rawStatus: 'stale'
    })
  })

  it('returns unknown when raw status is RM-reported unknown', () => {
    const rm = observation({
      status: 'ok',
      providers: {
        claude: record({ session: window(20), usageMetadata: { resourceMonitorStatus: 'unknown' } })
      }
    })
    expect(deriveResourceMonitorProviderState(rm, 'claude')).toEqual({
      kind: 'unknown',
      providerId: 'claude',
      rawStatus: 'unknown'
    })
  })

  it('returns unknown for an unrecognized raw status rather than fabricating current or stale', () => {
    const rm = observation({
      status: 'ok',
      providers: {
        claude: record({
          session: window(20),
          usageMetadata: { resourceMonitorStatus: 'degraded-mystery-value' }
        })
      }
    })
    expect(deriveResourceMonitorProviderState(rm, 'claude')).toEqual({
      kind: 'unknown',
      providerId: 'claude',
      rawStatus: 'degraded-mystery-value'
    })
  })

  it('returns unknown when the record has no usageMetadata at all', () => {
    const rm = observation({
      status: 'ok',
      providers: { claude: record({ session: window(20), usageMetadata: undefined }) }
    })
    expect(deriveResourceMonitorProviderState(rm, 'claude')).toEqual({
      kind: 'unknown',
      providerId: 'claude',
      rawStatus: null
    })
  })
})
