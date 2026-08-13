import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const RESOURCE_MONITOR_TOKEN_ENV_NAMES = [
  'ORCA_RESOURCE_MONITOR_TOKEN',
  'RESOURCE_MONITOR_TOKEN',
  'RM_TOKEN'
] as const

type ResourceMonitorTokenFileStats = {
  isFile: () => boolean
  mode: number
}

export type ResourceMonitorTokenResolverInputs = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  homeDirectory?: string
  pathJoin?: (...paths: string[]) => string
  fileSystem?: {
    lstat: (path: string) => Promise<ResourceMonitorTokenFileStats>
    readFile: (path: string, encoding: 'utf8') => Promise<string>
  }
}

type ResourceMonitorFetchResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

export type ResourceMonitorFetch = (
  url: string,
  init: { headers: { Accept: string; Authorization: string } }
) => Promise<ResourceMonitorFetchResponse>

export function getResourceMonitorTokenPath({
  platform = process.platform,
  homeDirectory = homedir(),
  env = process.env,
  pathJoin = join
}: Pick<
  ResourceMonitorTokenResolverInputs,
  'platform' | 'homeDirectory' | 'env' | 'pathJoin'
> = {}): string | null {
  if (platform === 'darwin') {
    return pathJoin(
      homeDirectory,
      'Library',
      'Application Support',
      'Resource Monitor',
      'api-token'
    )
  }
  if (platform === 'win32') {
    const appData = env.APPDATA ?? pathJoin(homeDirectory, 'AppData', 'Roaming')
    return pathJoin(appData, 'Resource Monitor', 'api-token')
  }
  const configHome = env.XDG_CONFIG_HOME ?? pathJoin(homeDirectory, '.config')
  return pathJoin(configHome, 'Resource Monitor', 'api-token')
}

/** Resolves only credentials already present in the runtime environment or host-local file. */
export async function resolveResourceMonitorToken({
  env = process.env,
  platform = process.platform,
  homeDirectory = homedir(),
  pathJoin = join,
  fileSystem = fs
}: ResourceMonitorTokenResolverInputs = {}): Promise<string | null> {
  for (const name of RESOURCE_MONITOR_TOKEN_ENV_NAMES) {
    const token = env[name]?.trim()
    if (token) {
      return token
    }
  }

  const tokenPath = getResourceMonitorTokenPath({ platform, homeDirectory, env, pathJoin })
  if (!tokenPath) {
    return null
  }
  try {
    const stats = await fileSystem.lstat(tokenPath)
    if (!stats.isFile() || (platform !== 'win32' && (stats.mode & 0o077) !== 0)) {
      return null
    }
    const token = (await fileSystem.readFile(tokenPath, 'utf8')).trim()
    return token || null
  } catch {
    return null
  }
}

export async function fetchResourceMonitorQuotas(
  url: string,
  fetcher: ResourceMonitorFetch,
  resolveToken: () => Promise<string | null> = () => resolveResourceMonitorToken()
): Promise<unknown> {
  const token = await resolveToken()
  if (!token) {
    throw new Error('Resource Monitor credentials unavailable')
  }
  const response = await fetcher(url, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }
  })
  if (!response.ok) {
    throw new Error(`Resource Monitor request failed with HTTP ${response.status}`)
  }
  return response.json()
}
