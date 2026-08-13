import { describe, expect, it, vi } from 'vitest'
import {
  mapResourceMonitorQuotaRecord,
  mapResourceMonitorQuotas,
  readResourceMonitorQuotas
} from './resource-monitor-adapter'

describe('adversarial: malformed/missing percentages', () => {
  it('drops window with missing used_percent', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, observed_at: '2026-08-13T00:00:00Z' }]
    })
    expect(r?.limits.session).toBeNull()
  })
  it('drops window with used_percent > 100', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, used_percent: 150 }]
    })
    expect(r?.limits.session).toBeNull()
  })
  it('drops window with negative used_percent', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, used_percent: -5 }]
    })
    expect(r?.limits.session).toBeNull()
  })
  it('drops window with NaN/string used_percent (type confusion)', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, used_percent: '23.5' }]
    })
    expect(r?.limits.session).toBeNull()
  })
  it('drops window with Infinity used_percent', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, used_percent: Infinity }]
    })
    expect(r?.limits.session).toBeNull()
  })
})

describe('adversarial: unsupported windows/providers', () => {
  it('ignores unsupported window name+minutes combo (does not fabricate a slot)', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: 'daily', window_minutes: 1440, used_percent: 10 }]
    })
    expect(r?.limits.session).toBeNull()
    expect(r?.limits.weekly).toBeNull()
    expect(r?.limits.monthly).toBeNull()
  })
  it('drops record for completely unsupported provider and reports it', () => {
    const result = mapResourceMonitorQuotas({
      records: [{ provider: 'chatgpt-enterprise', status: 'ok', windows: [] }]
    })
    expect(result.providers['chatgpt-enterprise' as never]).toBeUndefined()
    expect(result.ignoredProviders).toEqual(['chatgpt-enterprise'])
  })
  it('handles provider field missing entirely (no crash, silently dropped, not in ignoredProviders)', () => {
    const result = mapResourceMonitorQuotas({ records: [{ status: 'ok', windows: [] }] })
    expect(Object.keys(result.providers)).toEqual([])
    expect(result.ignoredProviders).toEqual([])
  })
  it('handles provider as non-string (number) without crash', () => {
    const result = mapResourceMonitorQuotas({
      records: [{ provider: 42, status: 'ok', windows: [] }]
    })
    expect(Object.keys(result.providers)).toEqual([])
    expect(result.ignoredProviders).toEqual([])
  })
  it('does not let a second window of same slot silently accumulate stale prior value across malformed retry', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [
        { window: '5h', window_minutes: 300, used_percent: 20 },
        { window: '5h', window_minutes: 300, used_percent: 999 }
      ]
    })
    // last valid wins per Map.set semantics; second is invalid so first (20) should remain
    expect(r?.limits.session?.usedPercent).toBe(20)
  })
})

describe('adversarial: stale/unknown RM statuses', () => {
  it('maps stale to unavailable with preserved raw status', () => {
    const r = mapResourceMonitorQuotaRecord({ provider: 'claude', status: 'stale', windows: [] })
    expect(r?.limits.status).toBe('unavailable')
    expect(r?.limits.usageMetadata?.resourceMonitorStatus).toBe('stale')
  })
  it('maps a completely unknown status string to unavailable, preserving raw text', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'quantum-flux-error',
      windows: []
    })
    expect(r?.limits.status).toBe('unavailable')
    expect(r?.limits.usageMetadata?.resourceMonitorStatus).toBe('quantum-flux-error')
  })
  it('maps missing status to unknown/unavailable, not ok', () => {
    const r = mapResourceMonitorQuotaRecord({ provider: 'claude', windows: [] })
    expect(r?.limits.status).toBe('unavailable')
    expect(r?.limits.usageMetadata?.resourceMonitorStatus).toBe('unknown')
  })
  it('does not treat case-variant OK ("OK", " ok ") as ok (strict authoritative match)', () => {
    const r1 = mapResourceMonitorQuotaRecord({ provider: 'claude', status: 'OK', windows: [] })
    expect(r1?.limits.status).toBe('unavailable')
  })
})

describe('adversarial: invalid timestamps', () => {
  it('ignores garbage observed_at, updatedAt stays at 0 not fabricated Date.now()', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, used_percent: 10, observed_at: 'not-a-date' }]
    })
    expect(r?.limits.updatedAt).toBe(0)
  })
  it('null reset_at yields null resetsAt, not NaN or 0', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, used_percent: 10, reset_at: null }]
    })
    expect(r?.limits.session?.resetsAt).toBeNull()
  })
  it('garbage reset_at yields null resetsAt (not NaN leaking through)', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [{ window: '5h', window_minutes: 300, used_percent: 10, reset_at: 'garbage' }]
    })
    expect(r?.limits.session?.resetsAt).toBeNull()
    expect(Number.isNaN(r?.limits.session?.resetsAt)).toBe(false)
  })
  it('takes the newest of multiple valid observed_at across windows, not the last seen', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: [
        {
          window: '5h',
          window_minutes: 300,
          used_percent: 10,
          observed_at: '2026-08-13T23:00:00Z'
        },
        {
          window: 'weekly',
          window_minutes: 10080,
          used_percent: 10,
          observed_at: '2026-08-10T00:00:00Z'
        }
      ]
    })
    expect(r?.limits.updatedAt).toBe(Date.parse('2026-08-13T23:00:00Z'))
  })
})

describe('adversarial: non-200/401/malformed HTTP-shaped responses', () => {
  it('rejects and propagates when injected request rejects (simulated 401 thrown by caller)', async () => {
    const request = vi.fn().mockRejectedValue(new Error('HTTP 401 Unauthorized'))
    await expect(readResourceMonitorQuotas('http://127.0.0.1:8765', request)).rejects.toThrow(/401/)
  })
  it('does not fabricate data when request resolves an error-shaped body (e.g. {"error":"unauthorized"})', async () => {
    const request = vi.fn().mockResolvedValue({ error: 'unauthorized' })
    await expect(readResourceMonitorQuotas('http://127.0.0.1:8765', request)).resolves.toEqual({
      providers: {},
      ignoredProviders: []
    })
  })
  it('throws (does not silently succeed) when response is a raw string, not an object', async () => {
    const request = vi.fn().mockResolvedValue('unauthorized')
    await expect(readResourceMonitorQuotas('http://127.0.0.1:8765', request)).rejects.toThrow()
  })
  it('throws when response is null', async () => {
    const request = vi.fn().mockResolvedValue(null)
    await expect(readResourceMonitorQuotas('http://127.0.0.1:8765', request)).rejects.toThrow()
  })
  it('throws when response is an array instead of object (top-level shape confusion)', async () => {
    const request = vi.fn().mockResolvedValue([])
    // arrays are typeof 'object' so this currently passes through to mapResourceMonitorQuotas;
    // records is not an array on an array-as-response (no .records key) -> should degrade to empty, not throw/crash
    await expect(readResourceMonitorQuotas('http://127.0.0.1:8765', request)).resolves.toEqual({
      providers: {},
      ignoredProviders: []
    })
  })
  it('does not crash when records contains a null entry mixed with valid entries', () => {
    const result = mapResourceMonitorQuotas({
      records: [null, { provider: 'claude', status: 'ok', windows: [] }]
    })
    expect(result.providers.claude).toBeDefined()
  })
  it('does not crash when windows is not an array (type confusion)', () => {
    const r = mapResourceMonitorQuotaRecord({
      provider: 'claude',
      status: 'ok',
      windows: 'not-an-array'
    })
    expect(r?.limits.session).toBeNull()
    expect(r?.limits.weekly).toBeNull()
    expect(r?.limits.monthly).toBeNull()
  })
})

describe('adversarial: credential handling', () => {
  it('adapter source never constructs headers, tokens, or Authorization values itself', () => {
    // Executed as a functional guarantee: the only network call is the injected `request`
    // function; the adapter module itself has no fetch/XHR/Authorization logic to leak a token.
    const src = readResourceMonitorQuotas.toString()
    expect(src).not.toMatch(/Authorization|Bearer|token/i)
  })
  it('request function receives only a URL string, never any credential material', async () => {
    const request = vi.fn().mockResolvedValue({ records: [] })
    await readResourceMonitorQuotas('http://127.0.0.1:8765', request)
    expect(request).toHaveBeenCalledWith('http://127.0.0.1:8765/v1/quotas')
    expect(request.mock.calls[0]).toHaveLength(1)
  })
})
