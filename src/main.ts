import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { ElLoading } from 'element-plus'
import App from './App.vue'
import router from './router'
import { useLocaleStore } from '@/stores/locale'
import { useThemeStore } from '@/stores/theme'

const app = createApp(App)

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
