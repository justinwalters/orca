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

## P7-E runtime wiring evidence (2026-08-13)

The certified adapter is now connected to the main-process `RateLimitService` through a separate
`resourceMonitor` observation payload on `RateLimitState`. Native provider snapshots and polling
remain unchanged; RM reads run only after a full native refresh, while individual native provider
refreshes do not invoke the RM request. Raw RM records, window percentages/timestamps, mapped
provider status, and ignored providers remain in the separate observation payload and are pushed
through the existing `rateLimits:update` IPC channel. The status bar exposes the RM observation
status without replacing native provider bars.

Runtime authentication is supplied only by the main-process request bridge from runtime environment
variables; no credential value is stored in source, documentation, or commits. Missing credentials,
HTTP errors (including 401), malformed responses, and aborted reads fail closed without fabricated
provider values.

Verification from the P7-E worktree:

- `pnpm exec vitest run --config config/vitest.config.ts src/main/rate-limits/ src/main/ipc/rate-limits.test.ts src/shared/rate-limit-types.test.ts` — 34 files, 455/455 passed.
- `pnpm run typecheck` — node, CLI, and web typechecks passed.
- Changed-scope `pnpm exec oxlint ...` — zero findings.
- Read-only mini-local probe of `GET http://127.0.0.1:8765/v1/quotas` without credentials returned `401 Unauthorized` and `{"error": "unauthorized"}`; no token or credential material was exposed.

P7-E remains open pending independent certification of the runtime wiring and a real authenticated
mini-local read-only contract probe performed without exposing the credential.

## P7-G independent certification (2026-08-13)

Certified from a dedicated fresh worktree at
`/Users/sukiasukira/orca/workspaces/orca/rm-orca-p7g-cert`
(branch `justinwalters/rm-orca-p7g-cert`), against `justinwalters/rm-orca-p7f` commit
`a3283bf80fc15ae24933a6c0164f2d3161728400` ("fix: harden Resource Monitor runtime refresh"), plus
the follow-up docs commit `e2a21b0f21366d34c375c7012e0dd0a3f283d43f`. No implementation code was
modified; the only change on this branch is one new regression test file
(`src/main/rate-limits/resource-monitor-runtime-cert.test.ts`) and this evidence.

### 1. Abort-safety of the runtime refresh cycle

`git show a3283bf80f -- src/main/rate-limits/service.ts` shows the hardening fix threads the
existing cycle `AbortSignal` into `readResourceMonitorQuotas(...)` and adds an
`if (signal.aborted) return` guard immediately after the awaited call resolves, in both the
success branch (before `this.resourceMonitor` is assigned) and the `catch` branch (before an
error state is assigned) — before `this.pushToRenderer()` in either case. Since the guard and the
following state mutation are synchronous with no intervening `await`, there is no re-entrant
window between the check and the mutation.

- `resource-monitor-service.test.ts`: `'does not commit a snapshot after the fetch cycle is
  aborted'` — abort before the in-flight request resolves, then resolve it; `resourceMonitor`
  state stays `null`. Passed.
- New: `resource-monitor-runtime-cert.test.ts` `'does not publish an error state when the aborted
  cycle resolves with a rejection'` — abort before the in-flight request rejects, then reject it;
  `resourceMonitor` state stays `null` (the error path the existing suite did not cover directly).
  Passed.

### 2. Runtime authentication

`resolveResourceMonitorToken` (`src/main/rate-limits/resource-monitor-token.ts`) checks
`ORCA_RESOURCE_MONITOR_TOKEN` → `RESOURCE_MONITOR_TOKEN` → `RM_TOKEN` in order, using
`environment[name] !== undefined` so an explicitly-set-but-empty variable is honored (and fails
closed) rather than falling through to a lower-precedence source. Only on `darwin`, when no
environment variable is set at all, it falls back to
`~/Library/Application Support/Resource Monitor/api-token`, using `lstatSync` (never following a
symlink) and requiring `stats.isFile()` plus `(stats.mode & 0o077) === 0` (no group/world bits)
before reading the file.

Existing mocked-fs tests (`resource-monitor-token.test.ts`) cover precedence, missing/empty file,
directory, group-readable, world-readable, and non-macOS platforms — all passed. This certification
added `resource-monitor-runtime-cert.test.ts`, which exercises the **real filesystem** (no mocked
`fs`) to remove any doubt that the mocks were hiding a gap:

- Real symlink to a valid, private (`0600`) target file at the token path → `null` (fails closed;
  `lstatSync` on a symlink reports `isFile() === false`, so the target's own permissions are never
  consulted).
- Real FIFO (`mkfifo`) at the token path, `chmod 600` → `null` (non-regular file fails closed).
- Real world-readable (`0644`) and group-readable (`0640`) file → `null` in both cases.
- Real private (`0600`) regular file as the only credential source → returns its exact contents.
- `ORCA_RESOURCE_MONITOR_TOKEN` set to `''` with `RESOURCE_MONITOR_TOKEN` set to a valid value →
  `null` (explicit empty at higher precedence fails closed instead of cascading).
- Non-darwin platform with no environment token → `null` (no file fallback attempted).

All 9 new cases plus all pre-existing token/service/adapter/request tests passed. No credential
value is read, logged, or written anywhere in source, tests, or documentation — grepped the full
git history of the touched files and this doc for the literal contents of the real mini-local
token file (`~/Library/Application Support/Resource Monitor/api-token`) with no matches.

### 3. Request bridge

`createResourceMonitorRequest` (`src/main/rate-limits/resource-monitor-request.ts`) throws
`'Resource Monitor credentials unavailable'` without calling the injected fetch when no token
resolves; otherwise it calls the injected fetch with
`{ Accept: 'application/json', Authorization: 'Bearer <token>' }` and forwards the caller's
`AbortSignal` unchanged, then throws `` `Resource Monitor request failed with HTTP ${status}` ``
on any non-`ok` response instead of returning the error body.

- `resource-monitor-request.test.ts`: Bearer + Accept headers and signal forwarding (passed);
  missing-credential rejection without invoking fetch (passed).
- New: `resource-monitor-runtime-cert.test.ts` `'rejects a non-2xx response instead of resolving
  with the error body'` (HTTP 403) — passed. This closes the one bridge behavior (non-2xx
  rejection) the pre-existing suite asserted only indirectly through the adapter layer.

### 4. Native polling isolation

`git diff 009f7df69a^..e2a21b0f21 --stat -- src/main/rate-limits/service.ts src/main/index.ts`
and a line-by-line read of both diffs (`009f7df69a`, `a3283bf80f`) show every change to
`service.ts` is additive: a new field, a new setter, a new `resourceMonitor` key on the returned
state, and a new private `refreshResourceMonitor` method called exactly once
(`grep -n 'refreshResourceMonitor(' src/main/rate-limits/service.ts` → one call site, at the end
of `runFetchAllCycle`, after every native provider's state has already been applied). No existing
native fetcher, poller, or per-provider refresh method (`runFetchCodexOnlyCycle`, etc.) was
touched or gained an RM call. `src/shared/rate-limit-types.ts` adds an optional
`resourceMonitor?: ResourceMonitorObservation | null` field; `StatusBar.tsx` adds an
`resourceMonitor &&` — gated status chip that renders the RM lane's own `'ok' | 'error' |
'unavailable'` status text (never fabricated provider data) without altering any native provider
bar. `grep -rniE "macbook|computer-use|computer_use"` across every RM source file returned no
matches, and the runtime's Resource Monitor base URL resolves to
`process.env.ORCA_RESOURCE_MONITOR_URL ?? process.env.RESOURCE_MONITOR_URL ??
'http://127.0.0.1:8765'` (`src/main/index.ts`) — mini-local loopback only, unchanged by the
hardening fix.

### 5. Test/typecheck/lint/clean-tree gates

- Focused: `pnpm exec vitest run --config config/vitest.config.ts src/main/rate-limits/resource-monitor-token.test.ts src/main/rate-limits/resource-monitor-request.test.ts src/main/rate-limits/resource-monitor-service.test.ts src/main/rate-limits/resource-monitor-adapter.test.ts src/main/rate-limits/resource-monitor-adapter.adversarial.test.ts src/main/rate-limits/service.test.ts src/main/rate-limits/resource-monitor-runtime-cert.test.ts` — 7 files, **129/129 passed**.
- Full relevant suite: `pnpm exec vitest run --config config/vitest.config.ts src/main/rate-limits/ src/main/ipc/rate-limits.test.ts src/shared/rate-limit-types.test.ts` — 37 files, **475/475 passed** (no regressions against the pre-existing 455/455 baseline plus the 20 new tests this certification added).
- `pnpm run typecheck` — node, CLI, and web typechecks passed clean.
- `pnpm exec oxlint` (full repo, zero-arg) — exit 0, zero findings.
- `git status --porcelain` — clean before every command and clean after, except for the one new
  untracked regression test file, which is committed as part of this evidence.
- Secret scan: grepped full `git log -p --all` of the touched RM files and this doc for the literal
  contents of the real local RM token file — no matches. `git grep` across the working tree for the
  same literal — no matches.

### 6. Live mini-local authenticated probe

This certification session runs as the mini-local user and holds the real, private
(`-rw-------`) `~/Library/Application Support/Resource Monitor/api-token` file, with no
`ORCA_RESOURCE_MONITOR_TOKEN` / `RESOURCE_MONITOR_TOKEN` / `RM_TOKEN` environment variable set — so
a request through the actual runtime bridge exercises the Darwin file-fallback path exactly as
`src/main/index.ts` wires it in the real app. A temporary vitest case (not committed — removed
immediately after capturing output) called `createResourceMonitorRequest` from
`resource-monitor-request.ts` unmodified, backed by Node's global `fetch`, against
`http://127.0.0.1:8765/v1/quotas`:

```
LIVE_PROBE_RESULT {"ok":true,"count":5,"providers":[{"provider":"antigravity","status":"ok"},{"provider":"claude","status":"ok"},{"provider":"codex","status":"ok"},{"provider":"copilot","status":"ok"},{"provider":"kimi","status":"stale"}]}
```

The probe returned HTTP 200 with 5 provider records through the unmodified runtime request bridge
and token resolver. Only the provider/status pairs and record count are logged above; the token
value was never read into a variable that was printed, logged, or persisted, and does not appear
anywhere in this repository, its history, or this document.

### Result

All six certification gates pass. Native provider polling, credential isolation, request-bridge
contract, and abort-safety are confirmed unchanged/correct by both source inspection and executable
falsification tests (9 new real-filesystem/bridge/abort cases, all failing to break the
implementation's claims). Independent certification of P7-E/P7-G runtime wiring is complete.
