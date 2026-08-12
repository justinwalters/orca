# Resource Monitor integration seams

P7-B inspection of the fork baseline (`dd63b8acd2b80922380124c3f52b027bbfac8fef`) found no
Resource Monitor client, MCP tool registration, REST client, or RM-specific packaged resource in
the source or built arm64 app. This is an intentional integration seam, not a claim that RM is
absent from the wider Suki environment.

The closest existing Orca seam is `src/main/rate-limits/service.ts`, which owns provider-specific
pollers and pushes `ProviderRateLimits` state to the renderer. It currently contains native
fetchers for Claude, Codex, Gemini, Kimi, Antigravity, MiniMax, Grok, and OpenCode Go. The service
has its own polling cadence, stale thresholds, auth/account resolvers, and renderer state model.

The RM integration should therefore be a new adapter boundary rather than a replacement of the
native service in P7-B. A later packet must decide, with tests, which RM REST/MCP read-only payload
maps into the existing renderer model, how raw provider records and authoritative percentages are
preserved, and how local-versus-remote topology selects the mini publisher without duplicating
MacBook polling. No credentials should enter the Orca fork; RM remains the telemetry authority.

## Acceptance observations

- `pnpm run typecheck` and `pnpm run build:mac` pass on the fork baseline.
- The packaged arm64 app contains the normal Orca resources and local-build metadata only; no RM
  endpoint or credential material is embedded.
- Source search found no `resource-monitor`, RM MCP tool, or RM REST client reference.
- Existing native rate-limit polling remains the compatibility seam to preserve while the adapter
  is designed and independently tested.

