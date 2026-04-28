import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeMode = 'light' | 'dark'

const KEY = 'theme-mode'

function readStoredMode(): ThemeMode | null {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
    // Legacy 'auto' values from v2.3.x — treat as "no choice yet" so we
    // fall through to the system-preference seed below.
  } catch {}
  return null
}

function seedFromSystem(): ThemeMode {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>(readStoredMode() ?? seedFromSystem())

  function setMode(m: ThemeMode) {
    mode.value = m
    try {
      localStorage.setItem(KEY, m)
    } catch {
      // private mode / quota — non-critical
    }
  }

  function toggle() {
    setMode(mode.value === 'dark' ? 'light' : 'dark')
  }

  watch(
    mode,
    (v) => {
      document.documentElement.setAttribute('data-theme', v)
    },
    { immediate: true },
  )

  return { mode, setMode, toggle }
})
