<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useOcrEngine } from '@/composables/useOcrEngine'
import { parseSupplyItems } from '@/utils/ocr-parser'
import { preprocessForOcr } from '@/utils/image-preprocess'
import { searchRecipes, getRecipe } from '@/api/xivapi'
import type { RecipeSearchResult } from '@/api/xivapi'
import type { Recipe } from '@/stores/recipe'
import { useBatchStore } from '@/stores/batch'
import { getJobName } from '@/utils/jobs'
import { Picture, Close } from '@element-plus/icons-vue'
import ItemName from '@/components/common/ItemName.vue'

interface OcrMatchItem {
  ocrText: string
  status: 'searching' | 'matched' | 'multiple' | 'not-found' | 'error'
  searchResults: RecipeSearchResult[]
  selectedRecipe: Recipe | null
  checked: boolean
}

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const batchStore = useBatchStore()
const { isLoading: ocrLoading, progress: ocrProgress, recognize, terminate } = useOcrEngine()

const isMobile = ref(false)
function updateIsMobile() {
  isMobile.value = window.innerWidth < 768
}
onMounted(updateIsMobile)

const imageBlob = ref<Blob | null>(null)
const imageUrl = ref('')
const isRecognizing = ref(false)
const isMatching = ref(false)
const matchItems = ref<OcrMatchItem[]>([])

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const canAddToBatch = computed(() =>
  matchItems.value.some(item => item.checked && item.selectedRecipe),
)

// --- Image input ---

function handlePaste(e: ClipboardEvent) {
  if (!props.modelValue) return
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) setImage(file)
      return
    }
  }
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files[0]
  if (file && file.type.startsWith('image/')) {
    setImage(file)
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    setImage(file)
    input.value = ''
  }
}

function setImage(blob: Blob) {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageBlob.value = blob
  imageUrl.value = URL.createObjectURL(blob)
  // Reset previous results
  matchItems.value = []
}

function clearImage() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageBlob.value = null
  imageUrl.value = ''
  matchItems.value = []
}

const fileInput = ref<HTMLInputElement>()

function triggerFileSelect() {
  fileInput.value?.click()
}

// --- OCR ---

async function startRecognize() {
  if (!imageBlob.value) return
  isRecognizing.value = true
  matchItems.value = []
  try {
    const processed = await preprocessForOcr(imageBlob.value)
    const rawText = await recognize(processed)
    const itemNames = parseSupplyItems(rawText)
    if (itemNames.length === 0) {
      ElMessage.warning('無法辨識任何物品名稱，請確認截圖清晰度')
      return
    }
    matchItems.value = itemNames.map(name => ({
      ocrText: name,
      status: 'searching',
      searchResults: [],
      selectedRecipe: null,
      checked: true,
    }))
    await matchRecipes()
  } catch (err) {
    ElMessage.error('OCR 辨識失敗：' + (err instanceof Error ? err.message : String(err)))
  } finally {
    isRecognizing.value = false
  }
}

// --- Recipe matching ---

async function matchRecipes() {
  isMatching.value = true
  // Throttle: max 3 concurrent API calls
  const queue = [...matchItems.value.entries()]
  const concurrency = 3
  const running: Promise<void>[] = []

  for (const [index, item] of queue) {
    const task = matchSingleItem(index, item)
    running.push(task)
    if (running.length >= concurrency) {
      await Promise.race(running)
      // Remove resolved promises
      for (let i = running.length - 1; i >= 0; i--) {
        // Use a settled check by wrapping
        const settled = await Promise.race([running[i].then(() => true), Promise.resolve(false)])
        if (settled) running.splice(i, 1)
      }
    }
  }
  await Promise.all(running)
  isMatching.value = false
}

async function matchSingleItem(index: number, item: OcrMatchItem) {
  try {
    // Generate search queries: full text, then progressively trimmed substrings
    const queries = generateSearchQueries(item.ocrText)
    const allResults: RecipeSearchResult[] = []
    const seenIds = new Set<number>()

    for (const query of queries) {
      if (query.length < 2) continue
      try {
        const results = await searchRecipes(query)
        for (const r of results) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id)
            allResults.push(r)
          }
        }
        // If we found exact match, stop searching
        if (results.some(r => r.name === item.ocrText)) break
        // If we have a result with good overlap, stop early
        const bestScore = allResults.reduce((max, r) => Math.max(max, combinedScore(item.ocrText, r.name)), 0)
        if (bestScore >= 0.5 && allResults.length >= 3) break
      } catch { /* try next query */ }
    }

    // Score results by combined LCS ratio + length similarity, store sorted
    const scored = allResults.map(r => ({ result: r, score: combinedScore(item.ocrText, r.name) }))
    scored.sort((a, b) => b.score - a.score)
    matchItems.value[index].searchResults = scored.map(s => s.result)

    const exactMatches = allResults.filter(r => r.name === item.ocrText)
    if (exactMatches.length === 1) {
      const recipe = await getRecipe(exactMatches[0].id)
      matchItems.value[index].selectedRecipe = recipe
      matchItems.value[index].status = 'matched'
    } else if (exactMatches.length > 1) {
      matchItems.value[index].status = 'multiple'
    } else if (scored.length > 0 && scored[0].score >= 0.35) {
      const best = scored[0].result
      // If top two candidates score nearly equal, let user choose
      const hasCloseRunner = scored.length > 1 && (scored[0].score - scored[1].score) < 0.05
      // High confidence + clear winner → auto-match; otherwise → let user confirm
      if (scored[0].score >= 0.65 && !hasCloseRunner) {
        const recipe = await getRecipe(best.id)
        matchItems.value[index].selectedRecipe = recipe
        matchItems.value[index].status = 'matched'
      } else {
        // Show as "multiple" so user can confirm or pick alternative
        matchItems.value[index].status = 'multiple'
      }
    } else {
      matchItems.value[index].status = 'not-found'
    }
  } catch {
    matchItems.value[index].status = 'error'
  }
}

/** Generate search queries from OCR text using sliding window + trimmed variants */
function generateSearchQueries(text: string): string[] {
  const queries: string[] = [text]
  const len = text.length

  // Trim ends (first/last chars often wrong due to icon artifacts)
  if (len > 3) queries.push(text.slice(1, -1))
  if (len > 4) queries.push(text.slice(1))
  if (len > 4) queries.push(text.slice(0, -1))
  if (len > 5) queries.push(text.slice(2, -1))
  if (len > 5) queries.push(text.slice(1, -2))

  // Sliding window of size 2, 3, 4 chars across the text
  const windowSizes = len > 6 ? [4, 3, 2] : len > 4 ? [3, 2] : [2]
  for (const ws of windowSizes) {
    for (let i = 0; i <= len - ws; i++) {
      queries.push(text.slice(i, i + ws))
    }
  }

  return [...new Set(queries)]
}

/** Combined score: LCS ratio (70%) + length similarity (30%) */
function combinedScore(ocrText: string, candidateName: string): number {
  const lcs = lcsRatio(ocrText, candidateName)
  const lenSim = 1 - Math.abs(ocrText.length - candidateName.length) / Math.max(ocrText.length, candidateName.length)
  return lcs * 0.7 + lenSim * 0.3
}

/** Longest Common Subsequence ratio — respects character order */
function lcsRatio(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0

  const prev = new Array(n + 1).fill(0)
  const curr = new Array(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1])
      }
    }
    for (let j = 0; j <= n; j++) {
      prev[j] = curr[j]
      curr[j] = 0
    }
  }
  return prev[n] / Math.max(m, n)
}

async function selectRecipe(index: number, recipeId: number) {
  try {
    const recipe = await getRecipe(recipeId)
    matchItems.value[index].selectedRecipe = recipe
    matchItems.value[index].status = 'matched'
  } catch {
    ElMessage.error('載入配方失敗')
  }
}

// --- Add to batch ---

function addToBatch() {
  let count = 0
  for (const item of matchItems.value) {
    if (item.checked && item.selectedRecipe) {
      batchStore.addTarget(item.selectedRecipe)
      count++
    }
  }
  ElMessage.success(`已加入 ${count} 個配方`)
  dialogVisible.value = false
}

function handleClose() {
  clearImage()
  matchItems.value = []
}

// ====== Mobile drag-to-dismiss on the dialog header ======
const dragOffset = ref(0)
const isDragging = ref(false)
let dragStartY = 0
let dragPointerId: number | null = null
let dialogEl: HTMLElement | null = null

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
}

function findDialogEl(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null
  while (el && !el.classList?.contains('ocr-dialog')) el = el.parentElement
  return el
}

function findOverlayEl(dialog: HTMLElement | null): HTMLElement | null {
  let el = dialog as HTMLElement | null
  while (el && !el.classList?.contains('el-overlay')) el = el.parentElement
  return el
}

let overlayEl: HTMLElement | null = null

function applyDragTransform() {
  if (!dialogEl) return
  if (dragOffset.value === 0 && !isDragging.value) {
    dialogEl.style.transform = ''
    dialogEl.style.transition = ''
    if (overlayEl) {
      overlayEl.style.opacity = ''
      overlayEl.style.transition = ''
    }
    return
  }
  dialogEl.style.transform = `translateY(${dragOffset.value}px)`
  dialogEl.style.transition = isDragging.value ? 'none' : 'transform 0.2s var(--ease-out-quart)'
  if (overlayEl) {
    const fade = Math.max(0, 1 - dragOffset.value / 400)
    overlayEl.style.opacity = String(fade)
    overlayEl.style.transition = isDragging.value ? 'none' : 'opacity 0.2s var(--ease-out-quart)'
  }
}

function onGrabPointerDown(e: PointerEvent) {
  if (!isMobileViewport()) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  dialogEl = findDialogEl(e.currentTarget)
  if (!dialogEl) return
  overlayEl = findOverlayEl(dialogEl)
  dragStartY = e.clientY
  dragPointerId = e.pointerId
  isDragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onGrabPointerMove(e: PointerEvent) {
  if (!isDragging.value || e.pointerId !== dragPointerId) return
  dragOffset.value = Math.max(0, e.clientY - dragStartY)
  applyDragTransform()
}

function onGrabPointerEnd(e: PointerEvent) {
  if (!isDragging.value || e.pointerId !== dragPointerId) return
  const triggered = dragOffset.value > 100
  isDragging.value = false
  dragPointerId = null
  if (triggered) {
    dragOffset.value = window.innerHeight
    applyDragTransform()
    setTimeout(() => {
      dragOffset.value = 0
      if (dialogEl) {
        dialogEl.style.transform = ''
        dialogEl.style.transition = ''
      }
      if (overlayEl) {
        overlayEl.style.opacity = ''
        overlayEl.style.transition = ''
      }
      dialogEl = null
      overlayEl = null
      dialogVisible.value = false
    }, 180)
  } else {
    dragOffset.value = 0
    applyDragTransform()
  }
}

// --- Lifecycle ---

onMounted(() => {
  document.addEventListener('paste', handlePaste)
  window.addEventListener('resize', updateIsMobile)
})

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste)
  window.removeEventListener('resize', updateIsMobile)
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  terminate()
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :width="isMobile ? '100%' : '1100px'"
    :fullscreen="isMobile"
    destroy-on-close
    class="ocr-dialog"
    @close="handleClose"
    :close-on-click-modal="false"
  >
    <template #header>
      <div
        v-if="isMobile"
        class="ocr-grab-area"
        @pointerdown="onGrabPointerDown"
        @pointermove="onGrabPointerMove"
        @pointerup="onGrabPointerEnd"
        @pointercancel="onGrabPointerEnd"
      >
        <span class="ocr-grabber" aria-hidden="true" />
      </div>
      <div class="ocr-header-bar">
        <h3 class="ocr-title">從截圖匯入籌備任務</h3>
        <button
          type="button"
          class="ocr-close-btn"
          aria-label="關閉視窗"
          @click="dialogVisible = false"
        >
          <el-icon :size="20"><Close /></el-icon>
        </button>
      </div>
    </template>
    <div class="ocr-body">
      <!-- Left: Image panel -->
      <div class="ocr-image-col">
        <div
          v-if="!imageUrl"
          class="drop-zone"
          role="button"
          tabindex="0"
          aria-label="上傳截圖：點擊選擇檔案、拖放或 Ctrl+V 貼上"
          @drop="handleDrop"
          @dragover="handleDragOver"
          @click="triggerFileSelect"
          @keydown.enter.prevent="triggerFileSelect"
          @keydown.space.prevent="triggerFileSelect"
        >
          <div class="drop-zone-content">
            <el-icon class="drop-zone-icon"><Picture /></el-icon>
            <div class="drop-zone-text">按 Ctrl+V 貼上截圖</div>
            <div class="drop-zone-hint">或拖放 / 點擊上傳圖片</div>
          </div>
        </div>
        <div v-else class="image-preview">
          <img :src="imageUrl" alt="截圖預覽" />
          <el-button size="small" text type="info" @click="clearImage" class="reselect-btn">
            重新選擇
          </el-button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="handleFileSelect" />

        <el-button
          type="primary"
          :disabled="!imageBlob || isRecognizing"
          :loading="isRecognizing"
          @click="startRecognize"
          class="recognize-btn"
        >
          {{ isRecognizing ? '辨識中...' : '開始辨識' }}
        </el-button>

        <el-progress
          v-if="isRecognizing"
          :percentage="Math.round(ocrProgress * 100)"
          :stroke-width="4"
          class="recognize-progress"
        />

        <div v-if="ocrLoading" class="loading-hint">
          首次使用需下載語言模型（約 10MB），請稍候...
        </div>
      </div>

      <!-- Right: Results panel -->
      <div class="ocr-results-col">
        <!-- Mobile/list-style card view (used on all viewports below the desktop table breakpoint) -->
        <ul v-if="matchItems.length > 0" class="ocr-match-list">
          <li v-for="(row, index) in matchItems" :key="index" class="ocr-match-card" :class="`is-${row.status}`">
            <div class="ocr-match-head">
              <el-checkbox v-model="row.checked" :disabled="!row.selectedRecipe" class="ocr-match-check" />
              <img
                v-if="row.selectedRecipe?.icon"
                :src="row.selectedRecipe.icon"
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                class="ocr-match-icon"
              />
              <div class="ocr-match-name">
                <div class="ocr-match-ocr-text">{{ row.ocrText }}</div>
                <div v-if="row.selectedRecipe && row.selectedRecipe.name !== row.ocrText" class="ocr-match-resolved">
                  → <ItemName :item-id="row.selectedRecipe.itemId" :fallback="row.selectedRecipe.name" />
                </div>
              </div>
              <el-tag v-if="row.status === 'searching'" size="small">搜尋中</el-tag>
              <el-tag v-else-if="row.status === 'matched'" type="success" size="small">已配對</el-tag>
              <el-tag v-else-if="row.status === 'multiple'" type="warning" size="small">請選擇</el-tag>
              <el-tag v-else-if="row.status === 'not-found'" type="danger" size="small">未找到</el-tag>
              <el-tag v-else-if="row.status === 'error'" type="danger" size="small">錯誤</el-tag>
            </div>
            <el-select
              v-if="row.status === 'multiple' || (row.status === 'not-found' && row.searchResults.length > 0)"
              placeholder="選擇配方"
              size="default"
              class="ocr-match-select"
              @change="(id: number) => selectRecipe(index, id)"
            >
              <el-option
                v-for="r in row.searchResults.slice(0, 20)"
                :key="r.id"
                :label="`${r.name} (${getJobName(r.job)})`"
                :value="r.id"
              />
            </el-select>
          </li>
        </ul>

        <el-empty v-else-if="!isRecognizing" description="貼上截圖並點擊「開始辨識」" :image-size="60" />
      </div>
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :disabled="!canAddToBatch" @click="addToBatch">
        加入批量清單
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.ocr-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.drop-zone {
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover {
  border-color: var(--el-color-primary);
}

.drop-zone:focus-visible {
  outline: 2px solid var(--app-accent-light);
  outline-offset: 2px;
  border-color: var(--el-color-primary);
}

.drop-zone-icon {
  font-size: 36px;
  margin-bottom: 8px;
}

.drop-zone-text {
  font-size: 14px;
  color: var(--el-text-color-regular);
  margin-bottom: 4px;
}

.drop-zone-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.image-preview {
  position: relative;
  text-align: center;
}

.image-preview img {
  max-width: 100%;
  max-height: 500px;
  border-radius: 8px;
  object-fit: contain;
}

.reselect-btn {
  position: absolute;
  top: 4px;
  right: 4px;
}

.recognize-btn {
  width: 100%;
  margin-top: 12px;
}

.recognize-progress {
  margin-top: 8px;
}

.loading-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
  text-align: center;
}

/* Match cards (used on all viewports) */
.ocr-match-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 460px;
  overflow-y: auto;
}

.ocr-match-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--app-border, var(--el-border-color-lighter));
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.ocr-match-card.is-not-found,
.ocr-match-card.is-error {
  border-color: color-mix(in srgb, var(--el-color-danger) 30%, transparent);
}

.ocr-match-card.is-multiple {
  border-color: color-mix(in srgb, var(--el-color-warning) 30%, transparent);
}

.ocr-match-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ocr-match-check {
  flex-shrink: 0;
}

.ocr-match-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  flex-shrink: 0;
}

.ocr-match-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.ocr-match-ocr-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocr-match-resolved {
  font-size: 12px;
  color: var(--el-color-success);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ocr-match-select {
  width: 100%;
}

/* Default header layout — desktop uses the standard el-dialog title row,
   so this only matters on mobile where we replaced the header. */
.ocr-grab-area { display: none; }
.ocr-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ocr-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.ocr-close-btn {
  width: 36px;
  height: 36px;
  border: 0;
  background: transparent;
  color: var(--el-text-color-secondary);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.ocr-close-btn:hover {
  background: var(--el-fill-color);
  color: var(--el-text-color-primary);
}

@media (max-width: 640px) {
  /* Stack image / results vertically on mobile */
  .ocr-body {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  /* Image preview must not steal space from the rest of the dialog */
  .image-preview img {
    max-height: 32dvh;
  }

  .drop-zone {
    min-height: 140px;
    padding: 24px 16px;
  }

  /* Match cards take full width — el-table replaced with card list,
   * so no horizontal-table overflow concerns. */
  .ocr-match-list {
    max-height: none;
  }

  /* Drag handle on mobile.
   * el-dialog__header has its own padding, but we want a wide invisible
   * touch target spanning the full header row, with the visible pill
   * centered absolutely so it never drifts. */
  .ocr-grab-area {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    margin: 4px 0;
    touch-action: none;
    cursor: grab;
  }
  .ocr-grab-area:active { cursor: grabbing; }
  .ocr-grabber {
    display: block;
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: var(--el-border-color-dark);
    opacity: 0.7;
  }

  .ocr-title { font-size: 16px; }
}
</style>

<style>
/* Reach the teleported el-dialog markup. Our #header slot already provides
   a close button, so hide the default headerbtn to avoid duplicate Xs. */
.ocr-dialog .el-dialog__headerbtn { display: none; }
.ocr-dialog .el-dialog__header { padding-bottom: 8px; margin-right: 0; }

/* Mobile: full-screen dialog should have a sticky footer so its action
 * buttons remain reachable no matter how tall the body content gets. */
@media (max-width: 640px) {
  .ocr-dialog.is-fullscreen .el-dialog__header {
    padding: 4px 16px 8px;
    margin-right: 0;
  }
  .ocr-dialog.is-fullscreen {
    display: flex;
    flex-direction: column;
    height: 100dvh;
  }
  .ocr-dialog.is-fullscreen .el-dialog__body {
    flex: 1 1 auto;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 8px 16px 16px;
    -webkit-overflow-scrolling: touch;
  }
  .ocr-dialog.is-fullscreen .el-dialog__footer {
    flex-shrink: 0;
    padding: 12px 16px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--app-border, var(--el-border-color-lighter));
    background: var(--el-bg-color);
  }
}
</style>
