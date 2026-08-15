import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AgentIcon, getAgentCatalog, getAgentLabel } from './agent-catalog'
import { useAppStore } from '@/store'
import { i18n } from '@/i18n/i18n'

afterEach(() => {
  useAppStore.setState({ settings: null })
})

describe('getAgentLabel', () => {
  it('returns the catalog label when no override exists', () => {
    expect(getAgentLabel('hermes', {})).toBe('Hermes')
  })

  it('prefers an explicit override over the catalog label', () => {
    expect(getAgentLabel('hermes', { hermes: 'Suki' })).toBe('Suki')
  })

  it('ignores a blank override rather than rendering an empty name', () => {
    expect(getAgentLabel('codex', { codex: '   ' })).toBe('Codex')
  })

  it('reads overrides from settings when none are passed explicitly', () => {
    useAppStore.setState({
      settings: { agentDisplayNameOverrides: { hermes: 'Suki' } } as never
    })
    expect(getAgentLabel('hermes')).toBe('Suki')
  })

  it('falls back to the catalog label when settings are absent', () => {
    useAppStore.setState({ settings: null })
    expect(getAgentLabel('hermes')).toBe('Hermes')
  })

  it('keeps an override after a language change', async () => {
    // Why: an override is user data, not a translation. createLocalizedCatalog
    // rebuilds the base catalog per locale; the override must survive that.
    expect(getAgentLabel('hermes', { hermes: 'Suki' })).toBe('Suki')
    await i18n.changeLanguage('ja')
    expect(getAgentLabel('hermes', { hermes: 'Suki' })).toBe('Suki')
    await i18n.changeLanguage('en')
  })

  it('still returns the agent id for an agent missing from the catalog', () => {
    expect(getAgentLabel('not-a-real-agent' as never, {})).toBe('not-a-real-agent')
  })
})

describe('getAgentCatalog', () => {
  it('applies display-name overrides to catalog entries', () => {
    const entry = getAgentCatalog({ hermes: 'Suki' }).find((e) => e.id === 'hermes')
    expect(entry?.label).toBe('Suki')
  })

  it('leaves other entries untouched', () => {
    const codex = getAgentCatalog({ hermes: 'Suki' }).find((e) => e.id === 'codex')
    expect(codex?.label).toBe('Codex')
  })

  it('returns the identical array when no override applies', () => {
    // Why: React memoization depends on referential stability. Allocating a new
    // array on every call would invalidate consumers for no reason.
    expect(getAgentCatalog({})).toBe(getAgentCatalog({}))
  })

  it('does not mutate the cached base catalog', () => {
    getAgentCatalog({ hermes: 'Suki' })
    expect(getAgentCatalog({}).find((e) => e.id === 'hermes')?.label).toBe('Hermes')
  })

  it('reads overrides from settings when none are passed', () => {
    useAppStore.setState({
      settings: { agentDisplayNameOverrides: { hermes: 'Suki' } } as never
    })
    expect(getAgentCatalog().find((e) => e.id === 'hermes')?.label).toBe('Suki')
  })
})

describe('single resolver', () => {
  it('keeps getAgentLabel and getAgentCatalog in agreement', () => {
    const overrides = { hermes: 'Suki', codex: 'Cx' }
    for (const entry of getAgentCatalog(overrides)) {
      expect(getAgentLabel(entry.id, overrides)).toBe(entry.label)
    }
  })
})

describe('AgentIcon icon override', () => {
  function markup(agent: string, iconOverrides: Record<string, string>): string {
    return renderToStaticMarkup(React.createElement(AgentIcon, { agent, iconOverrides } as never))
  }

  it('renders the override target exactly as that agent renders itself', () => {
    // Why: the strongest statement of "use that agent's icon" is that the two
    // are indistinguishable, rather than asserting a particular glyph name.
    expect(markup('hermes', { hermes: 'copilot' })).toBe(markup('copilot', {}))
  })

  it('renders its own icon when no override applies', () => {
    expect(markup('codex', {})).toBe(markup('codex', {}))
    expect(markup('hermes', {})).not.toBe(markup('copilot', {}))
  })

  it('ignores an override pointing outside the shipped agent set', () => {
    expect(markup('hermes', { hermes: 'https://evil.example/x.png' })).toBe(markup('hermes', {}))
  })
})
