# About this fork

This is a fork of [`stablyai/orca`](https://github.com/stablyai/orca). It adds one thing: a
**narrow, read-only Resource Monitor (RM) integration** that surfaces provider quota
observations collected by an external telemetry service, alongside Orca's own native
rate-limit polling.

This file is the durable record of what the fork changes and why. Read it before syncing with
upstream — it tells you what must survive the merge and how to prove it did.

## Design rule

**RM is an additional observation source, never a replacement.** Orca's native provider polling
is untouched. If RM is unreachable, misconfigured, or returns malformed data, Orca behaves
exactly as upstream does.

## What the fork changes

The footprint is deliberately small and overwhelmingly additive — **2,291 insertions against 5
deletions** at the time of writing.

**New files** (none exist upstream, so they cannot conflict):

```
src/main/rate-limits/resource-monitor-adapter.ts       maps RM payloads to Orca's model
src/main/rate-limits/resource-monitor-request.ts       authenticated request bridge
src/main/rate-limits/resource-monitor-token.ts         fail-closed credential resolution
src/main/rate-limits/resource-monitor-*.test.ts        unit, adversarial, and runtime suites
```

**Modified upstream files** — only these, and all changes are additive:

| File | Change |
|---|---|
| `src/main/rate-limits/service.ts` | new field, new setter, new `resourceMonitor` key on returned state |
| `src/main/index.ts` | wires the request bridge at startup |
| `src/shared/rate-limit-types.ts` | one optional field plus the observation payload type |
| `src/renderer/src/store/slices/rate-limits.ts` | carries the observation through to the renderer |
| `src/renderer/src/components/status-bar/StatusBar.tsx` | shows RM status without replacing native bars |
| `src/shared/rate-limit-types.test.ts` | coverage for the added type |
| `src/main/rate-limits/service-refresh-orchestration.test.ts` | one test: RM must not piggyback on a native refresh |

## The integration seam

`src/main/rate-limits/service.ts` owns Orca's native provider fetchers and pushes
`ProviderRateLimits` to the renderer. The fork adds RM as a **separate adapter boundary beside
that service**, not as a replacement for it.

RM data travels as its own `resourceMonitor` observation payload on `RateLimitState`, pushed
through the existing `rateLimits:update` IPC channel. Native provider snapshots are never
overwritten by RM values.

## Behavioural invariants

These are the properties the test suite exists to protect. If a future change breaks one of
these, that is a regression regardless of whether tests still pass.

**Polling isolation**
- RM reads run **only after a full native refresh**.
- An individual native provider refresh **never** triggers an RM request.

**Data projection**
- Only providers Orca already knows about are projected; unknown providers are reported in
  `ignoredProviders` rather than invented.
- Only known 5-hour, weekly, and monthly windows are mapped.
- RM's authoritative `used_percent` is used as-is; the newest valid `observed_at` becomes
  `updatedAt`.
- Malformed percentages (missing, `>100`, negative, `Infinity`, string-typed) and unsupported
  windows produce **no slot at all** — never a fabricated value.
- RM `stale` and unknown statuses map to Orca `unavailable`, preserving the raw status in
  `usageMetadata.resourceMonitorStatus`.

**Fail-closed everywhere**
- Missing credentials, HTTP errors including `401`, malformed responses, and aborted reads all
  fail closed. None of them fabricate provider values.

## Credential handling

**No credential value exists in this repository** — not in source, tests, documentation, or
commit history. The token is supplied at runtime only.

`resolveResourceMonitorToken` (`resource-monitor-token.ts`) resolves in this order:

1. `ORCA_RESOURCE_MONITOR_TOKEN`
2. `RESOURCE_MONITOR_TOKEN`
3. `RM_TOKEN`

Presence is tested with `environment[name] !== undefined`, so a variable that is **explicitly set
but empty fails closed** rather than cascading to a lower-precedence source.

On macOS only, and only when no environment variable is set at all, it falls back to a private
token file under the user's Application Support directory. That read is deliberately strict:

- `lstatSync` is used, so a **symlink is never followed** — the target's permissions are never
  consulted.
- The path must be a regular file (`isFile()`); a FIFO or directory fails closed.
- Permissions must have no group or world bits (`(mode & 0o077) === 0`); `0640` and `0644` both
  fail closed.

The request bridge (`resource-monitor-request.ts`) throws
`Resource Monitor credentials unavailable` **without calling fetch** when no token resolves.
Otherwise it sends `Accept: application/json` and `Authorization: Bearer <token>`, forwards the
caller's `AbortSignal` unchanged, and throws on any non-2xx response instead of returning the
error body.

## Upstream contract consumed

`GET /v1/quotas` returns `{ count, records }`. Each record carries a provider, a status, and
quota windows with `used_percent`, `remaining_percent`, `observed_at`, `reset_at`, and an
optional `window_minutes`.

Authentication is intentionally outside this fork: callers inject the request function, so Orca
never reads, stores, or packages RM credentials itself.

## Maintenance policy

Classify every change before implementing it:

- **`UPSTREAMABLE`** — generic Orca behaviour with no deployment-specific dependency. Keep the
  patch small and note the intended upstream target and conflict surface.
- **`PRIVATE`** — deployment-specific behaviour, Resource Monitor wiring, local topology, or
  credential and account policy. Do not propose upstream without first removing those
  dependencies.
- **`EXPERIMENTAL`** — exploratory UI, adapters, or seams whose contract is not settled. Keep it
  isolated and never a prerequisite for unrelated Orca operation.

An upstream sync is never implicit in a feature change. Record every sync: the upstream commit,
which fork patches were included, conflicts and their resolutions, the commands run, and the
result.

## Syncing with upstream

```bash
git remote add upstream https://github.com/stablyai/orca.git   # once
git fetch upstream
git merge upstream/main
```

**Known conflict pattern.** Upstream periodically splits oversized test files off its max-lines
suppression list. When it splits a file the fork has added tests to, the merge reports a
`modify/delete` conflict. This has happened once already, to
`src/main/rate-limits/service.test.ts`.

The resolution is always the same shape: **accept upstream's deletion, then re-home the fork's
test into whichever new file now owns that behaviour.** Do not resurrect the deleted file — that
reintroduces the max-lines violation upstream just fixed. The fork's RM isolation test currently
lives in `service-refresh-orchestration.test.ts` for exactly this reason.

Everything else has merged cleanly to date, because the fork touches so few upstream files.

### Verifying a sync

Requires **Node 24** and **pnpm 10.24.0** (see `engines` and `packageManager` in `package.json`).

```bash
pnpm run typecheck
pnpm exec vitest run --config config/vitest.config.ts \
  src/main/rate-limits/ src/shared/rate-limit-types.test.ts
```

The second command is the one that matters: it proves the RM integration survived. A healthy
result is a fully green rate-limits suite, and it must include the test named
`does not add RM polling to an individual native provider refresh`.

**The acceptance question for a sync is not "does it build" — it is "does the RM integration
still hold".**

### Known pre-existing test failures

The full suite (`pnpm test`) is **not** green, and has not been for some time. As of the last
sync, 7 files fail with roughly 70 failing cases:

```
src/main/daemon/terminal-snapshot-osc8-roundtrip.test.ts
src/renderer/src/components/terminal-pane/terminal-ime-hangul-syllable-flush.test.ts
src/renderer/src/components/terminal-pane/terminal-ime-won-composition-order.test.ts
src/renderer/src/components/terminal-pane/terminal-ime-xterm-adversarial.test.ts
src/renderer/src/components/terminal-pane/terminal-ime-xterm-composition-deduplication.test.ts
src/renderer/src/components/terminal-pane/terminal-ime-xterm-resumed-preedit-visibility.test.ts
src/renderer/src/components/terminal-pane/terminal-ime-xterm-transaction-events.test.ts
```

These are terminal and xterm rendering failures — IME composition and OSC8 round-tripping — and
**they are not caused by this fork**. That was verified, not assumed: the identical files were
run against a pristine `upstream/main` worktree containing zero fork commits, and all seven fail
there too, with the same `Cannot read properties of undefined (reading 'dimensions')` errors from
`@xterm/xterm`. They appear to be environment-sensitive under a headless runner.

Do not chase these after a sync. Compare against pristine upstream before assuming a failure is
yours.

## Verification history

Each change to the RM integration has been independently certified from a fresh worktree,
separate from the one that built it, with adversarial tests written specifically to try to
falsify the implementation's claims.

- **RM adapter** — 3 targeted tests, full rate-limits suite (446/446), typecheck, full-repo
  lint, clean-state checks. A 27-case adversarial suite found no defects; it is retained as
  `resource-monitor-adapter.adversarial.test.ts`. Native polling was provably unchanged at that
  point because the adapter had no callers anywhere in `src/`.
- **Runtime wiring** — 455/455 across 34 files, plus a live unauthenticated probe confirming
  `401` with no credential exposure.
- **Runtime hardening** — 9 new cases exercising the **real filesystem** rather than a mocked
  `fs`, because mocks could have hidden a gap in the credential checks: a real symlink to a
  valid private file, a real FIFO, real `0644` and `0640` files, a real `0600` file, an
  explicitly-empty higher-precedence environment variable, and a non-macOS platform. All fail
  closed except the legitimate `0600` case. Also closed the one bridge behaviour the earlier
  suite only asserted indirectly: non-2xx rejection.

## Roadmap

Agent identity overrides — letting a user rename an agent and change its icon from the Agents
settings screen, so identity is editable in-app instead of patched into a built bundle
afterwards. The design and its task-by-task implementation plan are kept with the working
checkout rather than published here.
