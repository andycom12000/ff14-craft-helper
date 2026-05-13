<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useWorkshopProjectsStore } from '@/stores/workshop-projects'
import { loadCompanyCraft } from '@/services/local-data-source'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import { useBomStore } from '@/stores/bom'
import ProjectEmptyState from '@/components/company-craft/ProjectEmptyState.vue'
import ProjectCard from '@/components/company-craft/ProjectCard.vue'
import NewProjectDialog from '@/components/company-craft/NewProjectDialog.vue'

const router = useRouter()
const workshopStore = useWorkshopProjectsStore()
const bom = useBomStore()
const newDialogOpen = ref(false)

const sequences = ref<CompanyCraftSequence[]>([])
const dataReady = computed(() => sequences.value.length > 0)
const loadError = ref<string | null>(null)

const activeProjects = computed(() => workshopStore.activeProjects)

const seqById = computed(() => new Map(sequences.value.map(s => [s.id, s])))

const expandedId = ref<string | null>(null)
function onExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function onProjectCreated(projectId: string) {
  expandedId.value = projectId
  ElMessage.success('專案已建立')
}

function onSync(projectId: string) {
  const proj = workshopStore.getProject(projectId)
  if (!proj) return
  const linked = bom.targets.some(
    t => t.kind === 'company-craft-project' && t.projectId === projectId,
  )
  if (!linked) {
    bom.addTarget({
      kind: 'company-craft-project',
      projectId,
      itemId: -1,
      name: proj.name,
      icon: '',
      quantity: 1,
    })
  }
  router.push('/bom')
}

async function onDelete(id: string) {
  const proj = workshopStore.getProject(id)
  if (!proj) return
  try {
    await ElMessageBox.confirm(
      `確定刪除「${proj.name}」？已記錄的階段進度會一起移除。`,
      '刪除專案',
      { confirmButtonText: '刪除', cancelButtonText: '取消', type: 'warning' },
    )
    bom.removeProjectTarget(id)
    workshopStore.deleteProject(id)
    if (expandedId.value === id) expandedId.value = null
    ElMessage.success('專案已刪除')
  } catch {
    // user cancelled — no-op
  }
}

onMounted(async () => {
  try {
    sequences.value = await loadCompanyCraft()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
})

async function retryLoad() {
  loadError.value = null
  try {
    sequences.value = await loadCompanyCraft()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}
</script>

<template>
  <div class="company-craft-view" v-loading="!dataReady">
    <header class="cc-header">
      <span class="cc-eyebrow">工坊圖紙 · BLUEPRINTS</span>
      <h2>部隊工坊 <span class="cc-beta" aria-label="實驗中">實驗中</span></h2>
      <p class="cc-tagline">『今天工坊裡，動到哪一步了？』</p>
      <div class="cc-chalk-rule" />
    </header>

    <div v-if="loadError" class="cc-error">
      <p>圖紙抽屜卡住了，請重試。<span class="detail">({{ loadError }})</span></p>
      <el-button type="primary" @click="retryLoad">重試</el-button>
    </div>
    <template v-else>
      <ProjectEmptyState
        v-if="activeProjects.length === 0"
        @open-new="newDialogOpen = true"
      />

      <div v-else class="cc-projects">
        <div class="cc-toolbar">
          <el-button type="primary" @click="newDialogOpen = true">+&nbsp;&nbsp;新增專案</el-button>
          <span class="cc-counter">{{ activeProjects.length }} 個進行中</span>
        </div>
        <ProjectCard
          v-for="p in activeProjects"
          :key="p.id"
          :project="p"
          :sequences="sequences"
          :seq-by-id="seqById"
          :expanded="expandedId === p.id"
          @expand="onExpand"
          @sync="onSync"
          @delete="onDelete"
        />
      </div>
    </template>

    <NewProjectDialog
      v-model="newDialogOpen"
      @created="onProjectCreated"
    />
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

/* ── Error state ────────────────────────────────────────────────────────────── */
.cc-error {
  padding: 32px;
  border: 1px solid var(--app-warning-border, var(--app-border));
  background: var(--app-warning-tint, var(--app-surface-2));
  border-radius: 12px;
  text-align: center;
}
.cc-error .detail {
  display: block;
  font-family: 'Fira Code', monospace;
  font-size: 11px;
  color: var(--app-text-muted);
  margin-top: 4px;
}
</style>
