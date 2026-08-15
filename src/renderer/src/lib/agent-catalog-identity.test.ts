import { afterEach, describe, expect, it } from 'vitest'
import { getAgentLabel } from './agent-catalog'
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
