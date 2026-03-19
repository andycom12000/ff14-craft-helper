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
import { Picture } from '@element-plus/icons-vue'

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

// --- Lifecycle ---

onMounted(() => {
  document.addEventListener('paste', handlePaste)
})

onUnmounted(() => {
  document.removeEventListener('paste', handlePaste)
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  terminate()
})
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="從截圖匯入籌備任務"
    width="1100px"
    @close="handleClose"
    :close-on-click-modal="false"
  >
    <el-row :gutter="20">
      <!-- Left: Image panel -->
      <el-col :span="12">
        <div v-if="!imageUrl" class="drop-zone" @drop="handleDrop" @dragover="handleDragOver" @click="triggerFileSelect">
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
          style="width: 100%; margin-top: 12px;"
        >
          {{ isRecognizing ? '辨識中...' : '開始辨識' }}
        </el-button>

        <el-progress
          v-if="isRecognizing"
          :percentage="Math.round(ocrProgress * 100)"
          :stroke-width="4"
          style="margin-top: 8px;"
        />

        <div v-if="ocrLoading" class="loading-hint">
          首次使用需下載語言模型（約 10MB），請稍候...
        </div>
      </el-col>

      <!-- Right: Results panel -->
      <el-col :span="12">
        <el-table
          v-if="matchItems.length > 0"
          :data="matchItems"
          size="small"
          max-height="450"
        >
          <el-table-column width="40">
            <template #default="{ row }">
              <el-checkbox v-model="row.checked" :disabled="!row.selectedRecipe" />
            </template>
          </el-table-column>
          <el-table-column width="40">
            <template #default="{ row }">
              <img
                v-if="row.selectedRecipe?.icon"
                :src="row.selectedRecipe.icon"
                style="width: 24px; height: 24px; border-radius: 4px;"
              />
            </template>
          </el-table-column>
          <el-table-column label="物品名稱">
            <template #default="{ row }">
              <span>{{ row.ocrText }}</span>
              <span v-if="row.selectedRecipe && row.selectedRecipe.name !== row.ocrText" class="matched-name">
                → {{ row.selectedRecipe.name }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="100">
            <template #default="{ row }">
              <el-tag v-if="row.status === 'searching'" size="small">搜尋中</el-tag>
              <el-tag v-else-if="row.status === 'matched'" type="success" size="small">已配對</el-tag>
              <el-tag v-else-if="row.status === 'multiple'" type="warning" size="small">請選擇</el-tag>
              <el-tag v-else-if="row.status === 'not-found'" type="danger" size="small">未找到</el-tag>
              <el-tag v-else-if="row.status === 'error'" type="danger" size="small">錯誤</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="160">
            <template #default="{ row, $index }">
              <!-- Multiple exact matches: select by job -->
              <el-select
                v-if="row.status === 'multiple'"
                placeholder="選擇配方"
                size="small"
                @change="(id: number) => selectRecipe($index, id)"
              >
                <el-option
                  v-for="r in row.searchResults.slice(0, 20)"
                  :key="r.id"
                  :label="`${r.name} (${getJobName(r.job)})`"
                  :value="r.id"
                />
              </el-select>
              <!-- Not found: select from fuzzy results -->
              <el-select
                v-else-if="row.status === 'not-found' && row.searchResults.length > 0"
                placeholder="選擇配方"
                size="small"
                @change="(id: number) => selectRecipe($index, id)"
              >
                <el-option
                  v-for="r in row.searchResults.slice(0, 20)"
                  :key="r.id"
                  :label="`${r.name} (${getJobName(r.job)})`"
                  :value="r.id"
                />
              </el-select>
            </template>
          </el-table-column>
        </el-table>

        <el-empty v-else-if="!isRecognizing" description="貼上截圖並點擊「開始辨識」" :image-size="60" />
      </el-col>
    </el-row>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :disabled="!canAddToBatch" @click="addToBatch">
        加入批量清單
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
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

.loading-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 8px;
  text-align: center;
}

.matched-name {
  color: var(--el-color-success);
  font-size: 12px;
  margin-left: 4px;
}
</style>
