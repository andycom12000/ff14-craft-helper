<script setup lang="ts">
import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'

const themeStore = useThemeStore()

const isDark = computed(() => themeStore.mode === 'dark')
const label = computed(() => isDark.value ? '切換為亮色' : '切換為暗色')
</script>

<template>
  <el-tooltip :content="label" placement="right" :show-after="400">
    <button
      type="button"
      class="theme-toggle"
      :aria-label="label"
      :aria-pressed="isDark"
      @click="themeStore.toggle()"
    >
      <span class="theme-toggle-icon" :class="{ 'is-dark': isDark }" aria-hidden="true">
        <!-- Sun: visible when currently dark, suggests "click to turn lights on" -->
        <svg
          class="icon icon-sun"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2.5" x2="12" y2="4.5" />
          <line x1="12" y1="19.5" x2="12" y2="21.5" />
          <line x1="4.92" y1="4.92" x2="6.34" y2="6.34" />
          <line x1="17.66" y1="17.66" x2="19.08" y2="19.08" />
          <line x1="2.5" y1="12" x2="4.5" y2="12" />
          <line x1="19.5" y1="12" x2="21.5" y2="12" />
          <line x1="4.92" y1="19.08" x2="6.34" y2="17.66" />
          <line x1="17.66" y1="6.34" x2="19.08" y2="4.92" />
        </svg>
        <!-- Moon: visible when currently light, suggests "click to turn lights off" -->
        <svg
          class="icon icon-moon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M20.5 13.5A8.5 8.5 0 1 1 10.5 3.5a6.6 6.6 0 0 0 10 10z" />
        </svg>
      </span>
    </button>
  </el-tooltip>
</template>

<style scoped>
.theme-toggle {
  appearance: none;
  background: transparent;
  border: none;
  cursor: pointer;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--app-text-muted);
  border-radius: 8px;
  flex-shrink: 0;
  transition:
    color 0.18s var(--ease-out-quart),
    background-color 0.18s var(--ease-out-quart);
}

.theme-toggle:hover {
  color: var(--app-accent-light);
  background: var(--app-surface-hover);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--app-accent-light);
  outline-offset: 2px;
}

.theme-toggle-icon {
  position: relative;
  display: inline-block;
  width: 18px;
  height: 18px;
}

.icon {
  position: absolute;
  inset: 0;
  transition:
    opacity 0.22s var(--ease-out-quart),
    transform 0.32s var(--ease-out-quart);
  transform-origin: center;
}

/* Light mode: lights are on, show moon (the action) */
.icon-moon { opacity: 1; transform: rotate(0deg) scale(1); }
.icon-sun { opacity: 0; transform: rotate(-60deg) scale(0.6); }

/* Dark mode: lights are off, show sun (the action) */
.theme-toggle-icon.is-dark .icon-moon { opacity: 0; transform: rotate(60deg) scale(0.6); }
.theme-toggle-icon.is-dark .icon-sun { opacity: 1; transform: rotate(0deg) scale(1); }

@media (prefers-reduced-motion: reduce) {
  .icon { transition: opacity 0.15s linear; transform: none !important; }
}

@media (pointer: coarse) {
  .theme-toggle {
    width: 44px;
    height: 44px;
  }
}
</style>
