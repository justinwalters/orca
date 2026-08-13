import {
  resolveResourceMonitorToken,
  type ResourceMonitorTokenEnvironment
} from './resource-monitor-token'

export type ResourceMonitorFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export function createResourceMonitorRequest(
  fetchResourceMonitor: ResourceMonitorFetch,
  options: {
    environment?: ResourceMonitorTokenEnvironment
    platform?: NodeJS.Platform
    homeDirectory?: string
  } = {}
): (url: string, signal?: AbortSignal) => Promise<unknown> {
  return async (url, signal) => {
    const token = resolveResourceMonitorToken(options)
    if (!token) {
      throw new Error('Resource Monitor credentials unavailable')
    }
    const response = await fetchResourceMonitor(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal
    })
    if (!response.ok) {
      throw new Error(`Resource Monitor request failed with HTTP ${response.status}`)
    }
    return response.json()
  }
}
