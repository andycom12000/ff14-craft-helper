type GtagParamValue = string | number | boolean | undefined
export type GtagParams = Record<string, GtagParamValue>

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

const MEASUREMENT_ID = 'G-SLTFWP4D5S'

function send(eventName: string, params?: GtagParams) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', eventName, params)
}

export function trackPageView(path: string, title?: string) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: `${window.location.origin}${window.location.pathname}#${path}`,
    send_to: MEASUREMENT_ID,
  })
}

export function trackEvent(name: string, params?: GtagParams) {
  send(name, params)
}

export function trackError(message: string, context?: GtagParams) {
  send('exception', {
    description: message,
    fatal: false,
    ...context,
  })
}
