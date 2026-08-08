# AI Vault typing-lag performance repro (DATA ONLY)

**Branch/worktree:** `opening-agent-session-slow-down-orca`  
**Dev identity:** Orca Dev `opening-agent-session-slow-down-orca` (CDP 9333, renderer 5181)  
**Date:** 2026-08-07  
**User production app PID 73184:** not touched  

## Setup

- Launched isolated dev build from this worktree with free CDP port 9333 + renderer 5181.
- Added repo, activated worktree, opened 2 terminal tabs.
- Real Claude agent briefly reached `working` via `claude -p ...` (OSC/status then stalled; foreground became bash).
- Continuous load driven by **synthetic `setAgentStatus` at 10 Hz** on the real pane key (same store path the hypothesis names). Provider session id attached.
- AI Vault (= right sidebar tab `vault` / "Agent Session History") toggled open vs closed.
- Typing measured with `window.__orcaTypingDiagnostic` + real CDP `page.keyboard.type` into focused xterm.
- Status identity changes counted via `store.subscribe` reference compare on `agentStatusByPaneKey`.
- Longtasks via `PerformanceObserver({entryTypes:['longtask']})`.
- Index rebuild cost via reimplementation of `buildAiVaultOriginalPaneIndex` timed on each identity change (bundled function not wrapped).

## Hypothesis (claimed chain)

`useAiVaultOriginalPaneActions` shallow-subscribes to wrapper including `agentStatusByPaneKey`.  
`setAgentStatus` mints a **new** `agentStatusByPaneKey` every ping → shallow fail → AiVaultPanel re-render → `useMemo` rebuilds pane index over all live+retained+sleeping → callback identity change → every visible row re-renders.  
Secondary: `agentSessionIdsKey` allocates/sorts/joins session ids on every store update.

---

## Results

### 1) `agentStatusByPaneKey` identity change rate

| Condition | Rate |
|-----------|------|
| All runs (vault open or closed) | **~10.0 / s** (matches 100ms synthetic ping) |

**CONFIRMED:** every `setAgentStatus` replaces the map reference (hypothesis premise).

### 2) Longtasks (PerformanceObserver)

#### Pure status pings, no typing, **1 live agent**, 15s × 2 rounds each

| Condition | longtask count | total ms | max ms |
|-----------|----------------|----------|--------|
| Vault CLOSED A | 0 | 0 | 0 |
| Vault OPEN B | 1 | 62 | 62 |
| Vault CLOSED A | 0 | 0 | 0 |
| Vault OPEN B | 1 | 58 | 58 |

#### With CDP typing, **1 live agent**, ~26s × 2 rounds each

| Condition | longtask count | total ms | max ms |
|-----------|----------------|----------|--------|
| A1 closed | 0 | 0 | 0 |
| B1 open | 1 | 74 | 74 |
| A2 closed | 0 | 0 | 0 |
| B2 open | 1 | 70 | 70 |

#### Earlier run, **21 live agents** (20 seeds + 1 real), synthetic keydown, 30s

| Condition | longtask count | total ms | max ms |
|-----------|----------------|----------|--------|
| A1 closed | 0 | 0 | 0 |
| B1 open | 2 | 122 | 72 |
| A2 closed | 0 | 0 | 0 |
| B2 open | 9 | 538 | 74 |

**Vault-open-only longtasks are consistent.** Scale (1 vs 21 agents) increases open-side longtask volume.

### 3) Keystroke → paint / parse (`__orcaTypingDiagnostic`, real CDP typing)

**1 live agent, terminal focused, ~300 keystrokes / ~26s:**

| Condition | paint p50 | paint p95 | paint max | parse p50 | parse p95 | parse max | samples | no-focus keys |
|-----------|-----------|-----------|-----------|-----------|-----------|-----------|---------|---------------|
| A1 closed | **8.0** | **15.0** | 46.2 | 0.7 | 5.0 | 41.9 | 310 | 0 |
| B1 open | **8.2** | **15.1** | 72.0 | 0.7 | 6.4 | 57.5 | 301 | 0 |
| A2 closed | **8.2** | **14.7** | 48.4 | 0.7 | 5.3 | 38.5 | 310 | 0 |
| B2 open | **8.6** | **15.6** | 58.5 | 0.7 | 6.0 | 45.9 | 301 | 0 |

**Keystroke lag was NOT strongly reproduced at p50/p95 under 1-agent + 10Hz status pings.**  
Deltas: paint p50 +0.3–0.4ms, p95 +0.1–0.9ms; max sometimes higher when open (72 vs ~46–48).  
Rare open-only longtasks (~60–74ms) can hit individual keystrokes (matches elevated max).

### 4) Index rebuild cost (proxy of `buildAiVaultOriginalPaneIndex`)

| Scale | avg / build | max / build | microbench 1000× |
|-------|-------------|-------------|------------------|
| 21 agents | **~14 µs** | **~100 µs** | **~3 µs** |

At 10 Hz that is **≪ 0.2 ms/s** of CPU — **cannot explain 50–70ms longtasks**.

**Dominant-cost claim for index rebuild: REFUTED** at 1–21 live agents.

### 5) Secondary suspect (`agentSessionIdsKey` sort+join)

| Metric | Value |
|--------|-------|
| Cost per store notify (21 agents) | **~2 µs** |
| Total over 30s | **~1.5–1.9 ms** |

**REFUTED as dominant cost** at this scale (selector still runs every notify; result string equality prevents re-render when ids unchanged).

### 6) Re-render / row-update proxies

| Metric | Closed | Open |
|--------|--------|------|
| storeListeners (census) | 955 | 967 (+12) |
| React `onCommitFiberRoot` count (~15s pure) | ~156–158 | ~159–160 |
| Vault DOM MutationObserver (`@container/ai-vault`) | 0 | 0 |

- Listener delta confirms vault mounts extra store subscriptions when open.
- Global React commit rate **not** clearly higher when open (cannot attribute commits to AiVaultPanel specifically without component-level profiler).
- No vault DOM mutations observed during status pings → visible row text/attrs often stable even if React reconciles.

**Could not directly count AiVaultPanel commits or wrap bundled `buildAiVaultOriginalPaneIndex` / `createLazyAiVaultOriginalPaneIndex`.**

---

## Verdict

### Mechanism premise: **PARTIALLY CONFIRMED**
- `setAgentStatus` **does** mint a new `agentStatusByPaneKey` every ping (~10/s measured).
- That identity thrash is independent of vault open/closed.
- Vault open adds ~12 store listeners and is the **only** condition producing longtasks under identical status traffic.

### “Index rebuild is the dominant cost”: **REFUTED**
- Rebuild is microseconds, not tens of milliseconds.

### “Vault open + agent working causes keystroke echo lag”: **WEAK / NOT CLEARLY REPRODUCED**
- With 1 agent + 10Hz synthetic status pings, paint p50/p95 nearly identical open vs closed.
- Open-only rare longtasks (~60–74ms) and slightly higher max paint are real but small for human keystroke lag claims.
- With 21 agents, open-side longtasks increase (up to 9 / 30s, 538ms total) — more consistent with scale-sensitive vault work — but keystroke absolute numbers in that run used synthetic keydown (less trustworthy for absolute latency).

### Secondary sort/join suspect: **REFUTED as dominant**

### Compared to left-sidebar `patchLiveEntriesByWorktree`
- Premise that AI Vault lacks an O(changed) patch and pays full shallow invalidation on every ping is **architecturally correct**.
- At measured scales the **paid cost is not the index map rebuild**; residual open-only longtasks are better explained by broader React/store work while vault is mounted (not isolated to index build). Scaling (more live agents / more visible session rows) may amplify that.

---

## What could not be measured
1. Direct call counts of bundled `buildAiVaultOriginalPaneIndex` / lazy factory (used reimplemented proxy).
2. Per-component AiVaultPanel / session-row React commit counts (only global commit hook + DOM mutations).
3. Continuous **organic** agent OSC status pings (Claude `-p` entered working then stopped pinging; load was synthetic `setAgentStatus`).
4. User machine’s original scale (hundreds of sessions / many parallel agents) — only ~11 vault sessions, 1–21 live agents here.

## Method notes
- Synthetic pings intentionally stress the exact Zustand write path named in the hypothesis.
- User Orca PID 73184 never killed/attached.
- Dev instance Electron PID recorded: 52345 (process group from this worktree launch).
