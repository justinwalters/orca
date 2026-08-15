# Orca fork — state of play

## Session handoff (2026-08-15, upstream sync to 1.4.178-rc.2)

- Synced the fork to upstream `stablyai/main` at `35b308f46e4983cb1691473cbeb48f33043cb7f7`
  ("Remove worktree deletion success toasts (#14724)", 2026-08-15). Work is on branch
  `justinwalters/upstream-sync-2026-08-15`, merge commit `42f4afea17`, branched from `main`
  at `a2d6b2d33e`. Not yet pushed and not yet merged to `main`.
- The fork is now **0 behind / 18 ahead** of upstream. Package version moved to `orca@1.4.178-rc.2`.

### Fork patches preserved

All 17 fork commits are retained. The fork's footprint is overwhelmingly additive — 2,291
insertions against 5 deletions. Nine `src/main/rate-limits/resource-monitor-*` files do not
exist upstream at all, so they had no collision surface. Only seven pre-existing files were
ever modified, and upstream had touched just three of them.

### Conflicts and resolutions

Exactly one conflict: `src/main/rate-limits/service.test.ts`, modify/delete. Upstream
`9367169888` ("refactor(tests): split every oversized test file off the max-lines suppression
list") deleted the file by splitting it into per-concern suites, while the fork had added a
12-line test to it.

Resolution: accepted upstream's deletion, and re-homed the fork's RM-isolation test — `does not
add RM polling to an individual native provider refresh` — into
`src/main/rate-limits/service-refresh-orchestration.test.ts`, the file upstream created to own
`RateLimitService` refresh orchestration. That file already imports `RateLimitService`, the
mocked `fetchGrokRateLimits`, `okProvider`, and `vi`, so the test moved without adaptation.
This test is P7-D/P7-E certification evidence (native polling isolation) and had to survive.

`src/main/index.ts` and `src/renderer/src/components/status-bar/StatusBar.tsx` auto-merged.

### Dependencies

`pnpm-lock.yaml` was not changed by the merge. `engines.node` remains `24` and `packageManager`
remains `pnpm@10.24.0`. No reinstall was required.

### Verification (Node v24.19.0, Mac mini)

- `pnpm run typecheck` — passed across all three tsconfig projects.
- RM and rate-limits suites on the merged tree — **471 passed / 44 files**, including the
  re-homed isolation test, confirmed passing by name.
- `pnpm test` (full suite) — **52,829 passed, 70 failed across 7 files**, 124 skipped.

### The 70 failures are pre-existing, not a sync regression

All seven failing files are terminal/xterm rendering:
`src/main/daemon/terminal-snapshot-osc8-roundtrip.test.ts` and six
`src/renderer/src/components/terminal-pane/terminal-ime-*` suites. None touch Resource Monitor
or rate limits.

This was falsified rather than assumed: the identical seven files were run against a pristine
`upstream/main` worktree at `35b308f46e` containing **zero fork commits**. All seven fail there
too, with the same two unhandled errors (`Cannot read properties of undefined (reading
'dimensions')` from `@xterm/xterm`). They are upstream or headless-environment failures.

### Not yet done

- No packaged `.app` was built. Per `suki`'s `docs/decisions/orca-fork-topology.md` that needs
  the MacBook's Xcode as a disposable build worker from an exact verified commit.
- `pnpm run lint` was not run (it includes the max-lines ratchet and the localization verifiers).
- **This is builder evidence only.** Independent certification from a fresh session has not been
  performed, and the fork's standard for a gate of this kind is `cert: req`.

### Next

1. Optionally run `pnpm run lint` and build a packaged `.app` on the MacBook worker.
2. Obtain independent certification of this sync if the `cert: req` standard is being held.
3. `P7-C` (agent display-name settings) is unblocked once the above is accepted. Its design is
   in `docs/agent-identity-design.md` and its task-by-task plan in
   `docs/agent-identity-implementation-plan.md`.

## Session handoff (2026-08-12, upstream sync complete)

- The fork is `github.com/justinwalters/orca`, parent `github.com/stablyai/orca`.
- The Orca-managed checkout is `/Users/sukiasukira/orca/workspaces/SUKI/orca` on the Mac mini.
- The fork was stale by 313 commits at registration. Justin explicitly approved syncing it.
- Parent `upstream/main` was fetched at `d349f9a97268e282e5e291b074486d8df47afda2` and merged
  cleanly into the P7 branch at `02826e5f5ba1a025296ece610ab9bb0b6c4f61e9`.
- The fork branch `justinwalters/p7a-baseline` is pushed at that synced merge commit. Fork `main`
  still requires the reconciliation merge recorded in the next commit before its push.
- P7-A is complete and independently certified. Evidence is recorded in the Suki story repo at
  `docs/verification-log.md` and Suki T-248; the fork baseline commit is
  `dd63b8acd2b80922380124c3f52b027bbfac8fef`.
- P7-B is complete and independently certified. Evidence is recorded in the Suki story repo at
  `docs/verification-log.md`; the fork packet commit is `dffdbcef841da255c461a7676ff6f2a3117b6775`.
- P7-C+ is blocked pending Justin's explicit stale-baseline choice: sync upstream, or continue
  feature work on the current fork baseline. No choice is inferred here.
- P7-D is complete and independently certified from a fresh worktree, separate from the builder
  worktree, at fork commit `7f37198eecd1b27c9846564927e392a3e96340a9`. Evidence is recorded in
  `docs/rm-integration-verification.md`: targeted tests, full rate-limits suite, typecheck,
  full-repo oxlint, and clean-state checks all passed; a 27-case adversarial falsification suite
  found no defects; native polling is provably unchanged (adapter has no callers); no MacBook
  polling or computer-use dependency exists; the live mini-local `GET /v1/quotas` contract is
  confirmed fail-closed without exposing a token.

- P7-E and P7-G are complete and independently certified from a fresh worktree at fork commit
  `a3283bf80fc15ae24933a6c0164f2d3161728400` (plus docs commit `e2a21b0f21`). Evidence is recorded
  in `docs/rm-integration-verification.md`: abort-safety of the runtime refresh cycle (both the
  success and error paths), fail-closed runtime-only authentication (environment precedence,
  Darwin private-file fallback rejecting symlinks/non-regular/group-or-world-readable files),
  request-bridge contract (Bearer auth, JSON Accept, AbortSignal forwarding, non-2xx rejection),
  and native-provider-polling isolation are all confirmed by source inspection plus 9 new
  falsification tests against the real filesystem and the real abort path. Focused tests
  (129/129), full rate-limits suite (475/475), typecheck, full-repo oxlint, and clean-tree/secret
  scans all passed. A live authenticated mini-local `GET /v1/quotas` probe through the unmodified
  runtime bridge returned 200 with 5 provider records without exposing the token.

## Next

1. Finish the ordinary merge of fork `main` with the synced P7 branch and push fork `main`.
2. Run an independent post-sync typecheck/build certification before claiming P7-C.
