import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { ElLoading } from 'element-plus'
import App from './App.vue'
import router from './router'
import { useLocaleStore } from '@/stores/locale'
import { useThemeStore } from '@/stores/theme'
import { trackError } from '@/utils/analytics'
import { registerWebVitals } from '@/utils/web-vitals-tracking'
import { syncFromStores } from '@/utils/user-properties'

const app = createApp(App)

window.addEventListener('error', (event) => {
  trackError(event.message, {
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  })
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
  trackError(`Unhandled rejection: ${reason}`)
})

app.config.errorHandler = (err, _instance, info) => {
  const message = err instanceof Error ? err.message : String(err)
  trackError(`Vue error: ${message}`, { hook: info })
  console.error(err)
}

const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)
app.use(ElLoading)

// Eagerly initialize the locale store so `current` is populated from
// localStorage before any component renders.
useLocaleStore()

// Theme store applies data-theme on <html> via watcher; init before mount
// so the resolved value is set on the first paint (also see the inline
// guard in index.html that runs even earlier to avoid a light->dark flash).
useThemeStore()

// time_to_first_action: log the timestamp of the first user-meaningful event in a session.
const TTFA_KEY = 'ff14ch.ttfa_sent'
const AUTO_EVENTS = new Set([
  'page_view', 'session_start', 'first_visit',
  'user_engagement', 'scroll', 'web_vitals', 'exception',
])

if (typeof window !== 'undefined' && !sessionStorage.getItem(TTFA_KEY)) {
  const startedAt = performance.now()
  const originalGtag = window.gtag
  if (typeof originalGtag === 'function') {
    window.gtag = function (...args: unknown[]) {
      const [cmd, name] = args as [string, string, ...unknown[]]
      if (cmd === 'event' && name && !AUTO_EVENTS.has(name)) {
        sessionStorage.setItem(TTFA_KEY, '1')
        // Restore the original gtag so subsequent calls skip the wrapper entirely.
        window.gtag = originalGtag
        const duration = Math.round(performance.now() - startedAt)
        originalGtag('event', 'time_to_first_action', {
          duration_ms_since_load: duration,
          first_event_name: name,
        })
      }
      return originalGtag.apply(window, args)
    } as typeof window.gtag
  }
}

app.mount('#app')

// User properties: sync once after Pinia stores hydrate.
syncFromStores()

registerWebVitals()

// Canary: GitHub Pages COOP/COEP headers should keep us isolated. If they
// break, this scorecard in C section will start firing and we notice fast.
if (typeof crossOriginIsolated === 'boolean' && !crossOriginIsolated) {
  const SAB_KEY = 'ff14ch.sab_unavailable_sent'
  if (!sessionStorage.getItem(SAB_KEY)) {
    Promise.all([
      import('@/utils/analytics'),
      import('@/utils/browser-info'),
    ]).then(([{ trackEvent }, { getBrowserInfo }]) => {
      const info = getBrowserInfo()
      trackEvent('sab_unavailable', {
        browser_family: info.family,
        is_in_app_webview: info.isInAppWebview,
        ua_short: info.uaShort,
      })
      sessionStorage.setItem(SAB_KEY, '1')
    })
  }
}
