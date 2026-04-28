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
import ThemeToggle from '@/components/ThemeToggle.vue'
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
        <svg class="logo-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
          <path
            d="M 12 54 L 12 24 Q 12 8 32 8 Q 52 8 52 24 L 52 54 Q 52 56 50 56 L 14 56 Q 12 56 12 54 Z"
            fill="url(#sidebarToast)"
            stroke="#824020"
            stroke-width="2.5"
            stroke-linejoin="round"
          />
          <path
            d="M 18 22 Q 32 12 46 22"
            fill="none"
            stroke="#FFFFFF"
            stroke-opacity="0.4"
            stroke-width="2.2"
            stroke-linecap="round"
          />
          <line x1="22" y1="34" x2="42" y2="34"
                stroke="#824020" stroke-opacity="0.55"
                stroke-width="2" stroke-linecap="round" />
          <line x1="22" y1="44" x2="42" y2="44"
                stroke="#824020" stroke-opacity="0.55"
                stroke-width="2" stroke-linecap="round" />
          <defs>
            <linearGradient id="sidebarToast" x1="32" y1="8" x2="32" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#D8AF66" />
              <stop offset="100%" stop-color="#B07A33" />
            </linearGradient>
          </defs>
        </svg>
        <div class="logo-text">
          <span class="logo-ff">吐司工坊</span>
          <span class="logo-sub">FFXIV 製作助手</span>
        </div>
        <div class="logo-theme-slot">
          <ThemeToggle />
        </div>
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
        <el-menu-item index="/batch">
          <el-icon><Operation /></el-icon>
          <span>批量製作</span>
        </el-menu-item>
        <el-menu-item index="/simulator">
          <el-icon><Cpu /></el-icon>
          <span>製作模擬</span>
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
  --app-surface: oklch(0.975 0.018 85);
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

  /* Toast crust — Dashboard hero edge color (#B47351) */
  --toast-crust: oklch(0.59 0.10 50);
  --toast-crust-soft: oklch(0.59 0.10 50 / 0.35);
  --toast-crust-glow: oklch(0.97 0.04 82 / 0.42);

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

  /* Subtle paper-noise background for hero / onboarding / empty regions —
   * radial dot pattern at low opacity, evokes a faint paper grain. */
  --paper-noise:
    radial-gradient(circle at 20% 30%, oklch(0.55 0.10 60 / 0.06) 1px, transparent 1.5px),
    radial-gradient(circle at 70% 60%, oklch(0.55 0.10 55 / 0.05) 1px, transparent 1.5px);
  --paper-noise-size: 28px 28px, 22px 22px;

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

:root[data-theme="dark"] {
  /* === 吐司工坊 Dark Theme — see docs/superpowers/specs/2026-04-26-dark-mode-design.md ===
   * Scene: 凌晨 2 點，FFXIV 玩家規劃 macro，房內只剩螢幕與一盞檯燈。
   * 中性暖灰 body，sidebar 仍走暖棕（局部 override，下方 .app-aside 區塊）。 */

  /* Surfaces */
  --app-bg: oklch(0.18 0.008 60);
  --app-sidebar: oklch(0.15 0.006 60);
  --app-surface: oklch(0.22 0.008 60);
  --app-surface-2: oklch(0.25 0.012 60);
  --app-surface-hover: oklch(0.26 0.010 60);
  --app-border: oklch(0.30 0.010 60);

  /* Text */
  --app-text: oklch(0.94 0.010 80);
  --app-text-muted: oklch(0.66 0.010 70);

  /* Brand — 吐司金（dark 版本提亮、稍降飽和） */
  --app-accent: oklch(0.74 0.15 68);
  --app-accent-light: oklch(0.82 0.12 72);
  --app-accent-glow: oklch(0.74 0.15 68 / 0.16);

  /* Toast crust — dark：提亮 lightness 維持與背景對比 */
  --toast-crust: oklch(0.70 0.10 52);
  --toast-crust-soft: oklch(0.70 0.10 52 / 0.35);
  --toast-crust-glow: oklch(0.70 0.10 52 / 0.18);

  /* Semantic — success */
  --app-success: oklch(0.68 0.16 145);
  --app-success-tint: oklch(0.68 0.16 145 / 0.16);
  --app-success-tint-strong: oklch(0.68 0.16 145 / 0.24);
  --app-success-border: oklch(0.68 0.16 145 / 0.40);

  /* Craft condition orbs */
  --state-normal: oklch(0.65 0.02 65);
  --state-good: oklch(0.74 0.16 65);
  --state-poor: oklch(0.68 0.18 18);

  /* Functional areas (dark: 飽和度收斂避免刺眼) */
  --app-craft: oklch(0.70 0.04 60);
  --app-craft-dim: oklch(0.70 0.04 60 / 0.18);
  --app-market: oklch(0.70 0.05 20);
  --app-market-dim: oklch(0.70 0.05 20 / 0.18);
  --app-gather: oklch(0.70 0.04 130);
  --app-gather-dim: oklch(0.70 0.04 130 / 0.18);
  --app-highlight: oklch(0.70 0.10 70);

  /* Semantic accents */
  --accent-gold: oklch(0.82 0.12 75);
  --accent-gold-dim: oklch(0.82 0.12 75 / 0.18);
  --buff-info: oklch(0.70 0.10 70);
  --buff-info-bg: oklch(0.70 0.10 70 / 0.10);
  --buff-info-border: oklch(0.70 0.10 70 / 0.28);

  /* FFXIV element palette (dark-tuned: lift L, slightly trim C) */
  --element-fire: oklch(0.70 0.18 25);
  --element-ice: oklch(0.72 0.16 290);
  --element-wind: oklch(0.68 0.16 145);
  --element-earth: oklch(0.70 0.14 340);
  --element-lightning: oklch(0.78 0.16 80);
  --element-water: oklch(0.68 0.16 240);
  --element-default: oklch(0.65 0.02 60);

  /* Paper noise — dark 不用紙感，避免雜訊堆疊 */
  --paper-noise: none;
  --paper-noise-size: 0;
}

/* Sidebar 局部 override：dark mode 下保留 light theme 的暖棕 sidebar 作為品牌記號 */
:root[data-theme="dark"] .app-aside {
  --app-sidebar: oklch(0.17 0.020 60);
  --app-border: oklch(0.32 0.025 65);
  --app-text: oklch(0.92 0.020 80);
  --app-text-muted: oklch(0.68 0.020 70);
  --app-accent: oklch(0.72 0.14 70);
  --app-accent-glow: oklch(0.72 0.14 70 / 0.18);
}

/* Sidebar inner text — light-mode CSS hard-codes oklch(0.38-0.42 …) which is
 * almost invisible on the dark warm-brown sidebar bg. Lift to dark-tuned
 * values that match the local --app-text/-muted tokens above. */
:root[data-theme="dark"] .app-aside .logo-sub {
  color: oklch(0.78 0.030 70);
}
:root[data-theme="dark"] .app-aside .app-menu .el-menu-item {
  color: oklch(0.78 0.020 75);
}
:root[data-theme="dark"] .app-aside .app-menu .el-menu-item:hover {
  color: oklch(0.94 0.020 80);
  background-color: var(--app-accent-soft, oklch(0.72 0.14 70 / 0.12));
}

/* Dashboard batch-hero：dark 下用暖棕 surface flat（取代 light 的徑向漸層） */
:root[data-theme="dark"] .batch-hero {
  background: oklch(0.24 0.025 70);
}

/* Recipe card：dark 下走冷灰 135° 漸層，跟 hero 形成冷暖對比 */
:root[data-theme="dark"] .recipe-card {
  background: linear-gradient(135deg, oklch(0.24 0.012 60) 0%, oklch(0.20 0.008 60) 100%);
}

/* main-pane：dark 下 kill 掉 light 的徑向漸層，改成略亮 flat */
:root[data-theme="dark"] .app-main {
  background: oklch(0.19 0.012 62);
}

/* el-empty illustration: EP 把預設圖片 base64 進 <img> src，CSS 變數覆蓋
 * 進不去 — 用 filter 直接降亮度避免在 dark 上像紙張燈箱。 */
:root[data-theme="dark"] .el-empty .el-empty__image,
:root[data-theme="dark"] .el-empty .el-empty__image img,
:root[data-theme="dark"] .el-empty .el-empty__image svg {
  filter: brightness(0.55) contrast(1.05);
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

  /* Semantic colors aligned with bakery palette
   * warning ≠ primary so warning alerts and warning buttons stay
   * visually distinct from segmented-active and CTA elements. */
  --el-color-success: oklch(0.55 0.16 145);
  --el-color-warning: oklch(0.58 0.17 45);
  --el-color-danger: oklch(0.55 0.20 25);
  --el-color-error: oklch(0.55 0.20 25);
  --el-color-info: oklch(0.55 0.04 65);

  --el-bg-color: var(--app-bg);
  --el-bg-color-page: var(--app-bg);
  --el-bg-color-overlay: var(--app-surface);

  /* Fill hierarchy — all light, subtle progression
   * lightest → darkest: blank > lighter > light > (default) > dark > darker
   * Light-theme tokens stay in oklch(0.90-0.99) range; never go dark gray. */
  --el-fill-color-blank: oklch(0.99 0.01 90);
  --el-fill-color-lighter: oklch(0.975 0.014 85);
  --el-fill-color-light: oklch(0.96 0.018 80);
  --el-fill-color: oklch(0.94 0.022 78);
  --el-fill-color-dark: oklch(0.92 0.028 75);
  --el-fill-color-darker: oklch(0.90 0.032 72);

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

:root[data-theme="dark"] {
  /* Element Plus token override — Dark theme + 吐司金 primary
   * Mirrors the light EP block above; only values change. */

  /* Primary 階梯：dark 把 light 階梯整體上推 +0.09 lightness、降一點 chroma */
  --el-color-primary: oklch(0.74 0.15 68);
  --el-color-primary-light-3: oklch(0.78 0.13 70);
  --el-color-primary-light-5: oklch(0.62 0.14 65);
  --el-color-primary-light-7: oklch(0.50 0.13 60);
  --el-color-primary-light-8: oklch(0.40 0.10 60);
  --el-color-primary-light-9: oklch(0.30 0.06 60);
  --el-color-primary-dark-2: oklch(0.85 0.10 75);

  /* Semantic — 提亮 lightness 至 0.65-0.70 維持 dark 上的對比 */
  --el-color-success: oklch(0.68 0.16 145);
  --el-color-warning: oklch(0.72 0.16 50);
  --el-color-danger: oklch(0.68 0.18 25);
  --el-color-error: oklch(0.68 0.18 25);
  --el-color-info: oklch(0.70 0.04 65);

  /* Semantic light-N variants — EP doesn't auto-derive from the base; in
   * dark we invert so light-9 is the deepest tint (closest to bg) and
   * light-3 the boldest. Used by alert / tag / bg fills. */
  --el-color-success-light-3: oklch(0.55 0.14 145);
  --el-color-success-light-5: oklch(0.42 0.10 145);
  --el-color-success-light-7: oklch(0.32 0.07 145);
  --el-color-success-light-8: oklch(0.26 0.05 145);
  --el-color-success-light-9: oklch(0.22 0.04 145);

  --el-color-warning-light-3: oklch(0.60 0.14 50);
  --el-color-warning-light-5: oklch(0.45 0.10 50);
  --el-color-warning-light-7: oklch(0.34 0.07 50);
  --el-color-warning-light-8: oklch(0.27 0.05 50);
  --el-color-warning-light-9: oklch(0.22 0.04 50);

  --el-color-danger-light-3: oklch(0.55 0.16 25);
  --el-color-danger-light-5: oklch(0.42 0.12 25);
  --el-color-danger-light-7: oklch(0.32 0.08 25);
  --el-color-danger-light-8: oklch(0.26 0.06 25);
  --el-color-danger-light-9: oklch(0.22 0.04 25);

  --el-color-info-light-3: oklch(0.55 0.04 65);
  --el-color-info-light-5: oklch(0.42 0.03 65);
  --el-color-info-light-7: oklch(0.32 0.02 65);
  --el-color-info-light-8: oklch(0.26 0.012 65);
  --el-color-info-light-9: oklch(0.22 0.008 65);

  /* Fill hierarchy — dark 反向：blank=最亮 surface，darker=最深 */
  --el-fill-color-blank: oklch(0.26 0.012 60);
  --el-fill-color-lighter: oklch(0.24 0.010 60);
  --el-fill-color-light: oklch(0.22 0.008 60);
  --el-fill-color: oklch(0.20 0.008 60);
  --el-fill-color-dark: oklch(0.18 0.008 60);
  --el-fill-color-darker: oklch(0.16 0.006 60);

  /* Borders — dark 用實色，避免 alpha 邊框在深底上消失 */
  --el-border-color: oklch(0.34 0.012 60);
  --el-border-color-light: oklch(0.30 0.010 60);
  --el-border-color-lighter: oklch(0.26 0.008 60);
  --el-border-color-dark: oklch(0.40 0.014 60);

  /* Text 階梯 — primary/secondary 已透過 var(--app-text*) cascade，這裡只補 regular / placeholder */
  --el-text-color-regular: oklch(0.85 0.010 75);
  --el-text-color-placeholder: oklch(0.50 0.010 65);

  /* Mask — overlay 用深色半透明 */
  --el-mask-color: oklch(0.10 0.005 60 / 0.7);

  /* el-empty illustration — default SVG 用 9 階灰白色，dark 上會像紙張燈箱
   * 一樣刺眼。整組對映到深底色階梯。 */
  --el-empty-fill-color-0: oklch(0.18 0.008 60);
  --el-empty-fill-color-1: oklch(0.20 0.008 60);
  --el-empty-fill-color-2: oklch(0.22 0.010 60);
  --el-empty-fill-color-3: oklch(0.24 0.010 60);
  --el-empty-fill-color-4: oklch(0.26 0.012 60);
  --el-empty-fill-color-5: oklch(0.28 0.012 60);
  --el-empty-fill-color-6: oklch(0.30 0.014 60);
  --el-empty-fill-color-7: oklch(0.34 0.014 60);
  --el-empty-fill-color-8: oklch(0.38 0.014 60);
  --el-empty-fill-color-9: oklch(0.42 0.016 60);
}

/* Dark mode 元件專用調校（會凸顯的對比 / 警示） */
:root[data-theme="dark"] .el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell {
  background-color: oklch(0.95 0.02 75 / 0.04);
}

:root[data-theme="dark"] .el-alert.el-alert--warning {
  background: oklch(0.72 0.16 50 / 0.16);
  border-color: oklch(0.72 0.16 50 / 0.45);
}
:root[data-theme="dark"] .el-alert.el-alert--error {
  background: oklch(0.68 0.18 25 / 0.16);
  border-color: oklch(0.68 0.18 25 / 0.45);
}
:root[data-theme="dark"] .el-alert.el-alert--success {
  background: oklch(0.68 0.16 145 / 0.16);
  border-color: oklch(0.68 0.16 145 / 0.40);
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

/* EP alerts default to a faint tint that disappears on cream bg.
 * Give warning/error a stronger fill + visible border + bolder title so
 * blocking states ("尚未設定 gearset" etc.) actually catch the eye. */
.el-alert.el-alert--warning {
  background: oklch(0.58 0.17 45 / 0.12);
  border: 1px solid oklch(0.58 0.17 45 / 0.40);
  padding: 12px 16px;
}
.el-alert.el-alert--warning .el-alert__title {
  color: oklch(0.38 0.16 45);
  font-weight: 700;
  font-size: 14.5px;
}
.el-alert.el-alert--warning .el-alert__description {
  color: oklch(0.42 0.13 45);
  margin-top: 4px;
}
.el-alert.el-alert--warning .el-alert__icon {
  color: oklch(0.55 0.17 45);
  font-size: 18px;
}

.el-alert.el-alert--error {
  background: oklch(0.55 0.20 25 / 0.10);
  border: 1px solid oklch(0.55 0.20 25 / 0.40);
}
.el-alert.el-alert--error .el-alert__title {
  color: oklch(0.40 0.18 25);
  font-weight: 700;
}
.el-alert.el-alert--error .el-alert__icon {
  color: oklch(0.55 0.20 25);
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

/* Shared Cormorant italic flavor line — used for hero quotes,
 * empty-state flavor text, onboarding tagline, etc. */
.quote-flavor {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  color: oklch(0.62 0.12 65);
  letter-spacing: 0.01em;
  margin: 0;
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
  height: 72px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--app-border);
}

.logo-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 2px oklch(0.40 0.10 50 / 0.18));
}

.logo-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.logo-ff {
  font-family: 'Noto Serif TC', serif;
  font-size: 19px;
  font-weight: 900;
  color: var(--app-text);
  letter-spacing: 1px;
  line-height: 1;
}

.logo-sub {
  font-size: 9.5px;
  font-weight: 700;
  color: oklch(0.42 0.05 55);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  line-height: 1.2;
}

.logo-theme-slot {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
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
  /* Soft window-light glow — center bright, edges a deeper cream so the
   * blank canvas around constrained pages doesn't feel harsh. */
  background:
    radial-gradient(
      ellipse 70% 85% at top center,
      var(--app-bg) 0%,
      oklch(0.89 0.035 72) 100%
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
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    color: var(--app-text-muted);
    cursor: pointer;
    padding: 0;
    border-radius: 8px;
  }

  /* Sidebar is only 220px on mobile drawer; with icon + text + toggle
     + close all needing room, lift the toggle into the absolute corner
     alongside close, and reserve enough right padding on the parent
     so the flex content never grows under the absolute pair. Both
     button icons trim to 36px; "FFXIV 製作助手" sub is hidden in the
     drawer (page H1 already carries the same context). */
  .app-logo {
    padding-right: 90px;
  }
  .app-logo .logo-theme-slot {
    position: absolute;
    right: 48px;
    top: 50%;
    transform: translateY(-50%);
    margin: 0;
  }
  .app-logo .logo-theme-slot :deep(.theme-toggle) {
    width: 36px;
    height: 36px;
  }
  .app-logo .logo-ff {
    font-size: 17px;
    letter-spacing: 0;
  }
  .app-logo .logo-sub {
    display: none;
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
