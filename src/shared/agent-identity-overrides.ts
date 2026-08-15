import { isTuiAgent } from './tui-agent-config'
import { TUI_AGENT_DISPLAY_NAMES } from './tui-agent-display-names'
import type { TuiAgent } from './tui-agent'

/** Why: names render in fixed-width picker rows and keybinding titles; an
 *  unbounded string would break layout and bloat persisted settings. */
export const AGENT_DISPLAY_NAME_MAX_LENGTH = 40

export function normalizeAgentDisplayNameOverrides(
  value: unknown
): Partial<Record<TuiAgent, string>> {
  const normalized: Partial<Record<TuiAgent, string>> = {}
  if (!value || typeof value !== 'object') {
    return normalized
  }
  for (const [agent, name] of Object.entries(value)) {
    if (!isTuiAgent(agent) || typeof name !== 'string') {
      continue
    }
    const trimmed = name.trim()
    if (!trimmed) {
      // Why: blank means "revert to the catalog label", so it is never stored.
      continue
    }
    normalized[agent] = trimmed.slice(0, AGENT_DISPLAY_NAME_MAX_LENGTH)
  }
  return normalized
}

export function normalizeAgentIconOverrides(value: unknown): Partial<Record<TuiAgent, TuiAgent>> {
  const normalized: Partial<Record<TuiAgent, TuiAgent>> = {}
  if (!value || typeof value !== 'object') {
    return normalized
  }
  for (const [agent, iconAgent] of Object.entries(value)) {
    // Why: the override value must itself be a known agent id. That keeps the
    // icon set to assets already shipped — no URL or filesystem path can enter.
    if (!isTuiAgent(agent) || !isTuiAgent(iconAgent)) {
      continue
    }
    normalized[agent] = iconAgent
  }
  return normalized
}

export function resolveAgentDisplayName(
  agent: TuiAgent,
  overrides: Partial<Record<TuiAgent, string>> | null | undefined,
  baseLabel?: string
): string {
  const override = overrides?.[agent]?.trim()
  if (override) {
    return override
  }
  return baseLabel ?? TUI_AGENT_DISPLAY_NAMES[agent]
}

export function resolveAgentIconAgent(
  agent: TuiAgent,
  overrides: Partial<Record<TuiAgent, TuiAgent>> | null | undefined
): TuiAgent {
  const override = overrides?.[agent]
  return override && isTuiAgent(override) ? override : agent
}
