import type { Session } from 'electron'

import {
  googleAuthUserAgent,
  isGoogleAuthUrl,
  setUserAgentHeader,
  stripClientHints
} from './browser-google-auth-ua'

// Why: Electron's default UA includes "Electron/X.X.X" and the app name
// (e.g. "orca/1.2.3"), which Cloudflare Turnstile and other bot detectors
// flag as non-human traffic. Strip those tokens so the webview's UA and
// sec-ch-ua Client Hints look like standard Chrome.
export function cleanElectronUserAgent(ua: string): string {
  return (
    ua
      .replace(/\s+Electron\/\S+/, '')
      // Why: \S+ matches any non-whitespace token (e.g. "orca/1.3.8-rc.0")
      // including pre-release semver strings that [\d.]+ would miss.
      .replace(/(\)\s+)\S+\s+(Chrome\/)/, '$1$2')
  )
}

// Why: Chromium majors passed 80 in 2020; Arc-style marketing versions ("1.104.0")
// fail this floor, and a UA built from one gets the browser flagged as ancient.
const MIN_PLAUSIBLE_CHROMIUM_MAJOR = 80

export function isPlausibleChromiumUaVersion(version: string): boolean {
  const major = Number(version.split('.')[0])
  return Number.isInteger(major) && major >= MIN_PLAUSIBLE_CHROMIUM_MAJOR
}

// Why: imports before STA-3514 persisted UAs built from the source browser's
// marketing version (Arc → "Chrome/1.104.0"); reapplying them at startup keeps
// sites marking the browser incompatible.
export function isImplausiblePersistedUserAgent(ua: string): boolean {
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/)
  return chromeMatch ? !isPlausibleChromiumUaVersion(chromeMatch[1]) : false
}

// Why: Electron's actual Chromium version (e.g. 134) differs from the source
// browser's version (e.g. Edge 147). The sec-ch-ua Client Hints headers
// reveal the real version, creating a mismatch that Google's anti-fraud
// detection flags as CookieMismatch on accounts.google.com. Override Client
// Hints on outgoing requests to match the source browser's UA.
export function setupClientHintsOverride(
  sess: Session,
  ua: string,
  options: { googleAuthOverride?: boolean } = {}
): void {
  // Why: only Chrome-shaped base UAs carry sec-ch-ua hints to rewrite, but the
  // Google-auth Firefox switch below must install regardless, so keep the hints
  // optional rather than bailing out of the whole handler.
  const chromeHints = buildChromeClientHints(ua)
  const firefoxUa = googleAuthUserAgent()

  sess.webRequest.onBeforeSendHeaders({ urls: ['https://*/*'] }, (details, callback) => {
    const headers = details.requestHeaders
    if (options.googleAuthOverride !== false && isGoogleAuthUrl(details.url)) {
      // Why: present a Firefox identity on Google's sign-in hosts so the user logs
      // in inside the app and Google issues self-refreshing bound cookies. Strip
      // sec-ch-ua* because real Firefox sends none.
      setUserAgentHeader(headers, firefoxUa)
      stripClientHints(headers)
      callback({ requestHeaders: headers })
      return
    }
    if (chromeHints) {
      for (const key of Object.keys(headers)) {
        const lower = key.toLowerCase()
        if (lower === 'sec-ch-ua') {
          headers[key] = chromeHints.secChUa
        } else if (lower === 'sec-ch-ua-full-version-list') {
          headers[key] = chromeHints.secChUaFull
        }
      }
    }
    callback({ requestHeaders: headers })
  })
}

function buildChromeClientHints(ua: string): { secChUa: string; secChUaFull: string } | null {
  const chromeMatch = ua.match(/Chrome\/([\d.]+)/)
  if (!chromeMatch) {
    return null
  }
  const fullChromeVersion = chromeMatch[1]
  const majorVersion = fullChromeVersion.split('.')[0]

  let brand = 'Google Chrome'
  let brandFullVersion = fullChromeVersion

  const edgeMatch = ua.match(/Edg\/([\d.]+)/)
  if (edgeMatch) {
    brand = 'Microsoft Edge'
    brandFullVersion = edgeMatch[1]
  }
  const brandMajor = brandFullVersion.split('.')[0]

  return {
    secChUa: `"${brand}";v="${brandMajor}", "Chromium";v="${majorVersion}", "Not/A)Brand";v="24"`,
    secChUaFull: `"${brand}";v="${brandFullVersion}", "Chromium";v="${fullChromeVersion}", "Not/A)Brand";v="24.0.0.0"`
  }
}
