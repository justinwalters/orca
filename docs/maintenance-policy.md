# Orca fork maintenance policy

This fork is the working source for Suki-specific Orca integration. Every change is classified
before implementation:

- `UPSTREAMABLE`: generic Orca behavior with no Suki-only dependency. Keep the patch small and
  document the intended upstream target and conflict surface.
- `PRIVATE`: Suki-specific behavior, Resource Monitor wiring, local topology, or credentials and
  account policy. Do not propose upstream without first removing those dependencies.
- `EXPERIMENTAL`: exploratory UI, adapters, or integration seams whose contract is not settled.
  Keep it isolated and do not make it a prerequisite for unrelated Orca operation.

For every upstream synchronization, record the upstream commit/tag, fork patches included, merge
conflicts and resolutions, commands/tests run, and the result in this fork's `docs/STATE.md` and
the Suki story journal. An upstream sync is never implicit in a feature change. The stale-baseline
choice remains a human gate before P7-C or any later feature packet.

