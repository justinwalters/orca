# Orca fork — state of play

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
