# Orca fork task queue

| ID | Task | Status | Owner | Cert | Evidence |
|---|---|---|---|---|---|
| P7-A | Register the existing fork with Orca, establish coordination files, install dependencies, build, produce and launch a local macOS app, and document the baseline. | done | codex | req | Independently certified; Suki T-248, fork commit `dd63b8acd2b80922380124c3f52b027bbfac8fef`, Suki evidence `a47a40b`. |
| P7-B | Inspect the built app and RM integration seams; record the fork maintenance policy. | done | codex | req | Independently certified by fresh Claude Sonnet 5 medium at `dffdbcef841da255c461a7676ff6f2a3117b6775`; Suki evidence commit `bdfe017`; typecheck, source/package inspection, and clean-state checks passed. |
| P7-C | Add the agent display-name settings packet after the synced baseline is independently re-certified. | open | — | req | Available after the post-sync certification gate. |
| P7-D | Implement the narrow read-only Resource Monitor REST adapter for provider quota snapshots, preserving native polling compatibility. | doing | codex | req | Claim commit precedes implementation; certification remains independent. |
