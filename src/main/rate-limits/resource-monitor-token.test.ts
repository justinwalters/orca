import { describe, expect, it, vi } from 'vitest'
import { resolveResourceMonitorToken } from './resource-monitor-token'

const filePath = '/Users/test/Library/Application Support/Resource Monitor/api-token'

function fileAccess(mode: number, contents = 'file-token') {
  return {
    lstatSync: vi.fn(() => ({ mode, isFile: () => true }) as never),
    readFileSync: vi.fn(() => contents)
  }
}

describe('resolveResourceMonitorToken', () => {
  it('preserves environment precedence over the mini-local token file', () => {
    const access = fileAccess(0o100600)
    expect(
      resolveResourceMonitorToken({
        platform: 'darwin',
        homeDirectory: '/Users/test',
        environment: { ORCA_RESOURCE_MONITOR_TOKEN: 'env-token' },
        fileAccess: access
      })
    ).toBe('env-token')
    expect(access.lstatSync).not.toHaveBeenCalled()
  })

  it('reads a private mini-local token file on macOS', () => {
    const access = fileAccess(0o100600)
    expect(
      resolveResourceMonitorToken({
        platform: 'darwin',
        homeDirectory: '/Users/test',
        fileAccess: access
      })
    ).toBe('file-token')
    expect(access.lstatSync).toHaveBeenCalledWith(filePath)
  })

  it.each([
    [
      'missing',
      () => {
        throw new Error('ENOENT')
      }
    ],
    ['empty', () => ({ mode: 0o100600, isFile: () => true }), '   '],
    ['directory', () => ({ mode: 0o40700, isFile: () => false })],
    ['group-readable', () => ({ mode: 0o100640, isFile: () => true })],
    ['world-readable', () => ({ mode: 0o100604, isFile: () => true })]
  ])('fails closed for %s token files', (_name, stat, contents = 'token') => {
    const access = { lstatSync: vi.fn(stat), readFileSync: vi.fn(() => contents) } as never
    expect(
      resolveResourceMonitorToken({
        platform: 'darwin',
        homeDirectory: '/Users/test',
        fileAccess: access
      })
    ).toBeNull()
  })

  it('does not use the mini-local file on non-macOS hosts', () => {
    const access = fileAccess(0o100600)
    expect(
      resolveResourceMonitorToken({
        platform: 'linux',
        homeDirectory: '/Users/test',
        fileAccess: access
      })
    ).toBeNull()
    expect(access.lstatSync).not.toHaveBeenCalled()
  })
})
