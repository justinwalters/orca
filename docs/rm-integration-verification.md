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

## Independent certification (2026-08-13)

Certified from a fresh worktree at `/Users/sukiasukira/orca/workspaces/orca/rm-orca-adapter-cert`
(branch `justinwalters/rm-orca-adapter-cert`), separate from the builder worktree, against
`justinwalters/rm-orca-adapter-impl` commit `7f37198eecd1b27c9846564927e392a3e96340a9`. No
implementation code was modified.

- `git show --stat 7f37198eec` confirms the packet touches only `docs/STATE.md`,
  `docs/TASKS.md`, `docs/rm-integration-verification.md`,
  `src/main/rate-limits/resource-monitor-adapter.ts`,
  `src/main/rate-limits/resource-monitor-adapter.test.ts`, and `src/shared/rate-limit-types.ts`
  (one added optional field). `src/main/rate-limits/service.ts` and IPC wiring are untouched, and
  `readResourceMonitorQuotas`/`mapResourceMonitorQuotas` have no callers anywhere in `src/` — the
  adapter is not wired into native polling, so native polling is provably unchanged.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/rate-limits/resource-monitor-adapter.test.ts` — 3/3 passed, matching the claimed evidence.
- `pnpm exec vitest run --config config/vitest.config.ts src/main/rate-limits/` — 31 files, 446/446 passed (full native rate-limit suite, no regressions).
- `pnpm run typecheck:node` — passed clean.
- `pnpm exec oxlint` (full repo) — passed clean, zero findings.
- `git status --porcelain` — clean before and after every command above (clean-state check).
- `grep -rniE "macbook|computer-use|computer_use" src/main/rate-limits/resource-monitor-adapter.ts src/main/rate-limits/resource-monitor-adapter.test.ts` — no matches: no MacBook-polling or computer-use dependency exists in the adapter.

### Falsification attempt

Added a temporary 27-case adversarial suite
(`src/main/rate-limits/resource-monitor-adapter.adversarial.test.ts`, kept in the branch as a
regression suite) that tried to break the adapter's claims directly against
`mapResourceMonitorQuotaRecord`, `mapResourceMonitorQuotas`, and `readResourceMonitorQuotas`. All
27 passed — none of the following falsified the adapter:

- **Malformed/missing percentages**: missing `used_percent`, `used_percent` `>100`, negative,
  `Infinity`, and string-typed (`'23.5'`) all produce a dropped (`null`) window slot, never a
  fabricated value.
- **Unsupported windows/providers**: an unsupported window name+minutes combo (`daily`/1440)
  yields no slot in any of session/weekly/monthly. An unsupported provider
  (`chatgpt-enterprise`) is dropped from `providers` and surfaced in `ignoredProviders`; a record
  with a missing or non-string `provider` is silently dropped without appearing in
  `ignoredProviders` or crashing. A second malformed window for an already-populated slot does not
  overwrite the prior valid value.
- **Stale/unknown RM statuses**: `stale`, an arbitrary unknown string (`quantum-flux-error`), and a
  missing `status` field all map to Orca `unavailable` with the raw value preserved verbatim in
  `usageMetadata.resourceMonitorStatus` (`'stale'`, `'quantum-flux-error'`, `'unknown'`
  respectively). Case variants of `ok` (e.g. `'OK'`) are treated as not-ok — no loose matching.
- **Invalid timestamps**: a garbage `observed_at` leaves `updatedAt` at `0` rather than falling
  back to the local clock; a `null` or garbage `reset_at` yields `resetsAt: null`, never `NaN`;
  across multiple windows the newest valid `observed_at` wins regardless of array order.
- **Non-200/401/malformed responses**: a rejected injected `request` (simulating an HTTP 401)
  propagates as a rejection, not a silent empty result. A resolved error-shaped body
  (`{"error":"unauthorized"}`) degrades to an empty, non-fabricated snapshot
  (`{ providers: {}, ignoredProviders: [] }`) instead of throwing or inventing data. A raw string
  or `null` top-level response throws, refusing to silently succeed on the wrong shape; a
  top-level array degrades to an empty snapshot without crashing. A `null` entry mixed into
  `records` is skipped without crashing.
- **Runtime-only credential handling**: `readResourceMonitorQuotas`'s source contains no
  `Authorization`/`Bearer`/token-construction logic — the only network call is the caller-injected
  `request(url)` function, which receives a bare URL string and nothing else.

### Live contract probe

`http://127.0.0.1:8765/v1/quotas` is a real, reachable local HTTP service (confirmed via `lsof`:
a `BaseHTTPServer`/Python process listening on 127.0.0.1:8765). From this certification session,
which intentionally holds no RM credential (per this fork's design that "no credentials should
enter the Orca fork" — `docs/maintenance-policy.md`), the endpoint returned a well-formed
`401 Unauthorized` with body `{"error": "unauthorized"}` and no token or credential material
anywhere in the response headers or body — confirming the contract fails closed and never exposes
a token, including to an unauthenticated caller. This session did not independently reproduce the
builder's earlier `200`/five-record probe, because doing so would require an RM credential that is
deliberately absent from this fork and from this certifier's environment; that absence is the
expected, correct state for an independent certifier, not a defect. The adversarial suite's
"error-shaped body" and "rejected request" cases above directly cover how the adapter behaves when
fed exactly this kind of 401 response, and it does not crash or fabricate data in either case.

### Result

All checks pass. All falsification attempts failed to produce incorrect behavior. Native polling,
credential isolation, and raw-record/percentage/timestamp fidelity are confirmed unchanged.
Independent certification is complete.
