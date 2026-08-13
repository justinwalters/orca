import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, chmodSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveResourceMonitorToken } from './resource-monitor-token'
import { createResourceMonitorRequest } from './resource-monitor-request'
import { RateLimitService } from './service'

/**
 * Independent P7-G certification regression suite. Exercises real filesystem
 * primitives (no mocked fs) and the abort-safety error path that the P7-D/E
 * suites did not cover directly.
 */

const tempRoots: string[] = []
function makeHome(): string {
  const root = mkdtempSync(join(tmpdir(), 'rm-cert-home-'))
  tempRoots.push(root)
  mkdirSync(join(root, 'Library', 'Application Support', 'Resource Monitor'), { recursive: true })
  return root
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

describe('resolveResourceMonitorToken — real filesystem falsification', () => {
  it('fails closed for a real symlink even when the symlink target is a valid private file', () => {
    const home = makeHome()
    const target = join(home, 'target-token')
    writeFileSync(target, 'real-secret-token\n')
    chmodSync(target, 0o600)
    const linkPath = join(home, 'Library', 'Application Support', 'Resource Monitor', 'api-token')
    symlinkSync(target, linkPath)

    expect(
      resolveResourceMonitorToken({ platform: 'darwin', homeDirectory: home, environment: {} })
    ).toBeNull()
  })

  it('fails closed for a real world-readable file', () => {
    const home = makeHome()
    const filePath = join(home, 'Library', 'Application Support', 'Resource Monitor', 'api-token')
    writeFileSync(filePath, 'leaky-token\n')
    chmodSync(filePath, 0o644)

    expect(
      resolveResourceMonitorToken({ platform: 'darwin', homeDirectory: home, environment: {} })
    ).toBeNull()
  })

  it('fails closed for a real group-readable file', () => {
    const home = makeHome()
    const filePath = join(home, 'Library', 'Application Support', 'Resource Monitor', 'api-token')
    writeFileSync(filePath, 'leaky-token\n')
    chmodSync(filePath, 0o640)

    expect(
      resolveResourceMonitorToken({ platform: 'darwin', homeDirectory: home, environment: {} })
    ).toBeNull()
  })

  it('fails closed for a real FIFO (non-regular file) at the token path', () => {
    const home = makeHome()
    const filePath = join(home, 'Library', 'Application Support', 'Resource Monitor', 'api-token')
    execFileSync('mkfifo', [filePath])
    chmodSync(filePath, 0o600)

    expect(
      resolveResourceMonitorToken({ platform: 'darwin', homeDirectory: home, environment: {} })
    ).toBeNull()
  })

  it('reads a real private regular file when it is the only credential source', () => {
    const home = makeHome()
    const filePath = join(home, 'Library', 'Application Support', 'Resource Monitor', 'api-token')
    writeFileSync(filePath, 'real-private-token\n')
    chmodSync(filePath, 0o600)

    expect(
      resolveResourceMonitorToken({ platform: 'darwin', homeDirectory: home, environment: {} })
    ).toBe('real-private-token')
  })

  it('fails closed when the configured environment variable is present but empty, without falling through to a lower-precedence source', () => {
    const home = makeHome()
    const filePath = join(home, 'Library', 'Application Support', 'Resource Monitor', 'api-token')
    writeFileSync(filePath, 'file-token\n')
    chmodSync(filePath, 0o600)

    expect(
      resolveResourceMonitorToken({
        platform: 'darwin',
        homeDirectory: home,
        environment: { ORCA_RESOURCE_MONITOR_TOKEN: '', RESOURCE_MONITOR_TOKEN: 'lower-precedence' }
      })
    ).toBeNull()
  })

  it('fails closed when every environment token variable is absent and the platform is non-darwin', () => {
    expect(
      resolveResourceMonitorToken({
        platform: 'linux',
        homeDirectory: '/nonexistent',
        environment: {}
      })
    ).toBeNull()
  })
})

describe('createResourceMonitorRequest — non-2xx rejection', () => {
  it('rejects a non-2xx response instead of resolving with the error body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'forbidden' })
      })
    const request = createResourceMonitorRequest(fetch, {
      environment: { RM_TOKEN: 'token' },
      platform: 'linux'
    })
    await expect(request('http://127.0.0.1:8765/v1/quotas')).rejects.toThrow('HTTP 403')
  })
})

describe('RateLimitService Resource Monitor observation lane — abort-safety on the error path', () => {
  function refreshResourceMonitor(service: RateLimitService) {
    const refresh = (
      service as unknown as { refreshResourceMonitor: (signal: AbortSignal) => Promise<void> }
    ).refreshResourceMonitor
    return (signal: AbortSignal) => refresh.call(service, signal)
  }

  it('does not publish an error state when the aborted cycle resolves with a rejection', async () => {
    let rejectRequest!: (reason: unknown) => void
    const request = vi.fn().mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject
      })
    )
    const service = new RateLimitService()
    service.setResourceMonitorRequest(() => 'http://127.0.0.1:8765', request)
    const controller = new AbortController()
    const refresh = refreshResourceMonitor(service)(controller.signal)
    controller.abort()
    rejectRequest(new Error('Resource Monitor request failed with HTTP 401'))
    await refresh
    expect(service.getState().resourceMonitor).toBeNull()
  })
})
