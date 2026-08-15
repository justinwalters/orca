import type { ProviderRateLimits, RateLimitWindow, ResourceMonitorObservation } from '../../../../shared/rate-limit-types'

// Why: RM's adapter (src/main/rate-limits/resource-monitor-adapter.ts) already
// rejects any used_percent outside [0, 100] before a window ever reaches the
// renderer — see mapWindow's bounds check. So 100 is not an early-warning
// threshold we're inventing; it is the literal ceiling RM's own contract
// allows, meaning "no quota left" rather than "usage is high." Anything below
// 100 still has quota remaining and must not be presented as exhausted.
export const RESOURCE_MONITOR_EXHAUSTED_THRESHOLD = 100

export type ResourceMonitorWindowSlot = 'session' | 'weekly' | 'monthly'

export type ResourceMonitorWindowMeter = {
  slot: ResourceMonitorWindowSlot
  usedPercent: number
  resetsAt: number | null
  exhausted: boolean
}

export type ResourceMonitorProviderMeterState =
  // State 6 — the aggregate RM fetch itself did not succeed (or hasn't run
  // yet); there is no per-provider data of any kind to project. Never
  // returned by deriveResourceMonitorProviderState once the caller has
  // already confirmed resourceMonitor.status === 'ok' for every provider —
  // it only shows up when that top-level check is skipped.
  | { kind: 'rm-unavailable' }
  // State 5 — RM's fetch succeeded, but this specific provider has no record
  // in resourceMonitor.providers (never returned by RM, or dropped into
  // ignoredProviders upstream in the adapter).
  | { kind: 'provider-unavailable'; providerId: ProviderRateLimits['provider'] }
  // State 3 — a record exists but nothing lets us vouch for it: RM's raw
  // status was missing/unrecognized, or it claimed "ok"/"stale" while every
  // window was rejected by the adapter (malformed percentages, unsupported
  // window). Never fabricate a number here.
  | { kind: 'unknown'; providerId: ProviderRateLimits['provider']; rawStatus: string | null }
  // State 2 — RM's own raw status says "stale". Windows are still shown
  // (last-known values) but callers MUST render them visually distinct from
  // 'current' — this is the FORK.md invariant that stale data is never
  // presented as current.
  | {
      kind: 'stale'
      providerId: ProviderRateLimits['provider']
      windows: ResourceMonitorWindowMeter[]
      updatedAt: number
    }
  // State 1 (and, per-window, state 4 via ResourceMonitorWindowMeter.exhausted)
  | {
      kind: 'current'
      providerId: ProviderRateLimits['provider']
      windows: ResourceMonitorWindowMeter[]
      updatedAt: number
    }

function collectWindows(record: ProviderRateLimits): ResourceMonitorWindowMeter[] {
  const slots: { slot: ResourceMonitorWindowSlot; window: RateLimitWindow | null | undefined }[] = [
    { slot: 'session', window: record.session },
    { slot: 'weekly', window: record.weekly },
    { slot: 'monthly', window: record.monthly }
  ]
  const meters: ResourceMonitorWindowMeter[] = []
  for (const { slot, window } of slots) {
    if (!window) {
      continue
    }
    meters.push({
      slot,
      usedPercent: window.usedPercent,
      resetsAt: window.resetsAt,
      exhausted: window.usedPercent >= RESOURCE_MONITOR_EXHAUSTED_THRESHOLD
    })
  }
  return meters
}

/**
 * Derives a single provider's meter state from its own RM record — never from
 * resourceMonitor.status. Callers MUST check resourceMonitor.status === 'ok'
 * (or handle the 'rm-unavailable' result below) before trusting anything
 * this returns; the aggregate status only proves the HTTP fetch succeeded,
 * not that any individual provider's data is fresh (see FORK.md).
 */
export function deriveResourceMonitorProviderState(
  resourceMonitor: ResourceMonitorObservation | null | undefined,
  providerId: ProviderRateLimits['provider']
): ResourceMonitorProviderMeterState {
  if (!resourceMonitor || resourceMonitor.status !== 'ok') {
    // Why status (not per-provider data) legitimately gates here: when the
    // top-level fetch didn't succeed, service.ts never populates `providers`
    // at all (it resets to {}) — there is no last-known per-provider data to
    // fall back to, so there is nothing to derive per-provider from.
    return { kind: 'rm-unavailable' }
  }
  const record = resourceMonitor.providers[providerId]
  if (!record) {
    return { kind: 'provider-unavailable', providerId }
  }
  const rawStatus = record.usageMetadata?.resourceMonitorStatus ?? null
  const windows = collectWindows(record)
  if (rawStatus === 'ok') {
    if (windows.length === 0) {
      // RM claims this provider is fine but left us with no usable window —
      // honest fallback is "unknown", not fabricating a bar.
      return { kind: 'unknown', providerId, rawStatus }
    }
    return { kind: 'current', providerId, windows, updatedAt: record.updatedAt }
  }
  if (rawStatus === 'stale') {
    if (windows.length === 0) {
      return { kind: 'unknown', providerId, rawStatus }
    }
    return { kind: 'stale', providerId, windows, updatedAt: record.updatedAt }
  }
  // Covers RM's own 'unknown' status plus any other unrecognized raw value.
  return { kind: 'unknown', providerId, rawStatus }
}
