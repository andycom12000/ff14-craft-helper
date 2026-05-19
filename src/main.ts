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

app.mount('#app')

// User properties: sync once after Pinia stores hydrate.
import('@/utils/user-properties').then(({ syncFromStores }) => {
  syncFromStores()
})

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
