import type {
  ProviderRateLimits,
  ProviderRateLimitStatus,
  RateLimitWindow
} from '../../shared/rate-limit-types'

export type ResourceMonitorQuotaWindow = {
  provider?: unknown
  window?: unknown
  window_id?: unknown
  window_minutes?: unknown
  used_percent?: unknown
  remaining_percent?: unknown
  reset_at?: unknown
  observed_at?: unknown
  status?: unknown
}

export type ResourceMonitorQuotaRecord = {
  provider?: unknown
  status?: unknown
  windows?: unknown
}

export type ResourceMonitorQuotaResponse = {
  records?: unknown
}

export type ResourceMonitorQuotaSnapshot = {
  providers: Partial<Record<ProviderRateLimits['provider'], ProviderRateLimits>>
  ignoredProviders: string[]
}

export type ResourceMonitorQuotaRequest = (url: string) => Promise<unknown>

const RM_QUOTA_PATH = '/v1/quotas'
const PROVIDERS = new Set<ProviderRateLimits['provider']>([
  'claude',
  'codex',
  'gemini',
  'opencode-go',
  'kimi',
  'minimax',
  'grok',
  'antigravity'
])

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asObservedAt(value: unknown): number | null {
  const text = asNonEmptyString(value)
  if (!text) {
    return null
  }
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? timestamp : null
}

function mapStatus(value: unknown): {
  status: ProviderRateLimitStatus
  sourceStatus: string
} {
  const sourceStatus = asNonEmptyString(value) ?? 'unknown'
  return { status: sourceStatus === 'ok' ? 'ok' : 'unavailable', sourceStatus }
}

function mapWindow(raw: ResourceMonitorQuotaWindow): RateLimitWindow | null {
  const usedPercent = asFiniteNumber(raw.used_percent)
  const windowMinutes = asFiniteNumber(raw.window_minutes)
  if (
    usedPercent === null ||
    usedPercent < 0 ||
    usedPercent > 100 ||
    windowMinutes === null ||
    windowMinutes <= 0
  ) {
    return null
  }
  const resetAtText = asNonEmptyString(raw.reset_at)
  const resetTimestamp = resetAtText ? Date.parse(resetAtText) : Number.NaN
  return {
    usedPercent,
    windowMinutes,
    resetsAt: Number.isFinite(resetTimestamp) ? resetTimestamp : null,
    resetDescription: null
  }
}

function windowSlot(raw: ResourceMonitorQuotaWindow): 'session' | 'weekly' | 'monthly' | null {
  const name = asNonEmptyString(raw.window)?.toLowerCase()
  const minutes = asFiniteNumber(raw.window_minutes)
  if (name === '5h' || minutes === 300) {
    return 'session'
  }
  if (name === 'weekly' || minutes === 10080) {
    return 'weekly'
  }
  if (name === 'monthly' || minutes === 43200) {
    return 'monthly'
  }
  return null
}

export function mapResourceMonitorQuotaRecord(
  raw: ResourceMonitorQuotaRecord
): { provider: ProviderRateLimits['provider']; limits: ProviderRateLimits } | null {
  const provider = asNonEmptyString(raw.provider)
  if (!provider || !PROVIDERS.has(provider as ProviderRateLimits['provider'])) {
    return null
  }
  const typedProvider = provider as ProviderRateLimits['provider']
  const windows = Array.isArray(raw.windows) ? raw.windows : []
  const slots = new Map<'session' | 'weekly' | 'monthly', RateLimitWindow>()
  let updatedAt = 0
  for (const candidate of windows) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }
    const window = mapWindow(candidate as ResourceMonitorQuotaWindow)
    const slot = windowSlot(candidate as ResourceMonitorQuotaWindow)
    const observedAt = asObservedAt((candidate as ResourceMonitorQuotaWindow).observed_at)
    if (observedAt !== null) {
      updatedAt = Math.max(updatedAt, observedAt)
    }
    if (window && slot) {
      slots.set(slot, window)
    }
  }
  const sourceStatus = mapStatus(raw.status)
  return {
    provider: typedProvider,
    limits: {
      provider: typedProvider,
      session: slots.get('session') ?? null,
      weekly: slots.get('weekly') ?? null,
      monthly: slots.get('monthly') ?? null,
      updatedAt,
      error:
        sourceStatus.status === 'ok'
          ? null
          : `Resource Monitor status: ${sourceStatus.sourceStatus}`,
      status: sourceStatus.status,
      usageMetadata: {
        source: 'web',
        resourceMonitorStatus: sourceStatus.sourceStatus
      }
    }
  }
}

export function mapResourceMonitorQuotas(
  response: ResourceMonitorQuotaResponse
): ResourceMonitorQuotaSnapshot {
  const providers: ResourceMonitorQuotaSnapshot['providers'] = {}
  const ignoredProviders: string[] = []
  const records = Array.isArray(response.records) ? response.records : []
  for (const candidate of records) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }
    const mapped = mapResourceMonitorQuotaRecord(candidate as ResourceMonitorQuotaRecord)
    if (mapped) {
      providers[mapped.provider] = mapped.limits
    } else {
      const provider = asNonEmptyString((candidate as ResourceMonitorQuotaRecord).provider)
      if (provider) {
        ignoredProviders.push(provider)
      }
    }
  }
  return { providers, ignoredProviders }
}

export async function readResourceMonitorQuotas(
  baseUrl: string,
  request: ResourceMonitorQuotaRequest
): Promise<ResourceMonitorQuotaSnapshot> {
  const response = await request(new URL(RM_QUOTA_PATH, baseUrl).toString())
  if (!response || typeof response !== 'object') {
    throw new Error('Resource Monitor quota response was not an object')
  }
  return mapResourceMonitorQuotas(response as ResourceMonitorQuotaResponse)
}
