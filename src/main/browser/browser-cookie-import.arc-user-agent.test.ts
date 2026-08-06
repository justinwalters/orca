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
function mockArcPlistVersion(version: string): void {
  vi.doMock('node:child_process', async () => {
    const actual = await vi.importActual<typeof childProcessModule>('node:child_process')
    return {
      ...actual,
      execFileSync: (cmd: string, args: readonly string[]) => {
        if (cmd === 'defaults' && args[1]?.includes('/Applications/Arc.app/Contents/Info')) {
          return `${version}\n`
        }
        throw new Error('defaults: domain not found')
      }
    }
  })
}

function mockArcLastVersion(content: string | null): void {
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

  it('returns null when the marketing version has no Last Version fallback', async () => {
    mockArcPlistVersion('1.104.0')
    mockArcLastVersion(null)

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    expect(getUserAgentForBrowser('arc')).toBeNull()
  })

  it('returns null when Last Version is not a Chromium-shaped version', async () => {
    mockArcPlistVersion('1.104.0')
    mockArcLastVersion('1.104.0\n')

    const { getUserAgentForBrowser } = await import('./browser-cookie-import')
    expect(getUserAgentForBrowser('arc')).toBeNull()
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
