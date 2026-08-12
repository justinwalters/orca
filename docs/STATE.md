# Orca fork — state of play

## Session handoff (2026-08-12, P7-B)

- The fork is `github.com/justinwalters/orca`, parent `github.com/stablyai/orca`.
- The Orca-managed checkout is `/Users/sukiasukira/orca/workspaces/SUKI/orca` on the Mac mini.
- Baseline is fork `main` at `3e6b93f0d2d6fb8b699481b126bff735560f1dee`.
- At registration time the fork was 0 commits ahead and 313 commits behind upstream `main`.
- The upstream sync choice is intentionally not made here; it is a human gate before P7-C+.
- P7-A is complete and independently certified. Evidence is recorded in the Suki story repo at
  `docs/verification-log.md` and Suki T-248; the fork baseline commit is
  `dd63b8acd2b80922380124c3f52b027bbfac8fef`.
- P7-B is now the active packet: record maintenance classification rules and inspect the built
  app's Resource Monitor integration seams. Do not begin P7-C+ until the stale-baseline gate is
  resolved by Justin.

## Next

1. Record the P7-B maintenance policy and inspect RM integration seams.
2. Have an independent Sonnet 5 medium session certify the P7-B inspection and policy checks.
3. Await Justin's explicit choice: upstream sync, or continue P7-C+ on this stale baseline.
