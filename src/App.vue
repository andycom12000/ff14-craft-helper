<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  Setting,
  Cpu,
  List,
  TrendCharts,
  Suitcase,
  Operation,
  Close,
  Document,
  AlarmClock,
  HomeFilled,
} from '@element-plus/icons-vue'
import EorzeaClock from '@/components/EorzeaClock.vue'
import LocalePillGroup from '@/components/LocalePillGroup.vue'
import CommandPalette from '@/components/CommandPalette.vue'

const route = useRoute()
const sidebarOpen = ref(false)

const pageTitle = computed(() => (route.meta?.title as string) ?? '吐司工坊')

const PAGE_ACCENTS: Record<string, { color: string; dim: string }> = {
  '/gearset': { color: 'var(--app-craft)', dim: 'var(--app-craft-dim)' },
  '/simulator': { color: 'var(--app-craft)', dim: 'var(--app-craft-dim)' },
  '/bom': { color: 'var(--app-craft)', dim: 'var(--app-craft-dim)' },
  '/batch': { color: 'var(--app-craft)', dim: 'var(--app-craft-dim)' },
  '/market': { color: 'var(--app-market)', dim: 'var(--app-market-dim)' },
  '/timer': { color: 'var(--app-gather)', dim: 'var(--app-gather-dim)' },
}

const activeAccent = computed(() => PAGE_ACCENTS[route.path])

const sidebarActiveStyle = computed(() => {
  const a = activeAccent.value
  if (!a) return {}
  return {
    '--sidebar-active-color': a.color,
    '--sidebar-active-dim': a.dim,
  } as Record<string, string>
})

watch(() => route.path, () => {
  sidebarOpen.value = false
})

watch(sidebarOpen, (open) => {
  if (typeof document === 'undefined') return
  document.body.style.overflow = open ? 'hidden' : ''
})

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <el-container class="app-container">
    <div
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      @click="sidebarOpen = false"
    />
    <el-aside width="220px" class="app-aside" :class="{ open: sidebarOpen }" :style="sidebarActiveStyle">
      <div class="app-logo">
        <span class="logo-ff">吐司工坊</span>
        <span class="logo-sub">FFXIV 製作助手</span>
        <button class="sidebar-close-btn" @click="sidebarOpen = false">
          <el-icon :size="20"><Close /></el-icon>
        </button>
      </div>
      <el-menu
        :default-active="route.path"
        router
        class="app-menu"
      >
        <el-menu-item index="/">
          <el-icon><HomeFilled /></el-icon>
          <span>首頁</span>
        </el-menu-item>
        <el-menu-item index="/gearset">
          <el-icon><Suitcase /></el-icon>
          <span>配裝管理</span>
        </el-menu-item>
        <el-menu-item index="/simulator">
          <el-icon><Cpu /></el-icon>
          <span>製作模擬</span>
        </el-menu-item>
        <el-menu-item index="/batch">
          <el-icon><Operation /></el-icon>
          <span>批量製作</span>
        </el-menu-item>
        <el-menu-item index="/bom">
          <el-icon><List /></el-icon>
          <span>購物清單</span>
        </el-menu-item>
        <el-menu-item index="/market" disabled>
          <el-icon><TrendCharts /></el-icon>
          <span>市場查價</span>
          <span class="menu-badge">開發中</span>
        </el-menu-item>
        <el-menu-item index="/timer">
          <el-icon><AlarmClock /></el-icon>
          <span>採集計時器</span>
        </el-menu-item>
        <el-divider class="menu-divider" />
        <el-menu-item index="/changelog">
          <el-icon><Document /></el-icon>
          <span>更新日誌</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>設定</span>
        </el-menu-item>
      </el-menu>
      <div class="sidebar-footer">
        <LocalePillGroup />
        <EorzeaClock />
      </div>
    </el-aside>
    <el-main class="app-main">
      <header class="mobile-app-bar">
        <button class="bar-menu" aria-label="開啟選單" @click="sidebarOpen = true">
          <el-icon :size="22"><Operation /></el-icon>
        </button>
        <h1 class="bar-title">{{ pageTitle }}</h1>
        <div id="mobile-bar-actions" class="bar-actions" />
      </header>
      <router-view />
    </el-main>
    <CommandPalette />
  </el-container>
</template>

<style>
:root {
  /* === 吐司工坊 Light Theme — see docs/superpowers/specs/2026-04-26-toast-workshop-rebrand-design.md === */

  /* Surfaces */
  --app-bg: oklch(0.965 0.022 90);
  --app-sidebar: oklch(0.93 0.025 80);
  --app-surface: oklch(0.99 0.01 90);
  --app-surface-2: oklch(0.93 0.04 80);
  --app-surface-hover: oklch(0.94 0.025 85);
  --app-border: oklch(0.65 0.04 65 / 0.30);

  /* Text */
  --app-text: oklch(0.28 0.04 55);
  --app-text-muted: oklch(0.50 0.03 60);

  /* Brand — 吐司金 */
  --app-accent: oklch(0.65 0.18 65);
  --app-accent-light: oklch(0.78 0.15 75);
  --app-accent-glow: oklch(0.65 0.18 65 / 0.18);

  /* Semantic — success */
  --app-success: oklch(0.55 0.16 145);
  --app-success-tint: oklch(0.55 0.16 145 / 0.10);
  --app-success-tint-strong: oklch(0.55 0.16 145 / 0.18);
  --app-success-border: oklch(0.55 0.16 145 / 0.35);

  /* Craft condition orbs (good / normal / poor) */
  --state-normal: oklch(0.55 0.02 65);
  --state-good: oklch(0.62 0.18 60);
  --state-poor: oklch(0.55 0.20 15);

  /* Functional areas (果醬罐排隊) */
  --app-craft: oklch(0.50 0.16 40);
  --app-craft-dim: oklch(0.50 0.16 40 / 0.10);
  --app-market: oklch(0.58 0.20 15);
  --app-market-dim: oklch(0.58 0.20 15 / 0.10);
  --app-gather: oklch(0.62 0.17 135);
  --app-gather-dim: oklch(0.62 0.17 135 / 0.10);
  --app-highlight: oklch(0.50 0.13 70);

  /* Semantic accents — shared across features */
  --accent-gold: oklch(0.78 0.13 75);
  --accent-gold-dim: oklch(0.78 0.13 75 / 0.16);
  --buff-info: oklch(0.50 0.13 70);
  --buff-info-bg: oklch(0.50 0.13 70 / 0.08);
  --buff-info-border: oklch(0.50 0.13 70 / 0.20);

  /* FFXIV crystal element palette (light-tuned) */
  --element-fire: oklch(0.55 0.20 25);
  --element-ice: oklch(0.55 0.18 290);
  --element-wind: oklch(0.50 0.18 145);
  --element-earth: oklch(0.55 0.16 340);
  --element-lightning: oklch(0.62 0.18 80);
  --element-water: oklch(0.50 0.18 240);
  --element-default: oklch(0.50 0.03 60);

  /* Page accent — overridden per view */
  --page-accent: var(--app-accent);
  --page-accent-dim: var(--app-accent-glow);

  /* Easing */
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);

  /* Spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Touch & responsive tokens (breakpoints: sm=640, md=768, lg=1024, xl=1440) */
  --touch-target-min: 44px;
  --section-padding-mobile: 12px;
  --section-padding-desktop: 24px;

  /* Mobile app bar height — used for sticky-toolbar offsets & scroll-margin */
  --mobile-app-bar-h: 52px;
}

:root {
  /* Element Plus token override — Light theme + 吐司金 primary
   * Must use :root (not html) — EP's defaults live at :root, and :root
   * has higher specificity than html, so html-scoped overrides lose. */
  --el-color-primary: oklch(0.65 0.18 65);
  --el-color-primary-light-3: oklch(0.72 0.16 70);
  --el-color-primary-light-5: oklch(0.78 0.15 75);
  --el-color-primary-light-7: oklch(0.85 0.13 75);
  --el-color-primary-light-8: oklch(0.92 0.10 78);
  --el-color-primary-light-9: oklch(0.96 0.06 80);
  --el-color-primary-dark-2: oklch(0.55 0.18 60);

  /* Semantic colors aligned with bakery palette */
  --el-color-success: oklch(0.55 0.16 145);
  --el-color-warning: oklch(0.65 0.18 65);
  --el-color-danger: oklch(0.55 0.20 25);
  --el-color-error: oklch(0.55 0.20 25);
  --el-color-info: oklch(0.55 0.04 65);

  --el-bg-color: var(--app-bg);
  --el-bg-color-page: var(--app-bg);
  --el-bg-color-overlay: var(--app-surface);

  --el-fill-color: var(--app-surface-hover);
  --el-fill-color-light: var(--app-surface);
  --el-fill-color-lighter: oklch(0.96 0.018 85);
  --el-fill-color-dark: oklch(0.85 0.04 75);
  --el-fill-color-darker: oklch(0.78 0.05 70);
  --el-fill-color-blank: var(--app-bg);

  --el-border-color: oklch(0.65 0.04 65 / 0.35);
  --el-border-color-light: oklch(0.70 0.04 65 / 0.25);
  --el-border-color-lighter: oklch(0.75 0.04 65 / 0.15);
  --el-border-color-dark: oklch(0.55 0.05 65 / 0.45);

  --el-text-color-primary: var(--app-text);
  --el-text-color-regular: oklch(0.35 0.04 55);
  --el-text-color-secondary: var(--app-text-muted);
  --el-text-color-placeholder: oklch(0.65 0.03 60);

  --el-mask-color: oklch(0.95 0.02 85 / 0.8);
}

html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Noto Sans TC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background-color: var(--app-bg);
  color: var(--app-text);
}

#app {
  height: 100%;
}

/* Element Plus dark overrides */
.el-card {
  --el-card-bg-color: var(--app-surface);
  border-color: var(--app-border);
}

.el-card__header {
  border-bottom-color: var(--app-border);
}

.el-table {
  --el-table-bg-color: var(--app-surface);
  --el-table-tr-bg-color: var(--app-surface);
  --el-table-header-bg-color: var(--el-fill-color-lighter);
  --el-table-row-hover-bg-color: var(--app-surface-hover);
  --el-table-border-color: var(--app-border);
  --el-table-text-color: var(--app-text);
  --el-table-header-text-color: var(--app-text-muted);
}

.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell {
  background-color: oklch(0.50 0.04 60 / 0.05);
}

.el-descriptions {
  --el-descriptions-item-bordered-label-background: var(--el-fill-color-lighter);
}

.el-tabs--border-card {
  --el-bg-color-overlay: var(--app-surface);
  border-color: var(--app-border);
}

.el-input__wrapper,
.el-input-number {
  --el-input-bg-color: var(--el-fill-color-lighter);
  --el-input-border-color: var(--app-border);
}

.el-input__wrapper:hover,
.el-input__wrapper:focus-within {
  --el-input-hover-border-color: var(--app-accent-light);
}

.el-collapse {
  --el-collapse-border-color: var(--app-border);
  --el-collapse-header-bg-color: var(--app-surface);
  --el-collapse-content-bg-color: var(--app-surface);
}

.el-skeleton__item {
  background: linear-gradient(90deg, var(--el-fill-color-lighter) 25%, var(--el-fill-color-dark) 37%, var(--el-fill-color-lighter) 63%);
}

.el-divider {
  border-color: var(--app-border);
}

.el-alert {
  --el-alert-bg-color: var(--app-surface);
}

.el-select__wrapper {
  background-color: var(--el-fill-color-lighter);
}

/* Global scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--app-bg);
}

::-webkit-scrollbar-thumb {
  background: var(--el-border-color-dark);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--app-accent-light);
}

/* View container shared style */
.view-container,
.bom-view,
.market-view,
.settings-view {
  padding: 28px 32px;
}

.view-container h2,
.bom-view h2,
.market-view h2,
.settings-view h2 {
  margin-top: 0;
  margin-bottom: 8px;
  font-size: clamp(18px, 4.5vw, 22px);
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--app-text);
  padding-left: 14px;
  border-left: 3px solid var(--page-accent);
}

.view-desc {
  color: var(--app-text-muted);
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .view-container,
  .bom-view,
  .market-view,
  .settings-view {
    padding: 16px 16px 16px;
  }

  /* Mobile app bar shows the page title already — hide the in-view h2
   * to avoid duplicate titles. View-specific subtitles/hints remain. */
  .view-container > h2,
  .bom-view > h2,
  .market-view > h2,
  .settings-view > h2 {
    display: none;
  }

  @media (max-width: 640px) {
    .view-container,
    .bom-view,
    .market-view,
    .settings-view {
      padding: 12px 12px 12px;
    }
  }

  /* Larger touch targets for input-number +/- buttons (WCAG 2.5.5: 44x44px).
   * Also grow the input body so its height matches the controls — otherwise
   * the +/- buttons visually float above a shorter input field. */
  .el-input-number .el-input-number__decrease,
  .el-input-number .el-input-number__increase {
    min-width: 44px;
    min-height: 44px;
    font-size: 16px;
  }

  /* Unified mobile stepper aesthetic — every +/- button across the app
   * adopts the BomTargetList style: transparent buttons, placeholder color,
   * accent on hover. Components that want chrome must override locally. */
  .el-input-number .el-input-number__decrease,
  .el-input-number .el-input-number__increase {
    background: transparent;
    border-color: transparent;
    color: var(--el-text-color-placeholder);
    transition: color 0.15s, background-color 0.15s;
  }
  .el-input-number .el-input-number__decrease:hover:not(.is-disabled),
  .el-input-number .el-input-number__increase:hover:not(.is-disabled) {
    background: var(--el-fill-color-light);
    color: var(--page-accent, var(--el-color-primary));
  }
  .el-input-number .el-input-number__decrease.is-disabled,
  .el-input-number .el-input-number__increase.is-disabled {
    color: var(--el-text-color-disabled);
  }
  .el-input-number .el-input__wrapper {
    box-shadow: none;
    background: transparent;
  }
  .el-input-number .el-input__inner {
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  .el-input-number.el-input-number--small {
    line-height: 42px;
    width: auto;
  }

  .el-input-number.el-input-number--small .el-input__wrapper {
    min-height: 44px;
    padding-left: 48px;
    padding-right: 48px;
  }

  .el-input-number.el-input-number--small .el-input__inner {
    height: 42px;
    line-height: 42px;
  }

  /* Prevent iOS Safari from auto-zooming text inputs (requires ≥16px) */
  .el-input__inner,
  .el-textarea__inner,
  input[type="text"],
  input[type="search"],
  input[type="number"],
  textarea {
    font-size: 16px;
  }

  /* Larger touch targets for primary buttons (WCAG 2.5.5) */
  .el-button {
    min-height: 44px;
    padding-left: 16px;
    padding-right: 16px;
  }

  /* Small-size buttons still need a reasonable target on touch */
  .el-button--small {
    min-height: 36px;
  }

  /* Reusable sticky secondary toolbar for mobile views.
   * Sits right below the global .mobile-app-bar. Views opt-in by adding
   * this class to their primary header/filter row. The view's horizontal
   * padding is bled out via negative margin so the toolbar reaches the
   * screen edge while content keeps its inner padding. */
  .mobile-sticky-toolbar {
    position: sticky;
    top: var(--mobile-app-bar-h);
    z-index: 10;
    margin-left: -16px;
    margin-right: -16px;
    padding-left: 16px;
    padding-right: 16px;
    background: color-mix(in srgb, var(--app-bg) 88%, transparent);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--app-border);
  }

  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .mobile-sticky-toolbar {
      background: var(--app-bg);
    }
  }

  @media (max-width: 640px) {
    .mobile-sticky-toolbar {
      margin-left: -12px;
      margin-right: -12px;
      padding-left: 12px;
      padding-right: 12px;
    }
  }
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
}

/* Unified section title for sub-headings within cards */
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin: var(--space-md) 0 var(--space-sm);
}

.section-title:first-child {
  margin-top: 0;
}

/* Unified code block for macro/snippet display */
.code-block {
  margin: 0;
  padding: 12px;
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s;
}

@media (max-width: 480px) {
  .code-block {
    font-size: 12px;
    padding: 10px;
    line-height: 1.5;
  }
}

.code-block:hover {
  background: var(--el-fill-color);
}

/* --- Micro-interactions --- */

/* Primary buttons: hover lift + active press */
.el-button--primary {
  transition: transform 0.15s var(--ease-out-quart), box-shadow 0.15s var(--ease-out-quart);
}
.el-button--primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 8px oklch(0.65 0.18 65 / 0.30);
}
.el-button--primary:active {
  transform: translateY(0) scale(0.97);
  box-shadow: none;
}

/* Input focus glow */
.el-input__wrapper:focus-within {
  box-shadow: 0 0 0 2px var(--page-accent-dim, oklch(0.65 0.18 65 / 0.20)) !important;
}

/* El-card hover lift */
.el-card[shadow="never"] {
  transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}
.el-card[shadow="never"]:hover {
  border-color: oklch(0.65 0.04 65 / 0.40);
  box-shadow: 0 4px 12px oklch(0.40 0.05 60 / 0.08);
}

/*
 * Max-width conventions:
 *   720px  — forms/settings (SettingsView, ChangelogView)
 *   960px  — single-column data views (BomView, MarketView)
 *   full   — complex multi-column layouts (BatchView, SimulatorView, RecipeView, GearsetView)
 */

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>

<style scoped>
.app-container {
  height: 100vh;
}

.app-aside {
  background-color: var(--app-sidebar);
  border-right: 1px solid var(--app-border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.app-logo {
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid var(--app-border);
  gap: 2px;
}

.logo-ff {
  font-family: 'Noto Serif TC', serif;
  font-size: 19px;
  font-weight: 900;
  color: var(--app-text);
  letter-spacing: 1px;
}

.logo-sub {
  font-size: 10px;
  font-weight: 700;
  color: oklch(0.42 0.05 55);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.app-menu {
  border-right: none;
  background-color: transparent;
  padding: 8px 0;
  flex: 1;
}

.app-menu .el-menu-item {
  color: oklch(0.38 0.04 55);
  font-weight: 600;
  margin: 2px 8px;
  border-radius: 8px;
  height: 44px;
  line-height: 44px;
  font-size: 14px;
  transition: color 0.2s var(--ease-out-quart), background-color 0.25s var(--ease-out-quart);
}

.app-menu .el-menu-item:hover {
  color: var(--app-text);
  background-color: oklch(0.65 0.18 65 / 0.10);
}

.app-menu .el-menu-item.is-active {
  background: var(--sidebar-active-dim, var(--app-accent-glow));
  color: var(--sidebar-active-color, var(--app-accent));
  font-weight: 700;
}

.menu-divider {
  margin: 8px 16px;
  border-color: var(--app-border);
}

.sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
}

.sidebar-footer :deep(.eorzea-clock) {
  margin-top: 0;
}

.menu-badge {
  margin-left: auto;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--app-text-muted);
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--app-border);
  border-radius: 999px;
  letter-spacing: 0.5px;
}

.app-main {
  background:
    radial-gradient(
      ellipse 75% 90% at top center,
      var(--app-bg) 0%,
      oklch(0.92 0.028 75) 100%
    );
  overflow-y: auto;
}

.sidebar-close-btn {
  display: none;
}

.mobile-app-bar {
  display: none;
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .app-aside {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 2000;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
  }

  .app-aside.open {
    transform: translateX(0);
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 1999;
    background: rgba(0, 0, 0, 0.5);
  }

  .sidebar-close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    background: none;
    border: none;
    color: var(--app-text-muted);
    cursor: pointer;
    padding: 0;
    border-radius: 8px;
  }

  .sidebar-close-btn:focus-visible {
    outline: 2px solid var(--app-accent-light);
    outline-offset: -2px;
  }

  .app-logo {
    position: relative;
  }

  /* On mobile, strip el-main's default padding so the sticky bar can be full-width.
   * view-container / bom-view / etc. provide their own inner padding. */
  .app-main {
    padding: 0;
  }

  .mobile-app-bar {
    display: flex;
    align-items: center;
    gap: 10px;
    position: sticky;
    top: 0;
    z-index: 100;
    height: var(--mobile-app-bar-h);
    padding: 0 12px;
    background: color-mix(in srgb, var(--app-bg) 82%, transparent);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--app-border);
  }

  /* iOS Safari fallback: solid bg if backdrop-filter unsupported */
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .mobile-app-bar {
      background: var(--app-bg);
    }
  }

  .bar-menu {
    width: 40px;
    height: 40px;
    border: 0;
    background: transparent;
    color: var(--app-text);
    border-radius: 10px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background-color 0.15s var(--ease-out-quart);
  }

  .bar-menu:hover {
    background: color-mix(in srgb, var(--app-text) 6%, transparent);
  }

  .bar-menu:focus-visible {
    outline: 2px solid var(--app-accent-light);
    outline-offset: -2px;
  }

  .bar-title {
    flex: 1;
    margin: 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: var(--app-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .bar-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
}
</style>
