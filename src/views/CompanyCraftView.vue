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
import PhaseBoard from '@/components/company-craft/PhaseBoard.vue'
import NewProjectDialog from '@/components/company-craft/NewProjectDialog.vue'
import DeleteProjectDialog from '@/components/company-craft/DeleteProjectDialog.vue'
import { useMediaQuery } from '@/composables/useMediaQuery'
import { CATEGORY_META } from '@/utils/company-craft-labels'

const isWide = useMediaQuery('(min-width: 1200px)')

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
  if (isWide.value) {
    expandedId.value = id
  } else {
    expandedId.value = expandedId.value === id ? null : id
  }
}

const selectedProject = computed(() =>
  expandedId.value ? workshopStore.getProject(expandedId.value) : null,
)

const selectedMeta = computed(() => {
  const p = selectedProject.value
  if (!p) return null
  const meta = CATEGORY_META[p.category]
  const n = p.sequences.length
  const partsLabel = p.category === 'workshop' ? `${n} 件` : `${n} 零件`
  return { ...meta, partsLabel, isCompleted: !!p.completedAt }
})

const selectedLinkedToBom = computed(() => {
  if (!selectedProject.value) return false
  return bom.targets.some(
    t => t.kind === 'company-craft-project' && t.projectId === selectedProject.value!.id,
  )
})

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
    }, 'company_craft')
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
  <div
    class="view-container company-craft-view"
    :class="{ 'cc-wide': isWide }"
    v-loading="!dataReady && !loadError"
  >
    <h2>部隊工坊<span class="cc-beta" aria-label="實驗中">BETA · 實驗中</span></h2>
    <p class="view-desc">追蹤潛艇、飛空艇、地下城等部隊工坊的多階段製作進度。</p>

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
        <aside class="cc-rail">
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
            :selected="isWide && expandedId === p.id"
            :embed-phase-board="!isWide"
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
                :selected="isWide && expandedId === p.id"
                :embed-phase-board="!isWide"
                @expand="onExpand"
                @sync="onSync"
                @delete="onDelete"
                @reopen="onReopen"
              />
            </div>
          </section>
        </aside>

        <section v-if="isWide" class="cc-detail">
          <template v-if="selectedProject && selectedMeta">
            <header class="cc-detail-head">
              <div class="cc-detail-titlebox">
                <span class="cc-detail-eyebrow">
                  {{ selectedMeta.label }} · {{ selectedMeta.partsLabel }}
                  <span v-if="selectedMeta.isCompleted" class="cc-detail-completed">✓ 已完成</span>
                </span>
                <h3 class="cc-detail-title">{{ selectedProject.name }}</h3>
              </div>
              <div class="cc-detail-actions">
                <el-button
                  v-if="!selectedMeta.isCompleted"
                  class="craft-cta"
                  @click="onSync(selectedProject.id)"
                >
                  {{ selectedLinkedToBom ? '前往購物清單 →' : '加入購物清單' }}
                </el-button>
                <el-dropdown trigger="click">
                  <el-button text class="kebab">⋯</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item v-if="selectedMeta.isCompleted" @click="onReopen(selectedProject.id)">
                        重新開啟
                      </el-dropdown-item>
                      <el-dropdown-item @click="onDelete(selectedProject.id)">刪除專案</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </header>
            <PhaseBoard
              :project="selectedProject"
              :sequences="sequences"
              :seq-by-id="seqById"
            />
          </template>
          <div v-else class="cc-detail-empty">
            <p class="cc-detail-empty-eyebrow">DETAIL</p>
            <p class="cc-detail-empty-line">從左側選一個專案，這裡會展開階段進度。</p>
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

/* Page H2 picks up the global .view-container h2 rule from App.vue;
 * only the BETA pill needs local styling. */
.company-craft-view h2 {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.cc-beta {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
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

/* ── Layout: narrow (default) = single column, wide = rail + detail ────────── */
.cc-projects {
  display: block;
}

.cc-rail { min-width: 0; }
.cc-detail { display: none; }

@media (min-width: 1200px) {
  .cc-projects {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    gap: 28px;
    align-items: start;
  }

  .cc-rail {
    position: sticky;
    top: 24px;
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    /* Leave a sliver for the scrollbar so card hover shadow isn't clipped */
    padding-right: 4px;
    /* Tinted scrollbar that fits the cream-on-cream palette */
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 24%, transparent)
      transparent;
  }

  .cc-detail {
    display: block;
    min-width: 0;
  }

  /* Rail cards: hide the inline action row (sync CTA + kebab) — actions
   * live on the detail card instead so rail items stay scannable. The
   * kebab on the detail card covers delete / reopen for the selected one. */
  .cc-rail :deep(.card-actions) {
    display: none;
  }

  /* Stretched-link pattern: whole rail card is the click target.
   * The real button (.card-title-block) still handles keyboard focus
   * and screen-reader semantics; ::after just extends its hit-area to
   * cover the entire card. Hidden action row at rail leaves no children
   * to conflict with the overlay. */
  .cc-rail :deep(.card) { position: relative; cursor: pointer; }
  .cc-rail :deep(.card-title-block::after) {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  /* Title-block's own hover/focus styling shouldn't leak — the card
   * already provides the hover lift + selected highlight. */
  .cc-rail :deep(.card-title-block:hover) { background: transparent; }
}

/* ── Detail header (wide only) ─────────────────────────────────────────────── */
.cc-detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 4px;
  padding-bottom: 14px;
}
.cc-detail-titlebox { min-width: 0; }
.cc-detail-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  font-size: 10.5px;
  letter-spacing: 0.22em;
  color: var(--app-text-muted);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.cc-detail-completed {
  font-family: 'Fira Code', monospace;
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: none;
  color: var(--app-success, oklch(0.55 0.16 145));
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-success, oklch(0.55 0.16 145)) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--app-success, oklch(0.55 0.16 145)) 30%, transparent);
}
.cc-detail-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
  margin: 0;
  color: var(--app-text);
}
.cc-detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.cc-detail-actions :deep(.craft-cta) {
  background: transparent;
  color: var(--app-craft, oklch(0.50 0.16 40));
  border: 1px solid color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 38%, transparent);
  font-weight: 500;
}
.cc-detail-actions :deep(.craft-cta:hover) {
  background: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 8%, transparent);
  border-color: color-mix(in srgb, var(--app-craft, oklch(0.50 0.16 40)) 60%, transparent);
}
.cc-detail-actions :deep(.kebab) {
  padding: 0 8px;
}

/* ── Detail empty hint (wide only) ─────────────────────────────────────────── */
.cc-detail-empty {
  padding: 56px 28px;
  border: 1px dashed var(--app-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-surface-2) 50%, transparent);
  text-align: center;
}
.cc-detail-empty-eyebrow {
  margin: 0 0 10px;
  font-family: 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.32em;
  color: var(--app-text-muted);
  text-transform: uppercase;
}
.cc-detail-empty-line {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 14px;
  color: var(--app-text-muted);
  line-height: 1.6;
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
  .company-craft-view { padding-bottom: 80px; }
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
