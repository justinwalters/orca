# RM adapter verification evidence

P7-D adds `src/main/rate-limits/resource-monitor-adapter.ts` as a narrow, read-only boundary for
the mini-local Resource Monitor REST contract. The contract observed on the Mac mini is
`GET /v1/quotas`, returning `{ count, records }`; records contain a provider, status, and quota
windows with `used_percent`, `remaining_percent`, `observed_at`, `reset_at`, and optional
`window_minutes` fields. Authentication is deliberately outside this fork: callers inject the
request function, so Orca does not read, store, or package RM credentials.

The adapter projects only the existing Orca providers and known 5-hour, weekly, and monthly
windows. It uses RM's authoritative `used_percent` and the newest valid `observed_at` as
`updatedAt`; malformed percentages or unsupported windows are omitted. RM `stale` and unknown
statuses map to Orca `unavailable` with `error` and `usageMetadata.resourceMonitorStatus`
preserving the raw status, and unknown providers are reported in `ignoredProviders`.

## Checks

- `pnpm exec vitest run --config config/vitest.config.ts src/main/rate-limits/resource-monitor-adapter.test.ts` — 3 tests passed.
- `pnpm run typecheck:node` — passed.
- Native provider polling remains unchanged; no `RateLimitService` or IPC wiring was modified.
- Live read-only contract probe on 2026-08-13 returned `200` from `http://127.0.0.1:8765/v1/quotas`
  with five provider records. The probe used the existing mini-local service and did not poll the
  MacBook or use computer-use.

Independent certification is still required before this task can be marked done.
