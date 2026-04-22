import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Locale } from '@/services/local-data-source.types'
import { LOCALES, DEFAULT_LOCALE } from '@/services/local-data-source.types'
import * as localDataSource from '@/services/local-data-source'

const STORAGE_KEY = 'ffxiv-craft-helper:locale'

function readInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LOCALES as readonly string[]).includes(stored)) {
      return stored as Locale
    }
  } catch {
    // ignore localStorage errors (e.g. SSR / blocked)
  }
  return DEFAULT_LOCALE
}

export const useLocaleStore = defineStore('locale', () => {
  const current = ref<Locale>(readInitialLocale())

  async function setLocale(locale: Locale): Promise<void> {
    if (!(LOCALES as readonly string[]).includes(locale)) return
    current.value = locale
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      // ignore
    }
    await localDataSource.setLocale(locale)
  }

  return { current, setLocale }
})
