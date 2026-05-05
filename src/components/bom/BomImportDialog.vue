<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import {
  parseTeamcraftImport,
  resolveTeamcraftEntries,
  type ResolvedTeamcraftEntry,
} from '@/services/teamcraft-import'
import { useBomStore, type BomTarget } from '@/stores/bom'
import { getRecipe } from '@/api/xivapi'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  imported: [count: number]
}>()

const bom = useBomStore()

type LoadingPhase = 'parsing' | 'resolving' | null

const inputText = ref('')
const loadingPhase = ref<LoadingPhase>(null)
const resolved = ref<ResolvedTeamcraftEntry[]>([])
const warnings = ref<string[]>([])
const mergeStrategy = ref<'merge' | 'replace'>('merge')
const errorMessage = ref<string | null>(null)
const debounceTimer = ref<number | null>(null)
const recipeChoices = ref<Map<number, number>>(new Map())
const resolveProgress = ref<{ done: number; total: number } | null>(null)

// A real Teamcraft list URL the user can paste with one click. The IDs may
// or may not resolve cleanly — that's fine; the dialog is showing format,
// and unknown items get flagged in the result list.
const SAMPLE_URL = 'https://ffxivteamcraft.com/import/NTM0MCw4LDM7NTMzNyw0LDU='

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const ambiguousCount = computed(() =>
  resolved.value.filter(
    (r) => !r.unknown && r.resolvedRecipeId === null && r.recipes.length > 1,
  ).length,
)

const unknownCount = computed(() =>
  resolved.value.filter((r) => r.unknown).length,
)

const nonCraftableCount = computed(() =>
  resolved.value.filter(
    (r) => !r.unknown && r.recipes.length === 0,
  ).length,
)

const importableCount = computed(() =>
  resolved.value.filter((r) => {
    if (r.unknown) return false
    if (r.recipes.length === 0) return true // non-craftable goes in as well
    return effectiveRecipeId(r) !== null
  }).length,
)

function effectiveRecipeId(r: ResolvedTeamcraftEntry): number | null {
  if (r.unknown) return null
  if (r.resolvedRecipeId !== null) return r.resolvedRecipeId
  return recipeChoices.value.get(r.itemId) ?? null
}

function scheduleParse() {
  if (debounceTimer.value !== null) {
    window.clearTimeout(debounceTimer.value)
  }
  debounceTimer.value = window.setTimeout(() => {
    debounceTimer.value = null
    void runParse()
  }, 200)
}

async function runParse() {
  errorMessage.value = null
  warnings.value = []
  resolved.value = []
  recipeChoices.value = new Map()
  if (!inputText.value.trim()) return

  loadingPhase.value = 'parsing'
  const parsed = parseTeamcraftImport(inputText.value)
  warnings.value = parsed.warnings
  if (parsed.entries.length === 0) {
    errorMessage.value = parsed.warnings[0] ?? '無法解析輸入'
    loadingPhase.value = null
    return
  }

  loadingPhase.value = 'resolving'
  // Only show the counter when there's enough work that progress feedback
  // matters. <30 entries resolves under a second; the spinner is fine.
  resolveProgress.value = parsed.entries.length > 30
    ? { done: 0, total: parsed.entries.length }
    : null
  try {
    resolved.value = await resolveTeamcraftEntries(parsed.entries, (done, total) => {
      if (resolveProgress.value) resolveProgress.value = { done, total }
    })
  } catch (err) {
    console.error('[BOM Import] resolve failed:', err)
    errorMessage.value = '解析時發生錯誤，請稍後再試'
  } finally {
    loadingPhase.value = null
    resolveProgress.value = null
  }
}

function fillSample() {
  inputText.value = SAMPLE_URL
}

function chooseRecipe(itemId: number, recipeId: number) {
  recipeChoices.value.set(itemId, recipeId)
  recipeChoices.value = new Map(recipeChoices.value)
}

async function confirmImport() {
  // Three buckets:
  //   - craftable + recipe chosen → BomTarget with recipeId, fetch recipe meta
  //   - non-craftable but item known → BomTarget with recipeId=null, use the
  //     resolver's name/icon (BOM tracks it for purchase planning even though
  //     there's no craft expansion to do)
  //   - unknown id (not in any shard) → still skipped; we have no name to show
  //   - ambiguous (>1 recipe, no choice yet) → skipped, shouldn't reach here
  const selected = resolved.value.filter((r) => {
    if (r.unknown) return false
    if (r.recipes.length === 0) return true // non-craftable
    return effectiveRecipeId(r) !== null
  })

  if (selected.length === 0) {
    ElMessage.warning('沒有可匯入的條目')
    return
  }

  const fetched = await Promise.all(
    selected.map(async (r): Promise<BomTarget | null> => {
      // Non-craftable: no recipe to fetch.
      if (r.recipes.length === 0) {
        return {
          itemId: r.itemId,
          recipeId: null,
          name: r.name,
          icon: r.icon,
          quantity: r.qty,
        }
      }
      const recipeId = effectiveRecipeId(r)!
      try {
        const recipe = await getRecipe(recipeId)
        return {
          itemId: r.itemId,
          recipeId,
          name: recipe.name,
          icon: recipe.icon,
          quantity: r.qty,
          amountResult: recipe.amountResult,
        }
      } catch (err) {
        console.error(`[BOM Import] failed to load recipe ${recipeId}:`, err)
        return null
      }
    }),
  )
  const newTargets = fetched.filter((t): t is BomTarget => t !== null)

  if (newTargets.length === 0) {
    ElMessage.error('全部條目都無法匯入')
    return
  }

  if (mergeStrategy.value === 'replace') {
    bom.clearTargets()
  }
  for (const t of newTargets) {
    bom.addTarget(t)
  }

  ElMessage.success(`已匯入 ${newTargets.length} 筆`)
  emit('imported', newTargets.length)
  resetState()
  visible.value = false
}

function resetState() {
  inputText.value = ''
  resolved.value = []
  warnings.value = []
  errorMessage.value = null
  recipeChoices.value = new Map()
}

watch(visible, (open) => {
  if (!open) resetState()
})

watch(inputText, () => scheduleParse())

onBeforeUnmount(() => {
  if (debounceTimer.value !== null) {
    window.clearTimeout(debounceTimer.value)
    debounceTimer.value = null
  }
})
</script>

<template>
  <el-dialog
    v-model="visible"
    title="從 Teamcraft 匯入"
    width="640px"
    align-center
    destroy-on-close
    class="bom-import-dialog"
  >
    <div class="bid-body">
      <p class="bid-subtitle">
        貼上 Teamcraft 連結 — 從 ReMakePlace、MakePlace、或任何 Teamcraft 列表都能直接匯入。
      </p>

      <el-input
        v-model="inputText"
        type="textarea"
        :rows="3"
        autofocus
        placeholder="https://ffxivteamcraft.com/import/..."
        class="bid-input"
      />

      <button
        v-if="!inputText.trim()"
        type="button"
        class="bid-sample"
        @click="fillSample"
      >填入範例連結</button>

      <p v-if="errorMessage" class="bid-error">{{ errorMessage }}</p>
      <p v-else-if="loadingPhase === 'resolving' && resolveProgress" class="bid-status">
        比對中 {{ resolveProgress.done }} / {{ resolveProgress.total }}
      </p>
      <p v-else-if="loadingPhase" class="bid-status">解析中…</p>

      <template v-if="resolved.length > 0">
        <div class="bid-summary">
          將匯入 <strong>{{ importableCount }}</strong> / {{ resolved.length }} 筆
          <span v-if="ambiguousCount > 0" class="bid-summary__warn">
            · {{ ambiguousCount }} 筆需要選擇配方
          </span>
          <span v-if="nonCraftableCount > 0" class="bid-summary__hint">
            · 含 {{ nonCraftableCount }} 筆非製作物品（市場／NPC 採購）
          </span>
          <span v-if="unknownCount > 0" class="bid-summary__danger">
            · {{ unknownCount }} 筆找不到資料
          </span>
        </div>

        <ul class="bid-list" role="list">
          <li
            v-for="r in resolved"
            :key="r.itemId"
            class="bid-row"
            :data-state="r.unknown ? 'unknown' : (r.resolvedRecipeId === null && r.recipes.length > 1 ? 'ambiguous' : 'ok')"
          >
            <img
              v-if="r.icon"
              :src="r.icon"
              :alt="r.name"
              crossorigin="anonymous"
              loading="lazy"
              decoding="async"
              class="bid-row__icon"
            />
            <span v-else class="bid-row__icon bid-row__icon--missing" aria-hidden="true">?</span>

            <div class="bid-row__main">
              <div class="bid-row__name">{{ r.name }}</div>
              <div v-if="r.unknown" class="bid-row__meta bid-row__meta--err">
                ID {{ r.itemId }} · 找不到資料，跳過
              </div>
              <div v-else-if="r.resolvedRecipeId === null && r.recipes.length > 1" class="bid-row__meta">
                找到 {{ r.recipes.length }} 個配方，請選擇
              </div>
              <div v-else-if="r.recipes.length === 0" class="bid-row__meta">
                非製作物品 · 將以「市場／NPC」方式追蹤
              </div>
              <div v-else class="bid-row__meta">
                配方 #{{ r.resolvedRecipeId }}
                <template v-if="r.recipes.length > 1"> · 共 {{ r.recipes.length }} 個來源</template>
              </div>

              <div
                v-if="r.resolvedRecipeId === null && r.recipes.length > 1"
                class="bid-row__chooser"
              >
                <button
                  v-for="rec in r.recipes"
                  :key="rec.recipeId"
                  type="button"
                  class="bid-chip"
                  :class="{ 'is-active': recipeChoices.get(r.itemId) === rec.recipeId }"
                  @click="chooseRecipe(r.itemId, rec.recipeId)"
                >
                  {{ rec.job }} · #{{ rec.recipeId }}
                </button>
              </div>
            </div>

            <span class="bid-row__qty">×{{ r.qty }}</span>
          </li>
        </ul>

        <div class="bid-merge">
          <span class="bid-merge__label">寫入方式</span>
          <el-radio-group v-model="mergeStrategy" size="small">
            <el-radio-button value="merge">合併到現有清單</el-radio-button>
            <el-radio-button value="replace">取代現有清單</el-radio-button>
          </el-radio-group>
        </div>
      </template>
    </div>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button
        type="primary"
        :disabled="resolved.length === 0 || importableCount === 0 || loadingPhase !== null"
        @click="confirmImport"
      >
        匯入 {{ importableCount > 0 ? `（${importableCount}）` : '' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.bid-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 60vh;
  overflow-y: auto;
}

.bid-subtitle {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-muted);
  line-height: 1.6;
}

.bid-input :deep(.el-textarea__inner) {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12.5px;
  letter-spacing: -0.005em;
}

.bid-error {
  margin: 0;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--el-color-danger) 8%, transparent);
  color: var(--el-color-danger);
  border-radius: 8px;
  font-size: 13px;
}

.bid-status {
  margin: 0;
  font-size: 13px;
  color: var(--app-text-muted);
}

.bid-sample {
  align-self: flex-start;
  margin-top: -4px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--app-craft);
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.bid-sample:hover {
  color: oklch(from var(--app-craft) calc(l - 0.06) c h);
}

.bid-summary {
  font-size: 13.5px;
  color: var(--app-text);
}

.bid-summary-hint {
  margin: -6px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
  line-height: 1.5;
}

.bid-summary strong {
  color: var(--app-craft);
  font-weight: 700;
}

.bid-summary__warn {
  color: var(--el-color-warning);
}

.bid-summary__danger {
  color: var(--el-color-danger);
}

.bid-summary__hint {
  color: var(--app-text-muted);
}

.bid-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  overflow: hidden;
}

.bid-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--app-surface);
}

.bid-row + .bid-row {
  border-top: 1px solid var(--app-border);
}

.bid-row[data-state='unknown'] {
  background: color-mix(in srgb, var(--el-color-danger) 5%, var(--app-surface));
}

.bid-row[data-state='ambiguous'] {
  background: color-mix(in srgb, var(--el-color-warning) 5%, var(--app-surface));
}

.bid-row__icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
}

.bid-row__icon--missing {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--app-surface-2);
  color: var(--app-text-muted);
  font-weight: 700;
}

.bid-row__main {
  min-width: 0;
}

.bid-row__name {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bid-row__meta {
  font-size: 11.5px;
  color: var(--app-text-muted);
  margin-top: 2px;
}

.bid-row__meta--err {
  color: var(--el-color-danger);
}

.bid-row__chooser {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.bid-chip {
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text-muted);
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11.5px;
  cursor: pointer;
  font-family: 'Fira Code', ui-monospace, monospace;
}

.bid-chip:hover {
  border-color: var(--app-craft);
  color: var(--app-craft);
}

.bid-chip.is-active {
  background: var(--app-craft);
  color: oklch(0.98 0.012 85);
  border-color: var(--app-craft);
}

.bid-row__qty {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 13px;
  color: var(--app-text);
  font-weight: 600;
}

.bid-merge {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.bid-merge__label {
  font-size: 12.5px;
  color: var(--app-text-muted);
}
</style>
