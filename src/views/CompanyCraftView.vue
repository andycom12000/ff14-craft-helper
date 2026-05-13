<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'
import { loadCompanyCraft } from '@/services/local-data-source'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import ProjectEmptyState from '@/components/company-craft/ProjectEmptyState.vue'

const workshopStore = useWorkshopProjectsStore()
const newDialogOpen = ref(false)

const sequences = ref<CompanyCraftSequence[]>([])
const dataReady = computed(() => sequences.value.length > 0)

const activeProjects = computed(() => workshopStore.activeProjects)

onMounted(async () => {
  try {
    sequences.value = await loadCompanyCraft()
  } catch (e) {
    console.warn('[CompanyCraftView] CompanyCraft data unavailable:', e)
    // sequences stays empty; downstream UI will be in a degraded state
  }
})
</script>

<template>
  <div class="company-craft-view" v-loading="!dataReady">
    <header class="cc-header">
      <span class="cc-eyebrow">工坊圖紙 · BLUEPRINTS</span>
      <h2>部隊工坊 <span class="cc-beta" aria-label="實驗中">實驗中</span></h2>
      <p class="cc-tagline">『今天工坊裡，動到哪一步了？』</p>
      <div class="cc-chalk-rule" />
    </header>

    <ProjectEmptyState
      v-if="activeProjects.length === 0"
      @open-new="newDialogOpen = true"
    />

    <div v-else class="cc-projects">
      <div class="cc-toolbar">
        <el-button type="primary" @click="newDialogOpen = true">+&nbsp;&nbsp;新增專案</el-button>
        <span class="cc-counter">{{ activeProjects.length }} 個進行中</span>
      </div>
      <!-- Project cards added in Task 12 -->
    </div>

    <!-- NewProjectDialog added in Task 16-18 -->
  </div>
</template>

<style scoped>
.company-craft-view {
  max-width: 1200px;
  --page-accent: var(--app-craft);
  --page-accent-dim: var(--app-craft-dim);
  padding-bottom: 48px;
}

@media (min-width: 1440px) {
  .company-craft-view {
    max-width: 1400px;
  }
}

@media (min-width: 1920px) {
  .company-craft-view {
    max-width: 1700px;
  }
}

/* ── Editorial Hero Header ─────────────────────────────────────────────────── */
.cc-header {
  margin-bottom: 28px;
}

.cc-eyebrow {
  display: block;
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: var(--app-text-muted);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.cc-header h2 {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 6px;
  line-height: 1.2;
}

.cc-beta {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-gold, oklch(0.78 0.13 75)) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-gold, oklch(0.78 0.13 75)) 50%, transparent);
  color: var(--accent-gold, oklch(0.78 0.13 75));
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
  line-height: 1;
  margin-top: 6px;
}

.cc-tagline {
  font-family: 'Noto Serif TC', serif;
  font-style: italic;
  font-size: 14px;
  color: var(--app-text-muted);
  margin: 0 0 14px;
}

.cc-chalk-rule {
  height: 1px;
  background: linear-gradient(
    to right,
    var(--app-craft, oklch(0.50 0.16 40)) 0%,
    color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 30%, transparent) 60%,
    transparent 100%
  );
  opacity: 0.4;
}

/* ── Toolbar (projects exist state) ────────────────────────────────────────── */
.cc-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.cc-counter {
  font-size: 13px;
  color: var(--app-text-muted);
}

/* ── Projects area ──────────────────────────────────────────────────────────── */
.cc-projects {
  /* Project cards added in Task 12 */
}
</style>
