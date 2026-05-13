<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useWorkshopProjectsStore, getProjectProgress } from '@/stores/workshop-projects'
import { loadCompanyCraft, loadItems, loadExtraItems } from '@/services/local-data-source'
import type { CompanyCraftSequence } from '@/services/local-data-source.types'
import { useLocaleStore } from '@/stores/locale'
import { useBomStore } from '@/stores/bom'
import { trackEvent } from '@/utils/analytics'
import ProjectEmptyState from '@/components/company-craft/ProjectEmptyState.vue'
import ProjectCard from '@/components/company-craft/ProjectCard.vue'
import NewProjectDialog from '@/components/company-craft/NewProjectDialog.vue'
import DeleteProjectDialog from '@/components/company-craft/DeleteProjectDialog.vue'

const router = useRouter()
const workshopStore = useWorkshopProjectsStore()
const bom = useBomStore()
const localeStore = useLocaleStore()
const newDialogOpen = ref(false)

const sequences = ref<CompanyCraftSequence[]>([])
const dataReady = computed(() => sequences.value.length > 0)
const loadError = ref<string | null>(null)

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
  trackEvent('workshop_project_sync_to_bom', { project_id: projectId })
  router.push('/bom')
}

const deleteCandidate = computed(() =>
  deleteCandidateId.value ? workshopStore.getProject(deleteCandidateId.value) : null,
)
const deleteCandidateId = ref<string | null>(null)

function onDelete(id: string) {
  if (!workshopStore.getProject(id)) return
  deleteCandidateId.value = id
}

function onDeleteConfirm(id: string) {
  bom.removeProjectTarget(id)
  workshopStore.deleteProject(id)
  trackEvent('workshop_project_delete', { project_id: id })
  if (expandedId.value === id) expandedId.value = null
  deleteCandidateId.value = null
  ElMessage.success('專案已刪除')
}

function onDeleteCancel() {
  deleteCandidateId.value = null
}

onMounted(async () => {
  try {
    const [seqs] = await Promise.all([
      loadCompanyCraft(),
      loadItems(localeStore.current),
      loadExtraItems(localeStore.current),
    ])
    sequences.value = seqs
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
})

async function retryLoad() {
  loadError.value = null
  try {
    const [seqs] = await Promise.all([
      loadCompanyCraft(),
      loadItems(localeStore.current),
      loadExtraItems(localeStore.current),
    ])
    sequences.value = seqs
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  }
}

watch(
  () => workshopStore.progressVersion,
  () => {
    for (const proj of workshopStore.projects) {
      if (proj.completedAt) continue
      const progress = getProjectProgress(proj, sequences.value, seqById.value)
      if (progress >= 1) {
        workshopStore.markCompleted(proj.id)
        trackEvent('workshop_project_completed', {
          project_id: proj.id,
          days_to_complete: Math.round((Date.now() - proj.createdAt) / (1000 * 60 * 60 * 24)),
        })
        ElMessage.success(`「${proj.name}」全階段完成！`)
      }
    }
  },
)
</script>

<template>
  <div class="company-craft-view" v-loading="!dataReady && !loadError">
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
        v-if="workshopStore.activeProjects.length === 0"
        @open-new="newDialogOpen = true"
      />

      <div v-else class="cc-projects">
        <div class="cc-toolbar">
          <el-button type="primary" @click="newDialogOpen = true">+&nbsp;&nbsp;新增專案</el-button>
          <span class="cc-counter">{{ workshopStore.activeProjects.length }} 個進行中</span>
        </div>
        <ProjectCard
          v-for="p in workshopStore.activeProjects"
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

    <DeleteProjectDialog
      :project="deleteCandidate"
      :sequences="sequences"
      :seq-by-id="seqById"
      @cancel="onDeleteCancel"
      @confirm="onDeleteConfirm"
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

/* ── Mobile ─────────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .company-craft-view { padding: 12px 12px 80px; }
  .cc-header { margin-bottom: 20px; }
  .cc-toolbar { flex-wrap: wrap; gap: 10px; }
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
