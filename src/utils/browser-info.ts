export type BrowserFamily = 'chrome' | 'safari' | 'firefox' | 'edge' | 'other'

export interface BrowserInfo {
  family: BrowserFamily
  isInAppWebview: boolean
  uaShort: string
}

export function detectBrowserFamily(ua: string): BrowserFamily {
  if (!ua) return 'other'
  if (/\bEdg\//.test(ua)) return 'edge'
  if (/\bFirefox\//.test(ua)) return 'firefox'
  if (/\bChrome\//.test(ua)) return 'chrome'
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return 'safari'
  return 'other'
}

const IN_APP_PATTERNS = [
  /FBAN\//,
  /FBAV\//,
  /Instagram/,
  /\bLine\//,
  /MicroMessenger/,
  /; wv\)/,
  /TwitterAndroid/,
]

export function isInAppWebview(ua: string): boolean {
  return IN_APP_PATTERNS.some((re) => re.test(ua))
}

export function getBrowserInfo(ua?: string): BrowserInfo {
  const effective = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '')
  return {
    family: detectBrowserFamily(effective),
    isInAppWebview: isInAppWebview(effective),
    uaShort: effective.slice(0, 100),
  }
}
