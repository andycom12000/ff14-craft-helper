<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import type { InputInstance } from 'element-plus'
import { Search, Close } from '@element-plus/icons-vue'
import { searchRecipes, getRecipe, type RecipeSearchResult } from '@/api/xivapi'
import type { Recipe } from '@/stores/recipe'
import ItemName from '@/components/common/ItemName.vue'

const CRAFT_JOBS = ['木工', '鍛造', '甲冑', '金工', '皮革', '裁縫', '鍊金', '烹調'] as const

const props = defineProps<{ modelValue: boolean; context?: string }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'add': [recipe: Recipe]
}>()

const query = ref('')
const allResults = ref<RecipeSearchResult[]>([])
const loading = ref(false)
const addingIds = ref(new Set<number>())
const selectedJob = ref('')
const levelMin = ref<number | undefined>(undefined)
const levelMax = ref<number | undefined>(undefined)
const searchInputRef = ref<InputInstance>()
const panelRef = ref<HTMLElement>()

watch(() => props.modelValue, (open) => {
  if (open) nextTick(() => searchInputRef.value?.focus())
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

function onDialogKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
    return
  }
  if (e.key !== 'Tab') return
  const root = panelRef.value
  if (!root) return
  const focusable = Array.from(
    root.querySelectorAll<HTMLElement>(
      'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null)
  if (focusable.length === 0) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

const filteredResults = computed(() => {
  let list = allResults.value
  if (selectedJob.value) {
    list = list.filter(r => r.job === selectedJob.value)
  }
  if (levelMin.value != null) {
    list = list.filter(r => r.level >= levelMin.value!)
  }
  if (levelMax.value != null) {
    list = list.filter(r => r.level <= levelMax.value!)
  }
  return list
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

watch(query, (value) => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const trimmed = value.trim()
  if (!trimmed) {
    allResults.value = []
    return
  }
  debounceTimer = setTimeout(async () => {
    loading.value = true
    try {
      allResults.value = await searchRecipes(trimmed)
    } catch {
      allResults.value = []
    } finally {
      loading.value = false
    }
  }, 200)
})

onUnmounted(() => { if (debounceTimer) clearTimeout(debounceTimer) })

async function addRecipe(row: RecipeSearchResult) {
  if (addingIds.value.has(row.id)) return
  addingIds.value.add(row.id)
  try {
    const recipe = await getRecipe(row.id)
    emit('add', recipe)
  } catch {
    // parent handles messaging
  } finally {
    addingIds.value.delete(row.id)
  }
}

function close() {
  emit('update:modelValue', false)
  query.value = ''
  allResults.value = []
}

// ====== Drag-to-dismiss (mobile only) ======
const dragOffset = ref(0)
const isDragging = ref(false)
const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches

let dragStartY = 0
let dragPointerId: number | null = null

function onGrabPointerDown(e: PointerEvent) {
  if (!isMobileViewport()) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  dragStartY = e.clientY
  dragPointerId = e.pointerId
  isDragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onGrabPointerMove(e: PointerEvent) {
  if (!isDragging.value || e.pointerId !== dragPointerId) return
  const delta = e.clientY - dragStartY
  // Only allow downward drag; clamp so card never moves up
  dragOffset.value = Math.max(0, delta)
}

function onGrabPointerEnd(e: PointerEvent) {
  if (!isDragging.value || e.pointerId !== dragPointerId) return
  const triggered = dragOffset.value > 100
  isDragging.value = false
  dragPointerId = null
  if (triggered) {
    // Animate the rest of the way out, then close
    dragOffset.value = window.innerHeight
    setTimeout(() => {
      dragOffset.value = 0
      close()
    }, 180)
  } else {
    dragOffset.value = 0
  }
}

const panelStyle = computed(() => {
  if (dragOffset.value === 0 && !isDragging.value) return undefined
  return {
    transform: `translateY(${dragOffset.value}px)`,
    transition: isDragging.value ? 'none' : 'transform 0.2s var(--ease-out-quart)',
  }
})

const overlayStyle = computed(() => {
  if (dragOffset.value === 0) return undefined
  // Fade backdrop as user drags down
  const fade = Math.max(0, 1 - dragOffset.value / 400)
  return { opacity: fade }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="modelValue"
        class="dialog-overlay"
        :style="overlayStyle"
        @click.self="close"
        @keydown="onDialogKeydown"
      >
        <div
          ref="panelRef"
          class="dialog-panel"
          :style="panelStyle"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipe-search-title"
        >
          <div
            class="dialog-grab-area"
            @pointerdown="onGrabPointerDown"
            @pointermove="onGrabPointerMove"
            @pointerup="onGrabPointerEnd"
            @pointercancel="onGrabPointerEnd"
          >
            <span class="dialog-grabber" aria-hidden="true" />
          </div>
          <div class="dialog-header">
            <h3 id="recipe-search-title" class="dialog-title">搜尋配方{{ context ? ` — ${context}` : '' }}</h3>
            <el-button :icon="Close" text aria-label="關閉搜尋視窗" @click="close" />
          </div>

          <div class="dialog-search">
            <el-input
              ref="searchInputRef"
              v-model="query"
              placeholder="搜尋配方名稱..."
              aria-label="配方名稱搜尋"
              clearable
              :prefix-icon="Search"
              size="large"
            />
            <div class="dialog-filters">
              <el-select v-model="selectedJob" placeholder="所有職業" aria-label="篩選職業" clearable class="filter-job">
                <el-option v-for="job in CRAFT_JOBS" :key="job" :label="job" :value="job" />
              </el-select>
              <div class="filter-level-group" role="group" aria-label="等級範圍">
                <span class="filter-level-prefix" aria-hidden="true">Lv.</span>
                <label class="filter-stepper-cell">
                  <span class="filter-stepper-label">最低</span>
                  <el-input-number
                    v-model="levelMin"
                    :min="1"
                    :max="999"
                    :controls="true"
                    controls-position=""
                    aria-label="最低等級"
                    class="filter-stepper filter-stepper--min"
                  />
                </label>
                <span class="filter-sep" aria-hidden="true">–</span>
                <label class="filter-stepper-cell">
                  <span class="filter-stepper-label">最高</span>
                  <el-input-number
                    v-model="levelMax"
                    :min="1"
                    :max="999"
                    :controls="true"
                    controls-position=""
                    aria-label="最高等級"
                    class="filter-stepper filter-stepper--max"
                  />
                </label>
                <input
                  v-model.number="levelMin"
                  type="number"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  max="999"
                  placeholder="1"
                  aria-label="最低等級"
                  class="m-level-input m-level-input--min"
                />
                <span class="m-level-sep" aria-hidden="true">—</span>
                <input
                  v-model.number="levelMax"
                  type="number"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  max="999"
                  placeholder="99"
                  aria-label="最高等級"
                  class="m-level-input m-level-input--max"
                />
              </div>
            </div>
          </div>

          <div class="dialog-results" v-loading="loading">
            <el-skeleton
              v-if="loading && allResults.length === 0"
              :rows="5"
              animated
            />
            <template v-else>
              <div
                v-for="row in filteredResults"
                :key="row.id"
                class="search-result-row"
              >
                <img v-if="row.icon" :src="row.icon" :alt="row.name" loading="lazy" decoding="async" class="result-icon" />
                <div class="result-info">
                  <div class="result-name">
                    <ItemName :item-id="row.itemId" :fallback="row.name" />
                  </div>
                  <div class="result-meta">Lv.{{ row.level }} · {{ row.job }}</div>
                </div>
                <el-button
                  size="small"
                  type="primary"
                  :loading="addingIds.has(row.id)"
                  @click="addRecipe(row)"
                >+</el-button>
              </div>
              <el-empty v-if="!loading && filteredResults.length === 0 && query.trim()" description="沒有找到配方" />
              <el-empty v-if="!loading && !query.trim()" description="輸入關鍵字搜尋配方" />
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-panel {
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: 72vh;
  max-height: 72dvh;
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--el-border-color-dark);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 20px 24px 0;
}

.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.dialog-search {
  padding: 16px 24px;
}

.dialog-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  margin-top: 10px;
}

.dialog-filters .filter-job {
  flex: 1 1 140px;
  min-width: 0;
}

.dialog-filters .filter-job :deep(.el-select__wrapper) {
  min-height: 40px;
}

/* Desktop: inline single segmented level stepper with Lv. prefix and dash. */
.filter-level-group {
  display: flex;
  align-items: stretch;
  gap: 4px;
  padding: 0 10px;
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  flex: 1 1 200px;
  min-width: 0;
  max-width: 100%;
  height: 40px;
}

.filter-level-prefix {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.filter-sep {
  display: inline-flex;
  align-items: center;
  font-size: 14px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}

.filter-stepper-cell {
  display: contents;
}

.filter-stepper-label {
  display: none;
}

/* Mobile-only inputs — hidden on desktop, shown via @media block below */
.m-level-input,
.m-level-sep {
  display: none;
}

.filter-stepper {
  flex: 1 1 0;
  min-width: 0;
  width: auto !important;
  height: 100%;
}

.filter-stepper :deep(.el-input__wrapper) {
  background: transparent;
  box-shadow: none !important;
  padding: 0;
}

.filter-stepper :deep(.el-input__inner) {
  text-align: center;
  padding: 0 4px;
  -moz-appearance: textfield;
}
.filter-stepper :deep(.el-input__inner::-webkit-outer-spin-button),
.filter-stepper :deep(.el-input__inner::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

.dialog-results {
  flex: 1;
  overflow-y: auto;
  padding: 0 24px 20px;
}

.search-result-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.search-result-row:last-child {
  border-bottom: none;
}

.result-icon {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  flex-shrink: 0;
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-size: 14px;
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.result-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.dialog-grab-area {
  display: none;
}

.dialog-grabber {
  display: block;
  width: 40px;
  height: 4px;
  border-radius: 999px;
  background: var(--el-border-color-dark);
  opacity: 0.7;
}

/* Transition (desktop: scale fade) */
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.25s;
}

.dialog-enter-active .dialog-panel,
.dialog-leave-active .dialog-panel {
  transition: transform 0.25s var(--ease-out-quart), opacity 0.25s;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}

.dialog-enter-from .dialog-panel,
.dialog-leave-to .dialog-panel {
  transform: scale(0.95);
  opacity: 0;
}

/* ====== Mobile: full-screen sheet anchored to bottom ====== */
@media (max-width: 640px) {
  .dialog-overlay {
    align-items: stretch;
    background: rgba(0, 0, 0, 0.5);
  }

  .dialog-panel {
    width: 100%;
    max-width: 100%;
    max-height: 100%;
    height: 100dvh;
    border-radius: 0;
    border: none;
    box-shadow: none;
    /* Grabber + header + sticky search + scrollable list */
    display: grid;
    grid-template-rows: auto auto auto 1fr;
    padding-top: env(safe-area-inset-top, 0px);
    overflow: hidden;
  }

  /* Grab handle: large invisible touch target, visible pill in the middle */
  .dialog-grab-area {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    margin-top: 4px;
    touch-action: none;
    cursor: grab;
  }
  .dialog-grab-area:active { cursor: grabbing; }

  .dialog-header {
    padding: 4px 16px 0;
  }

  .dialog-title {
    font-size: 16px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dialog-search {
    padding: 12px 16px;
    background: var(--app-bg);
    border-bottom: 1px solid var(--app-border);
  }

  /* Mobile filter: job select on its own row, then min level + max level
   * each on their own labelled row. The desktop's segmented card crams two
   * full +/- inputs into 358px which is impossible once mobile +/- buttons
   * grow to the WCAG 44×44 touch target. */
  .dialog-filters {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .dialog-filters .filter-job {
    flex: 0 0 auto;
    width: 100%;
  }
  .dialog-filters .filter-job :deep(.el-select__wrapper) {
    min-height: 44px;
  }

  /* Mobile redesign — match the job select visual class so the two filter
   * controls feel like siblings: same height, same surface, same border.
   * Single row: `Lv.` inline prefix · min input · dash · max input. */
  .filter-level-group {
    position: relative;
    flex: 0 0 auto;
    width: 100%;
    height: 44px;
    background: var(--el-fill-color-blank, transparent);
    border: 1px solid var(--el-border-color);
    border-radius: 8px;
    padding: 0 12px;
    overflow: hidden;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    align-items: center;
    gap: 4px;
  }

  /* Inline `Lv.` prefix — sits at the left like a label inside the input. */
  .filter-level-prefix {
    position: static;
    padding: 0 4px 0 0;
    background: transparent;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.02em;
    line-height: 1;
    z-index: auto;
  }

  /* Hide the desktop el-input-number cells AND the desktop dash separator
   * on mobile — we render native <input type="number"> instead for cleaner
   * type-to-edit UX. */
  .filter-stepper-cell,
  .filter-sep {
    display: none !important;
  }

  /* Show + style the mobile numeric inputs */
  .m-level-sep {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-placeholder);
    font-size: 14px;
    line-height: 1;
  }

  .m-level-input {
    display: block;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 4px;
    border: 0;
    background: transparent;
    color: var(--el-text-color-primary);
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    -moz-appearance: textfield;
    appearance: textfield;
  }
  .m-level-input::placeholder {
    color: var(--el-text-color-placeholder);
    font-weight: 500;
  }
  .m-level-input::-webkit-outer-spin-button,
  .m-level-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .m-level-input:focus {
    outline: none;
  }
  .m-level-input:focus-visible {
    outline: 2px solid var(--app-accent-light, var(--el-color-primary));
    outline-offset: -2px;
    border-radius: 4px;
  }

  .dialog-results {
    padding: 4px 16px;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }

  .search-result-row {
    gap: 12px;
    padding: 12px 0;
  }

  .result-icon {
    width: 40px;
    height: 40px;
  }

  .result-name {
    font-size: 15px;
  }

  /* Bigger touch target for the add button */
  .search-result-row :deep(.el-button) {
    min-width: 44px;
    min-height: 44px;
    padding: 0 12px;
    font-size: 18px;
    font-weight: 600;
    border-radius: 10px;
  }

  /* Slide up from the bottom on mobile */
  .dialog-enter-from .dialog-panel,
  .dialog-leave-to .dialog-panel {
    transform: translateY(100%);
    opacity: 1;
  }
}
</style>
