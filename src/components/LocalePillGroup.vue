<script setup lang="ts">
import { useLocaleStore } from '@/stores/locale'
import type { Locale } from '@/services/local-data-source.types'

interface Pill {
  locale: Locale
  label: string
}

const PILLS: Pill[] = [
  { locale: 'zh-TW', label: '繁中' },
  { locale: 'zh-CN', label: '简中' },
  { locale: 'en', label: 'EN' },
  { locale: 'ja', label: 'JA' },
]

const localeStore = useLocaleStore()

function onSelect(locale: Locale) {
  if (locale === localeStore.current) return
  void localeStore.setLocale(locale)
}
</script>

<template>
  <div class="locale-pills" role="group" aria-label="Language">
    <button
      v-for="pill in PILLS"
      :key="pill.locale"
      type="button"
      class="pill"
      :class="{ active: localeStore.current === pill.locale }"
      :aria-pressed="localeStore.current === pill.locale"
      @click="onSelect(pill.locale)"
    >
      {{ pill.label }}
    </button>
  </div>
</template>

<style scoped>
.locale-pills {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 16px 10px;
  flex-wrap: wrap;
}

.pill {
  appearance: none;
  background: transparent;
  border: none;
  padding: 4px 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--app-text-muted);
  opacity: 0.55;
  font-weight: 500;
  letter-spacing: 0.3px;
  cursor: pointer;
  border-radius: 6px;
  transition: opacity 0.15s var(--ease-out-quart), color 0.15s var(--ease-out-quart), background-color 0.15s var(--ease-out-quart);
}

.pill:hover {
  opacity: 1;
  color: var(--app-text);
}

.pill.active {
  opacity: 1;
  color: var(--app-accent-light);
  font-weight: 700;
  background: var(--app-accent-glow);
}

.pill:focus-visible {
  outline: 2px solid var(--app-accent-light);
  outline-offset: 2px;
}
</style>
