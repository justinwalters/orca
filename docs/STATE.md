# Orca fork — state of play

## Session handoff (2026-08-12, P7-A baseline)

- The fork is `github.com/justinwalters/orca`, parent `github.com/stablyai/orca`.
- The Orca-managed checkout is `/Users/sukiasukira/orca/workspaces/SUKI/orca` on the Mac mini.
- Baseline is fork `main` at `3e6b93f0d2d6fb8b699481b126bff735560f1dee`.
- At registration time the fork was 0 commits ahead and 313 commits behind upstream `main`.
- The upstream sync choice is intentionally not made here; it is a human gate before P7-C+.
- P7-A still needs dependency installation, build evidence, local `.app` production/launch, and
  independent certification before it can be marked done.

## Next

1. Install the pinned package-manager/dependencies on the mini.
2. Run the repository's baseline tests/typechecks and build commands.
3. Produce and launch a local macOS app, recording the exact artifact and launch result.
4. Have an independent Sonnet 5 medium session re-run the falsifiable baseline checks.

