import React from 'react'
import { AlertTriangle, Ban, Clock, HelpCircle, WifiOff } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type {
  ProviderRateLimits,
  ResourceMonitorObservation
} from '../../../../shared/rate-limit-types'
import { translate } from '@/i18n/i18n'
import { ProviderIcon, barColor, clampUsedPercent, formatTimeAgo, getProviderDisplayName } from './tooltip'
import {
  deriveResourceMonitorProviderState,
  type ResourceMonitorProviderMeterState,
  type ResourceMonitorWindowMeter,
  type ResourceMonitorWindowSlot
} from './resource-monitor-meter-state'

// Why this file exists separately from StatusBar.tsx: StatusBar.tsx is
// already at the max-lines ratchet ceiling, and the RM meter is a
// self-contained presentation concern (see FORK.md's "narrow, read-only"
// design rule) — it reads `resourceMonitor` off RateLimitState but never
// touches native provider polling.

function windowSlotLabel(slot: ResourceMonitorWindowSlot): string {
  // Why these three keys are copy-pasted from tooltip.tsx rather than newly
  // minted: they already exist in the localization catalog for the exact
  // same English words in the same status-bar surface, so reusing them adds
  // zero new translation debt instead of duplicating "Session"/"Weekly"/
  // "Monthly" under a second key.
  if (slot === 'session') {
    return translate('auto.components.status.bar.tooltip.94038ad2fa', 'Session')
  }
  if (slot === 'weekly') {
    return translate('auto.components.status.bar.tooltip.252c096536', 'Weekly')
  }
  return translate('auto.components.status.bar.tooltip.7f7f208060', 'Monthly')
}

function ResourceMonitorUnavailableBadge({
  error
}: {
  error: string | null
}): React.JSX.Element {
  // State 6 — RM unavailable. Deliberately a single, structurally different
  // element (not a per-provider row) so it can never be mistaken for state 5
  // (a single muted provider row among otherwise-healthy ones). Red signals
  // an actual outage; provider-unavailable below stays muted/neutral because
  // it is often just "this provider isn't tracked", not a failure.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 text-red-500/90"
          aria-label={translate("auto.components.status.bar.ResourceMonitorMeter.0031c79519", "Resource Monitor unavailable")}
        >
          <WifiOff size={11} />
          <span className="text-[11px]">{translate("auto.components.status.bar.ResourceMonitorMeter.d79b9a0c4b", "RM unavailable")}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {error ?? translate("auto.components.status.bar.ResourceMonitorMeter.d3e8231aa5", "Resource Monitor is unreachable.")}
      </TooltipContent>
    </Tooltip>
  )
}

function WindowMeterBar({
  window,
  dimmed
}: {
  window: ResourceMonitorWindowMeter
  dimmed: boolean
}): React.JSX.Element {
  const pct = clampUsedPercent(window.usedPercent)
  return (
    <span
      className={`h-[4px] w-[14px] overflow-hidden rounded-full bg-muted ${
        dimmed ? 'border border-dashed border-muted-foreground/60' : ''
      }`}
    >
      <span
        className={`block h-full rounded-full transition-all ${
          window.exhausted ? 'bg-red-600' : barColor(pct)
        } ${dimmed ? 'opacity-60' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  )
}

function ProviderUnavailableMeter({
  providerId
}: {
  providerId: ProviderRateLimits['provider']
}): React.JSX.Element {
  // State 5 — RM's fetch succeeded overall but reported nothing for this
  // provider. Muted/low-opacity on purpose: this is routine ("RM doesn't
  // cover this provider yet"), not a fault — kept visually calm so it never
  // reads as an alarm the way state 6 does.
  const name = getProviderDisplayName(providerId)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 opacity-40"
          aria-label={translate("auto.components.status.bar.ResourceMonitorMeter.c726d58659", "{{value0}} — not tracked by Resource Monitor", { value0: name })}
        >
          <ProviderIcon provider={providerId} />
          <Ban size={9} className="text-muted-foreground" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {translate("auto.components.status.bar.ResourceMonitorMeter.c726d58659", "{{value0}} — not tracked by Resource Monitor", { value0: name })}
      </TooltipContent>
    </Tooltip>
  )
}

function UnknownProviderMeter({
  providerId
}: {
  providerId: ProviderRateLimits['provider']
}): React.JSX.Element {
  // State 3 — a record exists but we cannot vouch for it (unrecognized or
  // missing raw status, or every window was rejected upstream). No bar is
  // drawn at all: showing a number here would fabricate a value RM never
  // actually gave us a way to trust.
  const name = getProviderDisplayName(providerId)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex items-center gap-1 opacity-60"
          aria-label={translate("auto.components.status.bar.ResourceMonitorMeter.6d04b5eb91", "{{value0}} — quota status unknown", { value0: name })}
        >
          <ProviderIcon provider={providerId} />
          <HelpCircle size={9} className="text-muted-foreground" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6}>
        {translate("auto.components.status.bar.ResourceMonitorMeter.6d04b5eb91", "{{value0}} — quota status unknown", { value0: name })}
      </TooltipContent>
    </Tooltip>
  )
}

function WindowedProviderMeter({
  providerId,
  windows,
  updatedAt,
  stale
}: {
  providerId: ProviderRateLimits['provider']
  windows: ResourceMonitorWindowMeter[]
  updatedAt: number
  stale: boolean
}): React.JSX.Element {
  // States 1/2/4 — healthy/current and stale share this layout (both have
  // real windows to draw), differing only in the dimmed/hatched treatment
  // plus the clock badge. Exhausted is per-window, flagged with a triangle
  // rather than folded into the bar color alone, so "100% used" reads
  // distinctly from "80%+ used" (barColor alone would render both red).
  const name = getProviderDisplayName(providerId)
  const hasExhausted = windows.some((w) => w.exhausted)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 ${stale ? 'opacity-50' : ''}`}
          aria-label={stale ? translate("auto.components.status.bar.ResourceMonitorMeter.b026550a1a", "{{value0}} — stale quota data", { value0: name }) : translate("auto.components.status.bar.ResourceMonitorMeter.a8c866c82b", "{{value0}} — current quota data", { value0: name })}
        >
          <ProviderIcon provider={providerId} />
          {stale && <Clock size={9} className="text-amber-500" aria-hidden="true" />}
          <span className="inline-flex items-center gap-[3px]">
            {windows.map((w) => (
              <WindowMeterBar key={w.slot} window={w} dimmed={stale} />
            ))}
          </span>
          {hasExhausted && <AlertTriangle size={9} className="text-red-600" aria-label={translate("auto.components.status.bar.ResourceMonitorMeter.7edd61a756", "Exhausted")} />}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="space-y-1">
        <div className="text-xs font-medium">
          {stale ? translate("auto.components.status.bar.ResourceMonitorMeter.b026550a1a", "{{value0}} — stale quota data", { value0: name }) : translate("auto.components.status.bar.ResourceMonitorMeter.a8c866c82b", "{{value0}} — current quota data", { value0: name })}
        </div>
        <div className="space-y-0.5">
          {windows.map((w) => (
            <div key={w.slot} className="flex items-center justify-between gap-3 text-[11px]">
              <span>{windowSlotLabel(w.slot)}</span>
              <span className="inline-flex items-center gap-1">
                <span>{`${Math.round(clampUsedPercent(w.usedPercent))}%`}</span>
                {w.exhausted && <AlertTriangle size={9} className="text-red-600" aria-hidden="true" />}
              </span>
            </div>
          ))}
        </div>
        {updatedAt > 0 &&
          (stale ? (
            <div className="text-[10px] text-muted-foreground">{translate("auto.components.status.bar.ResourceMonitorMeter.5660311e0c", "Stale — last seen {{value0}}", { value0: formatTimeAgo(updatedAt) })}</div>
          ) : (
            <div className="text-[10px] text-muted-foreground">{translate("auto.components.status.bar.ResourceMonitorMeter.498d56e8ae", "Updated {{value0}}", { value0: formatTimeAgo(updatedAt) })}</div>
          ))}
      </TooltipContent>
    </Tooltip>
  )
}

function ResourceMonitorProviderRow({
  state
}: {
  state: ResourceMonitorProviderMeterState
}): React.JSX.Element | null {
  if (state.kind === 'rm-unavailable') {
    // Callers only reach here after already confirming resourceMonitor.status
    // === 'ok', so this branch is unreachable in practice; kept for
    // exhaustiveness rather than an unsafe cast.
    return null
  }
  if (state.kind === 'provider-unavailable') {
    return <ProviderUnavailableMeter providerId={state.providerId} />
  }
  if (state.kind === 'unknown') {
    return <UnknownProviderMeter providerId={state.providerId} />
  }
  return (
    <WindowedProviderMeter
      providerId={state.providerId}
      windows={state.windows}
      updatedAt={state.updatedAt}
      stale={state.kind === 'stale'}
    />
  )
}

export function ResourceMonitorMeter({
  resourceMonitor,
  providers
}: {
  resourceMonitor: ResourceMonitorObservation | null | undefined
  providers: ProviderRateLimits[]
}): React.JSX.Element | null {
  // Why gated on `resourceMonitor` being present at all (not just its
  // status): before the main process completes its first refresh cycle,
  // this field is genuinely absent — that is a transient "no data yet"
  // moment, not the RM-unavailable state, so render nothing rather than
  // flashing an alarm on every cold start.
  if (!resourceMonitor) {
    return null
  }

  if (resourceMonitor.status !== 'ok') {
    return <ResourceMonitorUnavailableBadge error={resourceMonitor.error} />
  }

  if (providers.length === 0) {
    return null
  }

  return (
    <div className="flex items-center gap-1.5" aria-label={translate("auto.components.status.bar.ResourceMonitorMeter.bacd265147", "Resource Monitor quota meter")}>
      {providers.map((p, index) => (
        <React.Fragment key={p.provider}>
          {index > 0 && <span className="h-3 w-px bg-border" aria-hidden="true" />}
          <ResourceMonitorProviderRow
            state={deriveResourceMonitorProviderState(resourceMonitor, p.provider)}
          />
        </React.Fragment>
      ))}
    </div>
  )
}
