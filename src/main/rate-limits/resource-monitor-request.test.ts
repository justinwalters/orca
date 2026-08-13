import { describe, expect, it, vi } from 'vitest'
import { createResourceMonitorRequest } from './resource-monitor-request'

describe('createResourceMonitorRequest', () => {
  it('sends bearer authorization and forwards the abort signal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ records: [] }) })
    const signal = new AbortController().signal
    const request = createResourceMonitorRequest(fetch, {
      environment: { RM_TOKEN: 'secret-token' },
      platform: 'linux'
    })
    await request('http://127.0.0.1:8765/v1/quotas', signal)
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:8765/v1/quotas', {
      headers: { Accept: 'application/json', Authorization: 'Bearer secret-token' },
      signal
    })
  })

  it('fails closed without credentials and does not make a request', async () => {
    const fetch = vi.fn()
    const request = createResourceMonitorRequest(fetch, { environment: {}, platform: 'linux' })
    await expect(request('http://127.0.0.1:8765/v1/quotas')).rejects.toThrow(
      'credentials unavailable'
    )
    expect(fetch).not.toHaveBeenCalled()
  })
})
