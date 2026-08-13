import { describe, expect, it, vi } from 'vitest'
import { mapResourceMonitorQuotas, readResourceMonitorQuotas } from './resource-monitor-adapter'

describe('Resource Monitor quota adapter', () => {
  it('maps authoritative percentages and observed timestamps without using the local clock', () => {
    const result = mapResourceMonitorQuotas({
      records: [
        {
          provider: 'claude',
          status: 'ok',
          windows: [
            {
              window: '5h',
              window_minutes: 300,
              used_percent: 23.5,
              remaining_percent: 76.5,
              observed_at: '2026-08-13T23:00:00Z',
              reset_at: '2026-08-14T03:00:00Z'
            }
          ]
        }
      ]
    })
    expect(result.providers.claude).toMatchObject({
      status: 'ok',
      updatedAt: Date.parse('2026-08-13T23:00:00Z'),
      session: {
        usedPercent: 23.5,
        windowMinutes: 300,
        resetsAt: Date.parse('2026-08-14T03:00:00Z')
      }
    })
  })

  it('does not fabricate values for stale or unknown records', () => {
    const result = mapResourceMonitorQuotas({
      records: [
        { provider: 'kimi', status: 'stale', windows: [{ window: 'unknown', used_percent: 80 }] },
        { provider: 'new-provider', status: 'ok', windows: [] }
      ]
    })
    expect(result.providers.kimi).toMatchObject({
      status: 'unavailable',
      error: 'Resource Monitor status: stale',
      session: null,
      weekly: null,
      usageMetadata: { resourceMonitorStatus: 'stale' }
    })
    expect(result.ignoredProviders).toEqual(['new-provider'])
  })

  it('uses the injected read-only request boundary and the RM endpoint', async () => {
    const request = vi.fn().mockResolvedValue({ records: [] })
    await expect(readResourceMonitorQuotas('http://127.0.0.1:8765', request)).resolves.toEqual({
      providers: {},
      ignoredProviders: []
    })
    expect(request).toHaveBeenCalledWith('http://127.0.0.1:8765/v1/quotas')
  })
})
