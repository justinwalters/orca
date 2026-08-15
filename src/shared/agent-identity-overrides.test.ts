import { describe, expect, it } from 'vitest'
import {
  AGENT_DISPLAY_NAME_MAX_LENGTH,
  normalizeAgentDisplayNameOverrides,
  normalizeAgentIconOverrides,
  resolveAgentDisplayName,
  resolveAgentIconAgent
} from './agent-identity-overrides'

describe('normalizeAgentDisplayNameOverrides', () => {
  it('keeps trimmed names for known agents', () => {
    expect(normalizeAgentDisplayNameOverrides({ hermes: '  Suki  ' })).toEqual({ hermes: 'Suki' })
  })

  it('drops unknown agents, non-strings, and blank-after-trim entries', () => {
    expect(
      normalizeAgentDisplayNameOverrides({ notAnAgent: 'X', hermes: 42, codex: '   ' })
    ).toEqual({})
  })

  it('truncates to the max length instead of storing unbounded input', () => {
    const long = 'x'.repeat(AGENT_DISPLAY_NAME_MAX_LENGTH + 50)
    const result = normalizeAgentDisplayNameOverrides({ hermes: long })
    expect(result.hermes).toHaveLength(AGENT_DISPLAY_NAME_MAX_LENGTH)
  })

  it('returns an empty record for non-object input', () => {
    expect(normalizeAgentDisplayNameOverrides(null)).toEqual({})
    expect(normalizeAgentDisplayNameOverrides('nope')).toEqual({})
  })
})

describe('normalizeAgentIconOverrides', () => {
  it('keeps overrides whose value is a known agent id', () => {
    expect(normalizeAgentIconOverrides({ hermes: 'claude' })).toEqual({ hermes: 'claude' })
  })

  it('drops overrides pointing at anything outside the fixed agent set', () => {
    expect(
      normalizeAgentIconOverrides({ hermes: 'https://evil.example/x.png', codex: 'nope' })
    ).toEqual({})
  })
})

describe('resolveAgentDisplayName', () => {
  it('prefers the override over the base label', () => {
    expect(resolveAgentDisplayName('hermes', { hermes: 'Suki' }, 'Hermes')).toBe('Suki')
  })

  it('falls back to the base label when no override exists', () => {
    expect(resolveAgentDisplayName('hermes', {}, 'Hermes localized')).toBe('Hermes localized')
  })

  it('falls back to the shared default when no base label is supplied', () => {
    expect(resolveAgentDisplayName('codex', {})).toBe('Codex')
  })

  it('ignores a blank override rather than rendering an empty name', () => {
    expect(resolveAgentDisplayName('codex', { codex: '   ' }, 'Codex')).toBe('Codex')
  })
})

describe('resolveAgentIconAgent', () => {
  it('returns the override target when set', () => {
    expect(resolveAgentIconAgent('hermes', { hermes: 'claude' })).toBe('claude')
  })

  it('returns the agent itself when unset', () => {
    expect(resolveAgentIconAgent('hermes', {})).toBe('hermes')
  })
})

describe('settings normalization contract', () => {
  it('normalizes a hostile settings payload down to safe entries', () => {
    const hostile = {
      hermes: '  Suki  ',
      codex: '',
      notAnAgent: 'Ignored',
      claude: '<script>alert(1)</script>'
    }
    const result = normalizeAgentDisplayNameOverrides(hostile)
    expect(result).toEqual({ hermes: 'Suki', claude: '<script>alert(1)</script>' })
    expect(Object.hasOwn(result, 'notAnAgent')).toBe(false)
  })
})
