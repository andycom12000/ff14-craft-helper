<script setup lang="ts">
import { ref, computed, h, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useWorkshopProjectsStore, getProjectProgress } from '@/stores/workshop-projects'
import { loadCompanyCraft, loadItems, loadExtraItems, getItemSync } from '@/services/local-data-source'
import { getIconUrl } from '@/utils/icon-url'
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

const completedSectionOpen = ref(false)

function onReopen(id: string) {
  workshopStore.reopenProject(id)
  ElMessage.success('已重新開啟此專案')
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
    // Pick a representative icon: the first sequence's result item.
    // The project itself has no inherent icon; this gives the BOM row a
    // recognizable visual without inventing a generic placeholder.
    let icon = ''
    const firstSeqRef = proj.sequences[0]
    if (firstSeqRef) {
      const seq = seqById.value.get(firstSeqRef.sequenceId)
      const item = seq ? getItemSync(seq.resultItemId, localeStore.current) : null
      if (item?.iconId) icon = getIconUrl(item.iconId)
    }
    bom.addTarget({
      kind: 'company-craft-project',
      projectId,
      itemId: -1,
      name: proj.name,
      icon,
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
  const proj = workshopStore.getProject(id)
  if (!proj) return
  const projName = proj.name

  bom.removeProjectTarget(id)
  workshopStore.deleteProject(id)
  trackEvent('workshop_project_delete', { project_id: id })
  if (expandedId.value === id) expandedId.value = null
  deleteCandidateId.value = null

  const msg = ElMessage({
    type: 'success',
    duration: 8000,
    showClose: true,
    message: h('span', { style: 'display: inline-flex; align-items: center; gap: 10px;' }, [
      h('span', `已刪除「${projName}」`),
      h('button', {
        style: 'background: transparent; border: 0; color: var(--app-craft, oklch(0.50 0.16 40)); font-weight: 600; cursor: pointer; padding: 0 4px; font-size: inherit; font-family: inherit; text-decoration: underline;',
        onClick: () => {
          workshopStore.restoreProject(id)
          msg.close()
        },
      }, '復原'),
    ]),
  })
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
      if (proj.completedAt || proj.deletedAt) continue
      const progress = getProjectProgress(proj, sequences.value, seqById.value)
      if (progress >= 1) {
        workshopStore.markCompleted(proj.id)
        trackEvent('workshop_project_completed', {
          project_id: proj.id,
          days_to_complete: Math.round((Date.now() - proj.createdAt) / (1000 * 60 * 60 * 24)),
        })
        const completedId = proj.id
        const completedName = proj.name
        const msg = ElMessage({
          type: 'success',
          duration: 8000,
          showClose: true,
          message: h('span', { style: 'display: inline-flex; align-items: center; gap: 10px;' }, [
            h('span', `「${completedName}」全階段完成！`),
            h('button', {
              style: 'background: transparent; border: 0; color: var(--app-craft, oklch(0.50 0.16 40)); font-weight: 600; cursor: pointer; padding: 0 4px; font-size: inherit; font-family: inherit; text-decoration: underline;',
              onClick: () => {
                completedSectionOpen.value = true
                expandedId.value = completedId
                msg.close()
              },
            }, '查看'),
          ]),
        })
      }
    }
  },
)
</script>

<template>
  <div class="company-craft-view" v-loading="!dataReady && !loadError">
    <header class="cc-header">
      <span class="cc-eyebrow">BLUEPRINTS · 工坊圖紙</span>
      <h2>部隊工坊 <span class="cc-beta" aria-label="實驗中">BETA · 實驗中</span></h2>
      <p class="cc-tagline">『今天工坊裡，動到哪一步了？』</p>
      <div class="cc-chalk-rule" />
    </header>

    <div v-if="loadError" class="cc-error">
      <p>圖紙抽屜卡住了，請重試。<span class="detail">({{ loadError }})</span></p>
      <el-button type="primary" @click="retryLoad">重試</el-button>
    </div>
    <template v-else>
      <ProjectEmptyState
        v-if="workshopStore.activeProjects.length === 0 && workshopStore.completedProjects.length === 0"
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
          @reopen="onReopen"
        />

        <section v-if="workshopStore.completedProjects.length > 0" class="cc-completed">
          <button
            type="button"
            class="cc-completed-head"
            :aria-expanded="completedSectionOpen"
            @click="completedSectionOpen = !completedSectionOpen"
          >
            <span class="cc-completed-caret" aria-hidden="true">{{ completedSectionOpen ? '▾' : '▸' }}</span>
            已完成 {{ workshopStore.completedProjects.length }} 件
          </button>
          <div v-if="completedSectionOpen" class="cc-completed-list">
            <ProjectCard
              v-for="p in workshopStore.completedProjects"
              :key="p.id"
              :project="p"
              :sequences="sequences"
              :seq-by-id="seqById"
              :expanded="expandedId === p.id"
              @expand="onExpand"
              @sync="onSync"
              @delete="onDelete"
              @reopen="onReopen"
            />
          </div>
        </section>
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
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  font-size: 11px;
  line-height: 1;
  letter-spacing: 0.25em;
  color: var(--app-text-muted);
  text-transform: uppercase;
  margin-bottom: 6px;
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
  padding: 3px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 28%, transparent);
  color: var(--app-craft, oklch(0.50 0.16 40));
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.18em;
  line-height: 1.1;
  text-transform: uppercase;
  margin-top: 6px;
}

.cc-tagline {
  font-family: 'Noto Serif TC', serif;
  font-size: 14px;
  letter-spacing: 0.02em;
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

/* ── Completed section ────────────────────────────────────────────────────── */
.cc-completed {
  margin-top: 28px;
  padding-top: 18px;
  border-top: 1px dashed var(--app-border);
}
.cc-completed-head {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 0;
  padding: 6px 10px 6px 0;
  margin: 0 0 12px;
  font-family: 'Noto Serif TC', serif;
  font-weight: 600;
  font-size: 14px;
  color: var(--app-text-muted);
  cursor: pointer;
  border-radius: 6px;
  transition: color 0.12s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
}
.cc-completed-head:hover { color: var(--app-text); }
.cc-completed-head:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.cc-completed-caret {
  display: inline-block;
  width: 12px;
  font-size: 11px;
}
.cc-completed-list {
  display: flex;
  flex-direction: column;
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
