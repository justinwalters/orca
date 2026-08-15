// @vitest-environment happy-dom
import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRateLimits, ResourceMonitorObservation } from '../../../../shared/rate-limit-types'
import type * as I18nModule from '@/i18n/i18n'
import { ResourceMonitorMeter } from './ResourceMonitorMeter'

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <div data-tooltip>{children}</div>
}))

vi.mock('@/i18n/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof I18nModule>()
  return {
    ...actual,
    // Why this interpolates rather than returning `fallback` verbatim: the
    // real translate() substitutes {{value0}}-style placeholders via
    // i18next. Several ResourceMonitorMeter strings are dynamic (provider
    // name, formatted timestamp) — returning the raw template would make
    // every assertion below check for a literal "{{value0}}" instead of
    // the actual rendered text.
    translate: (_key: string, fallback: string, options?: Record<string, unknown>) =>
      options
        ? fallback.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => String(options[token] ?? ''))
        : fallback
  }
})

function providerSnapshot(
  provider: ProviderRateLimits['provider'],
  overrides: Partial<ProviderRateLimits> = {}
): ProviderRateLimits {
  return {
    provider,
    session: { usedPercent: 10, windowMinutes: 300, resetsAt: null, resetDescription: null },
    weekly: null,
    updatedAt: 1000,
    error: null,
    status: 'ok',
    ...overrides
  }
}

function observation(
  overrides: Partial<ResourceMonitorObservation> = {}
): ResourceMonitorObservation {
  return {
    status: 'ok',
    providers: {},
    ignoredProviders: [],
    records: [],
    error: null,
    ...overrides
  }
}

afterEach(() => {
  cleanup()
})

describe('ResourceMonitorMeter', () => {
  it('renders nothing when resourceMonitor has not arrived yet', () => {
    const { container } = render(
      <ResourceMonitorMeter resourceMonitor={null} providers={[providerSnapshot('claude')]} />
    )
    expect(container.textContent).toBe('')
  })

  it('state 6 — renders a single RM-unavailable badge, not per-provider rows, when the aggregate fetch failed', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({ status: 'error', error: 'network down' })}
        providers={[providerSnapshot('claude'), providerSnapshot('codex')]}
      />
    )
    expect(screen.getByText('RM unavailable')).toBeTruthy()
    expect(screen.getByLabelText('Resource Monitor unavailable')).toBeTruthy()
    expect(screen.getByText('network down')).toBeTruthy()
    // No per-provider row markup should exist alongside it.
    expect(screen.queryByLabelText('Resource Monitor quota meter')).toBeNull()
  })

  it('state 6 — falls back to generic copy when RM reports unavailable with no error string', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({ status: 'unavailable', error: null })}
        providers={[providerSnapshot('claude')]}
      />
    )
    expect(screen.getByText('Resource Monitor is unreachable.')).toBeTruthy()
  })

  it('renders nothing when RM is ok but no providers are configured/visible', () => {
    const { container } = render(
      <ResourceMonitorMeter resourceMonitor={observation({ status: 'ok' })} providers={[]} />
    )
    expect(container.textContent).toBe('')
  })

  it('state 1 — renders a healthy/current provider distinctly from stale', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({
          status: 'ok',
          providers: {
            claude: providerSnapshot('claude', {
              session: { usedPercent: 42, windowMinutes: 300, resetsAt: null, resetDescription: null },
              usageMetadata: { resourceMonitorStatus: 'ok' }
            })
          }
        })}
        providers={[providerSnapshot('claude')]}
      />
    )
    expect(screen.getByLabelText('Claude — current quota data')).toBeTruthy()
  })

  it('state 2 — renders stale distinctly from current, even though RM overall status is ok (requirement a)', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({
          status: 'ok',
          providers: {
            claude: providerSnapshot('claude', {
              session: { usedPercent: 42, windowMinutes: 300, resetsAt: null, resetDescription: null },
              usageMetadata: { resourceMonitorStatus: 'stale' }
            })
          }
        })}
        providers={[providerSnapshot('claude')]}
      />
    )
    expect(screen.getByLabelText('Claude — stale quota data')).toBeTruthy()
    expect(screen.queryByLabelText('Claude — current quota data')).toBeNull()
  })

  it('state 3 — renders unknown when raw status is unrecognized, never fabricating current or stale', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({
          status: 'ok',
          providers: {
            claude: providerSnapshot('claude', {
              usageMetadata: { resourceMonitorStatus: 'weird-value' }
            })
          }
        })}
        providers={[providerSnapshot('claude')]}
      />
    )
    expect(screen.getByLabelText('Claude — quota status unknown')).toBeTruthy()
  })

  it('state 3 — renders unknown (not current) when RM claims ok but every window was rejected upstream', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({
          status: 'ok',
          providers: {
            claude: providerSnapshot('claude', {
              session: null,
              usageMetadata: { resourceMonitorStatus: 'ok' }
            })
          }
        })}
        providers={[providerSnapshot('claude')]}
      />
    )
    expect(screen.getByLabelText('Claude — quota status unknown')).toBeTruthy()
  })

  it('state 4 — flags an exhausted window with a distinct badge instead of blending into "high usage" red', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({
          status: 'ok',
          providers: {
            claude: providerSnapshot('claude', {
              session: { usedPercent: 100, windowMinutes: 300, resetsAt: null, resetDescription: null },
              usageMetadata: { resourceMonitorStatus: 'ok' }
            })
          }
        })}
        providers={[providerSnapshot('claude')]}
      />
    )
    expect(screen.getAllByLabelText('Exhausted').length).toBeGreaterThan(0)
  })

  it('does not flag 99.9% as exhausted', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({
          status: 'ok',
          providers: {
            claude: providerSnapshot('claude', {
              session: { usedPercent: 99.9, windowMinutes: 300, resetsAt: null, resetDescription: null },
              usageMetadata: { resourceMonitorStatus: 'ok' }
            })
          }
        })}
        providers={[providerSnapshot('claude')]}
      />
    )
    expect(screen.queryByLabelText('Exhausted')).toBeNull()
  })

  it('state 5 — renders provider-unavailable distinctly from state 6 RM-unavailable (requirement b)', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({ status: 'ok', providers: {} })}
        providers={[providerSnapshot('codex')]}
      />
    )
    expect(screen.getByLabelText('Codex — not tracked by Resource Monitor')).toBeTruthy()
    // Must never render the RM-unavailable copy for a per-provider gap.
    expect(screen.queryByText('RM unavailable')).toBeNull()
    expect(screen.queryByLabelText('Resource Monitor unavailable')).toBeNull()
  })

  it('requirement (a) — an ok aggregate status never implies every provider is healthy', () => {
    render(
      <ResourceMonitorMeter
        resourceMonitor={observation({
          status: 'ok',
          providers: {
            claude: providerSnapshot('claude', {
              session: { usedPercent: 5, windowMinutes: 300, resetsAt: null, resetDescription: null },
              usageMetadata: { resourceMonitorStatus: 'ok' }
            }),
            codex: providerSnapshot('codex', {
              usageMetadata: { resourceMonitorStatus: 'stale' },
              session: { usedPercent: 90, windowMinutes: 300, resetsAt: null, resetDescription: null }
            })
          }
        })}
        providers={[providerSnapshot('claude'), providerSnapshot('codex')]}
      />
    )
    expect(screen.getByLabelText('Claude — current quota data')).toBeTruthy()
    expect(screen.getByLabelText('Codex — stale quota data')).toBeTruthy()
  })

  it('renders a separator between multiple provider rows', () => {
    const { container } = render(
      <ResourceMonitorMeter
        resourceMonitor={observation({ status: 'ok', providers: {} })}
        providers={[providerSnapshot('claude'), providerSnapshot('codex')]}
      />
    )
    expect(container.querySelectorAll('[aria-hidden="true"].bg-border').length).toBe(1)
  })
})
