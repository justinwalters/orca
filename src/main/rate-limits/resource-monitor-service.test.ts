import { describe, expect, it, vi } from 'vitest'
import { RateLimitService } from './service'

type ResourceMonitorRefresh = (signal: AbortSignal) => Promise<void>

function refreshResourceMonitor(service: RateLimitService): ResourceMonitorRefresh {
  const refresh = (service as unknown as { refreshResourceMonitor: ResourceMonitorRefresh })
    .refreshResourceMonitor
  return (signal) => refresh.call(service, signal)
}

describe('RateLimitService Resource Monitor observation lane', () => {
  it('keeps raw records and RM status separate from native provider state', async () => {
    const request = vi.fn().mockResolvedValue({
      records: [
        {
          provider: 'claude',
          status: 'stale',
          windows: [
            {
              window: '5h',
              window_minutes: 300,
              used_percent: 25,
              remaining_percent: 75,
              observed_at: '2026-08-13T00:00:00Z',
              reset_at: '2026-08-13T04:00:00Z'
            }
          ]
        },
        { provider: 'future-provider', status: 'ok', windows: [] }
      ]
    })
    const service = new RateLimitService()
    service.setResourceMonitorRequest(() => 'http://127.0.0.1:8765', request)

    await refreshResourceMonitor(service)(new AbortController().signal)

    expect(service.getState().claude).toBeNull()
    expect(service.getState().resourceMonitor).toMatchObject({
      status: 'ok',
      ignoredProviders: ['future-provider'],
      records: [
        {
          provider: 'claude',
          status: 'stale',
          windows: [{ used_percent: 25, remaining_percent: 75 }]
        },
        { provider: 'future-provider', status: 'ok', windows: [] }
      ]
    })
    expect(service.getState().resourceMonitor?.providers.claude).toMatchObject({
      status: 'unavailable',
      updatedAt: Date.parse('2026-08-13T00:00:00Z'),
      session: { usedPercent: 25, resetsAt: Date.parse('2026-08-13T04:00:00Z') }
    })
  })

  it('fails closed when the runtime credential/request bridge is absent', async () => {
    const service = new RateLimitService()
    service.setResourceMonitorRequest(() => null, vi.fn())

    await refreshResourceMonitor(service)(new AbortController().signal)

    expect(service.getState().resourceMonitor).toMatchObject({
      status: 'unavailable',
      providers: {},
      records: []
    })
    expect(service.getState().resourceMonitor?.error).toMatch(/credentials|bridge/)
  })

  it('fails closed on an authenticated HTTP error without fabricating providers', async () => {
    const service = new RateLimitService()
    service.setResourceMonitorRequest(
      () => 'http://127.0.0.1:8765',
      vi.fn().mockRejectedValue(new Error('Resource Monitor request failed with HTTP 401'))
    )

    await refreshResourceMonitor(service)(new AbortController().signal)

    expect(service.getState().resourceMonitor).toMatchObject({
      status: 'error',
      providers: {},
      ignoredProviders: [],
      records: [],
      error: 'Resource Monitor request failed with HTTP 401'
    })
  })

  it('does not commit a snapshot after the fetch cycle is aborted', async () => {
    let releaseRequest!: (value: unknown) => void
    const request = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        releaseRequest = resolve
      })
    )
    const service = new RateLimitService()
    service.setResourceMonitorRequest(() => 'http://127.0.0.1:8765', request)
    const controller = new AbortController()
    const refresh = refreshResourceMonitor(service)(controller.signal)
    controller.abort()
    releaseRequest({ records: [{ provider: 'claude', status: 'ok', windows: [] }] })
    await refresh
    expect(service.getState().resourceMonitor).toBeNull()
  })
})
