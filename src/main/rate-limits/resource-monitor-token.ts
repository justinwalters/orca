import { lstatSync, readFileSync, type Stats } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const RESOURCE_MONITOR_TOKEN_PATH = [
  'Library',
  'Application Support',
  'Resource Monitor',
  'api-token'
]
const ENVIRONMENT_TOKEN_NAMES = [
  'ORCA_RESOURCE_MONITOR_TOKEN',
  'RESOURCE_MONITOR_TOKEN',
  'RM_TOKEN'
] as const

export type ResourceMonitorTokenEnvironment = Record<string, string | undefined>

type TokenFileAccess = {
  lstatSync: (path: string) => Stats
  readFileSync: (path: string, encoding: 'utf8') => string
}

export type ResourceMonitorTokenOptions = {
  environment?: ResourceMonitorTokenEnvironment
  platform?: NodeJS.Platform
  homeDirectory?: string
  fileAccess?: TokenFileAccess
}

const defaultFileAccess: TokenFileAccess = { lstatSync, readFileSync }

/** Resolves credentials without exposing token contents to logs or persisted state. */
export function resolveResourceMonitorToken(
  options: ResourceMonitorTokenOptions = {}
): string | null {
  const environment = options.environment ?? process.env
  const configured = ENVIRONMENT_TOKEN_NAMES.find((name) => environment[name] !== undefined)
  if (configured) {
    const token = environment[configured]?.trim()
    return token || null
  }
  if ((options.platform ?? process.platform) !== 'darwin') {
    return null
  }
  const filePath = join(options.homeDirectory ?? homedir(), ...RESOURCE_MONITOR_TOKEN_PATH)
  const access = options.fileAccess ?? defaultFileAccess
  try {
    const stats = access.lstatSync(filePath)
    if (!stats.isFile() || (stats.mode & 0o077) !== 0) {
      return null
    }
    const token = access.readFileSync(filePath, 'utf8').trim()
    return token || null
  } catch {
    return null
  }
}
