import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const KEY = 'theme-mode'

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'auto' || v === 'light' || v === 'dark') return v
  } catch {}
  return 'auto'
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readStoredMode())

  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(mq.matches)
  mq.addEventListener('change', (e) => {
    systemDark.value = e.matches
  })

  const resolved = computed<ResolvedTheme>(() => {
    if (mode.value === 'auto') return systemDark.value ? 'dark' : 'light'
    return mode.value
  })

  function setMode(m: ThemeMode) {
    mode.value = m
    try {
      localStorage.setItem(KEY, m)
    } catch {
      // private mode / quota — non-critical
    }
  }

  watch(
    resolved,
    (v) => {
      document.documentElement.setAttribute('data-theme', v)
    },
    { immediate: true },
  )

  return { mode, resolved, setMode }
})
