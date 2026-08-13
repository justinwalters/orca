import { describe, expect, it, vi } from 'vitest'
import { fetchResourceMonitorQuotas, resolveResourceMonitorToken } from './resource-monitor-auth'

const tokenStats = (mode = 0o600) => ({ isFile: () => true, mode })

describe('Resource Monitor runtime token resolver', () => {
  it('prefers an explicit non-empty environment override', async () => {
    const lstat = vi.fn()
    await expect(
      resolveResourceMonitorToken({
        platform: 'darwin',
        homeDirectory: '/home/test',
        env: { ORCA_RESOURCE_MONITOR_TOKEN: ' env-token ' },
        fileSystem: { lstat, readFile: vi.fn() }
      })
    ).resolves.toBe('env-token')
    expect(lstat).not.toHaveBeenCalled()
  })

  it('reads a private regular token file when no environment token exists', async () => {
    const fileSystem = {
      lstat: vi.fn().mockResolvedValue(tokenStats()),
      readFile: vi.fn().mockResolvedValue(' file-token\n')
    }
    await expect(
      resolveResourceMonitorToken({
        platform: 'darwin',
        homeDirectory: '/home/test',
        env: {},
        fileSystem
      })
    ).resolves.toBe('file-token')
    expect(fileSystem.lstat).toHaveBeenCalledWith(
      '/home/test/Library/Application Support/Resource Monitor/api-token'
    )
  })

  it.each([
    ['missing', vi.fn().mockRejectedValue(new Error('ENOENT'))],
    ['empty', vi.fn().mockResolvedValue(tokenStats())],
    ['non-regular', vi.fn().mockResolvedValue({ isFile: () => false, mode: 0o600 })],
    ['group-readable', vi.fn().mockResolvedValue(tokenStats(0o640))],
    ['world-readable', vi.fn().mockResolvedValue(tokenStats(0o604))]
  ])('fails closed for %s token files', async (kind, stat) => {
    const readFile = kind === 'empty' ? vi.fn().mockResolvedValue(' \n') : vi.fn()
    await expect(
      resolveResourceMonitorToken({
        platform: 'darwin',
        homeDirectory: '/home/test',
        env: {},
        fileSystem: { lstat: stat, readFile }
      })
    ).resolves.toBeNull()
    if (kind !== 'empty') {
      expect(readFile).not.toHaveBeenCalled()
    }
  })

  it('uses the resolved credential for request authorization', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ records: [] })
    })
    await expect(
      fetchResourceMonitorQuotas(
        'http://127.0.0.1:8765/v1/quotas',
        fetcher,
        async () => 'request-token'
      )
    ).resolves.toEqual({ records: [] })
    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:8765/v1/quotas', {
      headers: { Accept: 'application/json', Authorization: 'Bearer request-token' }
    })
  })
})
