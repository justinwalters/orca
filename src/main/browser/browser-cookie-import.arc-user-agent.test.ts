import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as childProcessModule from 'node:child_process'
import type * as fsModule from 'node:fs'

const { sessionFromPartitionMock, dialogShowOpenDialogMock } = vi.hoisted(() => ({
  sessionFromPartitionMock: vi.fn(),
  dialogShowOpenDialogMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: dialogShowOpenDialogMock },
  session: { fromPartition: sessionFromPartitionMock }
}))

function slashPath(pathValue: string): string {
  return pathValue.replaceAll('\\', '/')
}

// Why: Arc's CFBundleShortVersionString is its marketing version ("1.104.0"),
// not the embedded Chromium version — a UA built from it reads as Chrome 1 and
// sites mark the browser incompatible (STA-3514).
function mockArcPlistVersion(version: string, arcCoreVersion: string | null = null): void {
  vi.doMock('node:child_process', async () => {
    const actual = await vi.importActual<typeof childProcessModule>('node:child_process')
    return {
      ...actual,
      execFileSync: (cmd: string, args: readonly string[]) => {
        if (cmd !== 'defaults') {
          throw new Error(`unexpected command: ${cmd}`)
        }
        if (args[1]?.includes('ArcCore.framework')) {
          if (arcCoreVersion === null) {
            throw new Error('defaults: domain not found')
          }
          return `${arcCoreVersion}\n`
        }
        if (args[1]?.includes('/Applications/Arc.app/Contents/Info')) {
          return `${version}\n`
        }
        throw new Error('defaults: domain not found')
      }
    }
  })
}

function mockArcLastVersion(
  content: string | null,
  framework: { name: string; current: string } | null = null
): void {
  vi.doMock('node:fs', async () => {
    const actual = await vi.importActual<typeof fsModule>('node:fs')
    return {
      ...actual,
      readFileSync: (p: unknown, enc?: unknown) => {
        if (typeof p === 'string' && slashPath(p).endsWith('Arc/User Data/Last Version')) {
          if (content === null) {
            throw new Error('ENOENT')
          }
          return content
        }
        return actual.readFileSync(p as never, enc as never)
      },
      readdirSync: (p: unknown, opts?: unknown) => {
        if (typeof p === 'string' && slashPath(p).endsWith('.app/Contents/Frameworks')) {
          if (!framework) {
            throw new Error('ENOENT')
          }
          return [framework.name] as never
        }
        return actual.readdirSync(p as never, opts as never)
      },
      realpathSync: (p: unknown, opts?: unknown) => {
        if (typeof p === 'string' && slashPath(p).endsWith('/Versions/Current')) {
          if (!framework) {
            throw new Error('ENOENT')
          }
          return `${slashPath(p).replace(/\/Current$/, '')}/${framework.current}`
        }
        return actual.realpathSync(p as never, opts as never)
      }
    }
  })
}

describe('getUserAgentForBrowser — Arc (STA-3514)', () => {
  const originalPlatform = process.platform
  const originalHome = process.env.HOME

  beforeEach(() => {
    vi.resetModules()
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    process.env.HOME = '/Users/test'
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    process.env.HOME = originalHome
    vi.restoreAllMocks()
  })

  it('prefers the embedded ArcCore Chromium version over the marketing version', async () => {
    mockArcPlistVersion('1.158.1', '151.0.7922.72')
    mockArcLastVersion(null)

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')

    expect(ua).not.toBeNull()
    expect(ua).not.toContain('Chrome/1.158.1')
    expect(ua).toContain('Chrome/151.0.7922.72')
  })

  it('never builds a Chrome/1.x UA from Arc marketing version; uses User Data Last Version', async () => {
    mockArcPlistVersion('1.104.0')
    mockArcLastVersion('126.0.6478.127\n')

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')

    expect(ua).not.toBeNull()
    expect(ua).not.toContain('Chrome/1.104.0')
    expect(ua).toContain('Chrome/126.0.6478.127')
    expect(ua).toContain('Macintosh; Intel Mac OS X 10_15_7')
    expect(ua).toContain('Safari/537.36')
  })

  // Why: returning null here would set no UA at all, reporting import success
  // while the cookies it just wrote fail to authenticate.
  it('falls back to a plausible Chromium version rather than no UA', async () => {
    mockArcPlistVersion('1.104.0')
    mockArcLastVersion(null)

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')

    expect(ua).not.toBeNull()
    expect(ua).not.toContain('Chrome/1.104.0')
    const major = Number(ua?.match(/Chrome\/(\d+)/)?.[1])
    expect(major).toBeGreaterThanOrEqual(80)
  })

  it('rejects a Last Version that is not a Chromium-shaped version', async () => {
    mockArcPlistVersion('1.104.0')
    mockArcLastVersion('1.104.0\n')

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')

    expect(ua).not.toContain('Chrome/1.104.0')
    const major = Number(ua?.match(/Chrome\/(\d+)/)?.[1])
    expect(major).toBeGreaterThanOrEqual(80)
  })

  // Why: a 3-part marketing number with a high major ("142.5.1") passes a
  // major-only floor but is not a Chromium version.
  it('rejects a high-major marketing version that is not 4-part', async () => {
    mockArcPlistVersion('142.5.1')
    mockArcLastVersion('126.0.6478.127\n')

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')

    expect(ua).not.toContain('Chrome/142.5.1')
    expect(ua).toContain('Chrome/126.0.6478.127')
  })

  // Why: forks shipping a stock chrome_framework carry the real Chromium version
  // as the Versions/ directory name, so they need no per-fork plist path.
  it('reads the framework Versions/Current name when the bundle version is a marketing number', async () => {
    mockArcPlistVersion('1.104.0')
    mockArcLastVersion(null, { name: 'Chromium Framework.framework', current: '151.0.7922.77' })

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')

    expect(ua).toContain('Chrome/151.0.7922.77')
  })

  // Why: Electron-style frameworks use Versions/A, which must not be mistaken
  // for a version.
  it('skips a framework whose Versions/Current is not a Chromium version', async () => {
    mockArcPlistVersion('1.104.0', '151.0.7922.72')
    mockArcLastVersion(null, { name: 'ArcCore.framework', current: 'A' })

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')

    expect(ua).not.toContain('Chrome/A')
    expect(ua).toContain('Chrome/151.0.7922.72')
  })

  it('keeps using the plist version when it is already Chromium-shaped', async () => {
    mockArcPlistVersion('138.0.7204.101')
    // Why: a plausible plist version must win without touching User Data.
    mockArcLastVersion(null)

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    const ua = getUserAgentForBrowser('arc')
    expect(ua).toContain('Chrome/138.0.7204.101')
  })
})
