<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  Setting,
  Search,
  Cpu,
  List,
  TrendCharts,
  Suitcase,
  Operation,
  Close,
  Document,
} from '@element-plus/icons-vue'

const route = useRoute()
const sidebarOpen = ref(false)

watch(() => route.path, () => {
  sidebarOpen.value = false
})
</script>

<template>
  <el-container class="app-container">
    <div
      v-if="sidebarOpen"
      class="sidebar-backdrop"
      @click="sidebarOpen = false"
    />
    <el-aside width="220px" class="app-aside" :class="{ open: sidebarOpen }">
      <div class="app-logo">
        <span class="logo-ff">FF14</span>
        <span class="logo-sub">Craft Helper</span>
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
          <el-icon><Suitcase /></el-icon>
          <span>配裝管理</span>
        </el-menu-item>
        <el-menu-item index="/recipe">
          <el-icon><Search /></el-icon>
          <span>配方選擇</span>
        </el-menu-item>
        <el-menu-item index="/simulator">
          <el-icon><Cpu /></el-icon>
          <span>製作模擬</span>
        </el-menu-item>
        <el-menu-item index="/bom">
          <el-icon><List /></el-icon>
          <span>材料清單</span>
        </el-menu-item>
        <el-menu-item index="/batch">
          <el-icon><Operation /></el-icon>
          <span>批量製作</span>
        </el-menu-item>
        <el-menu-item index="/market">
          <el-icon><TrendCharts /></el-icon>
          <span>市場查價</span>
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
    </el-aside>
    <el-main class="app-main">
      <button class="mobile-menu-btn" @click="sidebarOpen = true">
        <el-icon :size="22"><Operation /></el-icon>
      </button>
      <router-view />
    </el-main>
  </el-container>
</template>

<style>
:root {
  --app-bg: #0F0F23;
  --app-sidebar: #0A0A1A;
  --app-surface: #161630;
  --app-surface-hover: #1E1E42;
  --app-border: rgba(124, 58, 237, 0.15);
  --app-text: #E2E8F0;
  --app-text-muted: #94A3B8;
  --app-accent: #7C3AED;
  --app-accent-light: #A78BFA;
  --app-accent-glow: rgba(124, 58, 237, 0.2);
  --app-success: #4ade80;

  /* Spacing scale */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
}

html {
  --el-color-primary: #7C3AED;
  --el-color-primary-light-3: #9461F5;
  --el-color-primary-light-5: #A78BFA;
  --el-color-primary-light-7: #C4B5FD;
  --el-color-primary-light-8: #DDD6FE;
  --el-color-primary-light-9: #1E1E42;
  --el-color-primary-dark-2: #6D28D9;

  --el-bg-color: var(--app-bg);
  --el-bg-color-page: var(--app-bg);
  --el-bg-color-overlay: var(--app-surface);

  --el-fill-color: var(--app-surface-hover);
  --el-fill-color-light: var(--app-surface);
  --el-fill-color-lighter: #1A1A38;
  --el-fill-color-dark: #252550;
  --el-fill-color-darker: #2D2D5E;
  --el-fill-color-blank: var(--app-bg);

  --el-border-color: rgba(124, 58, 237, 0.2);
  --el-border-color-light: rgba(124, 58, 237, 0.12);
  --el-border-color-lighter: rgba(124, 58, 237, 0.08);
  --el-border-color-dark: rgba(124, 58, 237, 0.3);

  --el-text-color-primary: #E2E8F0;
  --el-text-color-regular: #CBD5E1;
  --el-text-color-secondary: #94A3B8;
  --el-text-color-placeholder: #64748B;

  --el-mask-color: rgba(15, 15, 35, 0.8);
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
  background-color: rgba(124, 58, 237, 0.04);
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
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--app-text);
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
    padding: 60px 16px 16px;
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
  cursor: pointer;
  user-select: none;
  transition: background-color 0.15s;
}

.code-block:hover {
  background: var(--el-fill-color);
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
  font-family: 'Fira Code', monospace;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-accent-light);
  letter-spacing: 2px;
}

.logo-sub {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-muted);
  letter-spacing: 1px;
  text-transform: uppercase;
}

.app-menu {
  border-right: none;
  background-color: transparent;
  padding: 8px 0;
}

.app-menu .el-menu-item {
  color: var(--app-text-muted);
  margin: 2px 8px;
  border-radius: 8px;
  height: 44px;
  line-height: 44px;
  font-size: 14px;
  transition: all 0.2s ease;
}

.app-menu .el-menu-item:hover {
  color: var(--app-text);
  background-color: var(--app-accent-glow);
}

.app-menu .el-menu-item.is-active {
  color: #fff;
  background: linear-gradient(135deg, var(--app-accent) 0%, var(--el-color-primary-dark-2) 100%);
  font-weight: 500;
}

.menu-divider {
  margin: 8px 16px;
  border-color: var(--app-border);
}

.app-main {
  background-color: var(--app-bg);
  overflow-y: auto;
}

.sidebar-close-btn {
  display: none;
}

.mobile-menu-btn {
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
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--app-text-muted);
    cursor: pointer;
    padding: 4px;
  }

  .app-logo {
    position: relative;
  }

  .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 100;
    width: 40px;
    height: 40px;
    border-radius: 10px;
    border: 1px solid var(--app-border);
    background: var(--app-surface);
    color: var(--app-text);
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}
</style>
