<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
// AutoImport's ElementPlusResolver only injects CSS for symbols it auto-imports.
// Explicit imports must declare the style side-effect manually.
import 'element-plus/es/components/message/style/css'
import { Close, QuestionFilled, ArrowDown } from '@element-plus/icons-vue'
import {
  useCustomRecipes,
  type CustomRecipeForm,
  CustomRecipeStorageError,
} from '@/composables/useCustomRecipes'
import { JOB_NAMES, JOB_ORDER, getJobLabel } from '@/utils/jobs'
import type { Recipe } from '@/stores/recipe'

// Number-input fields that map 1:1 between RltRecord and CustomRecipeForm.
// Used by applyJson to copy without 9 hand-rolled if-statements per direction.
const RLT_KEYS = [
  'level', 'difficulty', 'quality', 'durability',
  'progressDivider', 'qualityDivider', 'progressModifier', 'qualityModifier',
] as const

const POSITIVE_INT_BLOCKED_KEYS = new Set(['e', 'E', '+', '-', '.', ','])

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'enqueue': [recipe: Recipe]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const { customRecipes, save, remove, lookupRlv, buildRecipe, emptyForm } = useCustomRecipes()

const form = ref<CustomRecipeForm>(emptyForm())
const editingExistingId = ref<string | null>(null)
const rlvLookupState = ref<'idle' | 'pending' | 'hit' | 'miss'>('idle')
const advancedOpen = ref(false)
const inputMode = ref<'form' | 'json'>('form')
const jsonText = ref('')
const jsonError = ref('')
const errors = ref<Record<string, string>>({})

const panelRef = ref<HTMLElement>()
const firstFieldRef = ref<HTMLInputElement>()

watch(dialogVisible, (open) => {
  if (open) {
    resetForm()
    nextTick(() => firstFieldRef.value?.focus())
  }
  if (typeof document !== 'undefined') {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

onUnmounted(() => {
  if (typeof document !== 'undefined') document.body.style.overflow = ''
  if (dismissTimer != null) {
    clearTimeout(dismissTimer)
    dismissTimer = null
  }
})

function resetForm() {
  form.value = emptyForm()
  editingExistingId.value = null
  rlvLookupState.value = 'idle'
  advancedOpen.value = false
  inputMode.value = 'form'
  jsonText.value = ''
  jsonError.value = ''
  errors.value = {}
}

function loadExisting(entry: CustomRecipeForm) {
  form.value = { ...entry }
  editingExistingId.value = entry.id
  errors.value = {}
  if (entry.rlv > 0) runRlvLookup()
  else rlvLookupState.value = 'idle'
  advancedOpen.value =
    entry.progressDivider > 0 || entry.qualityDivider > 0 ||
    entry.progressModifier > 0 || entry.qualityModifier > 0
}

async function runRlvLookup() {
  if (rlvLookupState.value === 'pending') return
  if (!form.value.rlv || form.value.rlv <= 0) {
    rlvLookupState.value = 'idle'
    return
  }
  rlvLookupState.value = 'pending'
  const record = await lookupRlv(form.value.rlv)
  if (record) {
    form.value.level = record.classJobLevel
    for (const k of RLT_KEYS) {
      if (k === 'level') continue
      form.value[k] = record[k]
    }
    rlvLookupState.value = 'hit'
    advancedOpen.value = false
  } else {
    rlvLookupState.value = 'miss'
    advancedOpen.value = true
  }
}

const POSITIVE_INT_FIELDS: { key: keyof CustomRecipeForm; label: string }[] = [
  { key: 'rlv', label: 'rlv' },
  { key: 'level', label: '製作等級' },
  { key: 'difficulty', label: '難度' },
  { key: 'quality', label: '品質' },
  { key: 'durability', label: '耐久' },
  { key: 'progressDivider', label: 'Progress Divider' },
  { key: 'qualityDivider', label: 'Quality Divider' },
  { key: 'progressModifier', label: 'Progress Modifier' },
  { key: 'qualityModifier', label: 'Quality Modifier' },
]

function computeErrors(f: CustomRecipeForm): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.name.trim()) e.name = '請輸入配方名稱'
  if (!f.job) e.job = '請選擇職業'
  for (const { key, label } of POSITIVE_INT_FIELDS) {
    const v = f[key] as number
    if (!v || v <= 0) e[key] = `${label} 必須是正整數`
  }
  return e
}

function validate(): boolean {
  errors.value = computeErrors(form.value)
  return Object.keys(errors.value).length === 0
}

const isValid = computed(() => Object.keys(computeErrors(form.value)).length === 0)

function trySave(): CustomRecipeForm | null {
  const wasEditing = editingExistingId.value != null
  try {
    const saved = save({ ...form.value, id: editingExistingId.value ?? form.value.id })
    editingExistingId.value = saved.id
    ElMessage.success(wasEditing ? '已更新自訂配方' : '已儲存自訂配方')
    return saved
  } catch (err) {
    if (err instanceof CustomRecipeStorageError) {
      ElMessage.error(err.message)
    } else {
      ElMessage.error('儲存失敗')
    }
    return null
  }
}

async function handlePrimary() {
  // Enter on rlv input may submit before blur fires, so run lookup first to
  // back-fill advanced fields rather than fail validation on them.
  if (form.value.rlv > 0 && rlvLookupState.value === 'idle') {
    await runRlvLookup()
  }
  if (!validate()) {
    ElMessage.warning('請先填好必填欄位')
    return
  }
  const saved = trySave()
  if (!saved) return
  const recipe = buildRecipe(form.value)
  emit('enqueue', recipe)
  close()
}

function handleSaveOnly() {
  if (!validate()) {
    ElMessage.warning('請先填好必填欄位')
    return
  }
  trySave()
}

function handleDelete(entry: CustomRecipeForm) {
  try {
    remove(entry.id)
    if (editingExistingId.value === entry.id) resetForm()
    ElMessage.success('已刪除')
  } catch (err) {
    ElMessage.error(err instanceof CustomRecipeStorageError ? err.message : '刪除失敗')
  }
}

function handleNew() {
  resetForm()
}

function selectJob(abbr: string) {
  form.value.job = abbr
}

interface ParsedJson {
  level?: number
  stars?: number
  difficulty?: number
  quality?: number
  durability?: number
  progressDivider?: number
  qualityDivider?: number
  progressModifier?: number
  qualityModifier?: number
  rlv?: number
}

/* Accept either camelCase (our internal shape / XIVAPI v2) or PascalCase
   (FFXIV CSV / common wiki dumps). Returns the fields we recognised; ignores
   the rest so users can paste a full row without scrubbing it. */
function parseJsonPayload(text: string): ParsedJson | string {
  const trimmed = text.trim()
  if (!trimmed) return '請貼上 JSON'
  let obj: Record<string, unknown>
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return 'JSON 必須是物件（{ … }）'
    }
    obj = parsed as Record<string, unknown>
  } catch {
    return 'JSON 格式錯誤，請檢查括號與引號'
  }
  const num = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = obj[k]
      if (typeof v === 'number' && Number.isFinite(v)) return v
      if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v)
    }
    return undefined
  }
  const result: ParsedJson = {
    rlv: num('rlv', 'recipeLevel', 'RecipeLevel', 'recipe_level'),
    level: num('classJobLevel', 'ClassJobLevel', 'level', 'Level'),
    stars: num('stars', 'Stars'),
    difficulty: num('difficulty', 'Difficulty'),
    quality: num('quality', 'Quality'),
    durability: num('durability', 'Durability'),
    progressDivider: num('progressDivider', 'ProgressDivider', 'progress_divider'),
    qualityDivider: num('qualityDivider', 'QualityDivider', 'quality_divider'),
    progressModifier: num('progressModifier', 'ProgressModifier', 'progress_modifier'),
    qualityModifier: num('qualityModifier', 'QualityModifier', 'quality_modifier'),
  }
  const matched = Object.values(result).filter(v => v !== undefined).length
  if (matched === 0) return '解析成功但找不到 RecipeLevelTable 欄位（如 difficulty / quality / durability）'
  return result
}

async function applyJson() {
  const result = parseJsonPayload(jsonText.value)
  if (typeof result === 'string') {
    jsonError.value = result
    return
  }
  jsonError.value = ''
  const f = form.value
  if (result.rlv != null) f.rlv = result.rlv
  if (result.stars != null) f.stars = result.stars
  for (const k of RLT_KEYS) {
    if (result[k] != null) f[k] = result[k]!
  }
  if (result.progressDivider || result.qualityDivider ||
      result.progressModifier || result.qualityModifier) {
    advancedOpen.value = true
  }
  // User-pasted values win. rlv lookup only back-fills fields the JSON omitted.
  if (f.rlv > 0) {
    rlvLookupState.value = 'pending'
    const record = await lookupRlv(f.rlv)
    if (record) {
      for (const k of RLT_KEYS) {
        if (result[k] == null) f[k] = k === 'level' ? record.classJobLevel : record[k]
      }
      rlvLookupState.value = 'hit'
    } else {
      rlvLookupState.value = 'miss'
      advancedOpen.value = true
    }
  }
  inputMode.value = 'form'
  ElMessage.success('已匯入 JSON 欄位')
}

function clearJson() {
  jsonText.value = ''
  jsonError.value = ''
}

function onPositiveIntKeydown(e: KeyboardEvent) {
  if (POSITIVE_INT_BLOCKED_KEYS.has(e.key)) {
    e.preventDefault()
  }
}

function onPositiveIntPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') ?? ''
  if (text && !/^\s*\d+\s*$/.test(text)) {
    e.preventDefault()
    ElMessage.warning('只接受正整數')
  }
}

function close() {
  emit('update:modelValue', false)
}

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
      'input:not([disabled]), button:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(el => el.offsetParent !== null)
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

const dragOffset = ref(0)
const isDragging = ref(false)
const isMobileViewport = () =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches

let dragStartY = 0
let dragPointerId: number | null = null
let dismissTimer: ReturnType<typeof setTimeout> | null = null

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
  dragOffset.value = Math.max(0, delta)
}

function onGrabPointerEnd(e: PointerEvent) {
  if (!isDragging.value || e.pointerId !== dragPointerId) return
  const target = e.currentTarget as HTMLElement | null
  target?.releasePointerCapture?.(e.pointerId)
  const triggered = dragOffset.value > 100
  isDragging.value = false
  dragPointerId = null
  if (triggered) {
    dragOffset.value = window.innerHeight
    if (dismissTimer != null) clearTimeout(dismissTimer)
    dismissTimer = setTimeout(() => {
      dismissTimer = null
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
  const fade = Math.max(0, 1 - dragOffset.value / 400)
  return { opacity: fade }
})

const primaryLabel = computed(() =>
  editingExistingId.value ? '更新並加入佇列' : '儲存並加入佇列',
)
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="dialogVisible"
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
          aria-labelledby="custom-recipe-title"
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

          <div class="cr-header">
            <div class="cr-header-text">
              <h3 id="custom-recipe-title" class="cr-title">自訂配方</h3>
              <p class="cr-subtitle">適用於資料源尚未同步新版配方時</p>
            </div>
            <button
              type="button"
              class="cr-close"
              aria-label="關閉視窗"
              @click="close"
            >
              <el-icon :size="18"><Close /></el-icon>
            </button>
          </div>

          <form class="cr-form" @submit.prevent="handlePrimary">
            <div class="cr-body">
              <!-- Saved recipes -->
              <section v-if="customRecipes.length > 0" class="cr-saved">
                <header class="cr-saved-head">
                  <span class="cr-saved-label">我的自訂配方</span>
                  <button
                    v-if="editingExistingId"
                    type="button"
                    class="cr-saved-new"
                    @click="handleNew"
                  >+ 新增</button>
                </header>
                <ul class="cr-saved-list" role="list">
                  <li
                    v-for="entry in customRecipes"
                    :key="entry.id"
                    class="cr-saved-item"
                    :class="{ 'is-active': editingExistingId === entry.id }"
                    role="button"
                    tabindex="0"
                    @click="loadExisting(entry)"
                    @keydown.enter.prevent="loadExisting(entry)"
                    @keydown.space.prevent="loadExisting(entry)"
                  >
                    <span class="cr-saved-name">{{ entry.name || '未命名配方' }}</span>
                    <span class="cr-saved-meta">
                      <span class="cr-saved-meta-job">{{ JOB_NAMES[entry.job] ?? entry.job }}</span>
                      <span class="cr-saved-meta-sep" aria-hidden="true">·</span>
                      <span class="cr-saved-meta-rlv">rlv {{ entry.rlv }}</span>
                    </span>
                    <el-popconfirm
                      :title="`要刪除「${entry.name || '未命名配方'}」嗎？`"
                      confirm-button-text="刪除"
                      cancel-button-text="取消"
                      confirm-button-type="danger"
                      width="220"
                      @confirm="handleDelete(entry)"
                    >
                      <template #reference>
                        <button
                          type="button"
                          class="cr-saved-remove"
                          aria-label="刪除"
                          @click.stop
                        >✕</button>
                      </template>
                    </el-popconfirm>
                  </li>
                </ul>
              </section>

              <div class="cr-mode-switch" role="tablist" aria-label="輸入方式">
                <span
                  class="cr-mode-switch-thumb"
                  :data-mode="inputMode"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  role="tab"
                  class="cr-mode-switch-option"
                  :class="{ 'is-active': inputMode === 'form' }"
                  :aria-selected="inputMode === 'form'"
                  @click="inputMode = 'form'"
                >填表</button>
                <button
                  type="button"
                  role="tab"
                  class="cr-mode-switch-option"
                  :class="{ 'is-active': inputMode === 'json' }"
                  :aria-selected="inputMode === 'json'"
                  @click="inputMode = 'json'"
                >貼 JSON</button>
              </div>

              <section v-show="inputMode === 'json'" class="cr-section cr-section--json">
                <textarea
                  v-model="jsonText"
                  class="cr-json-input"
                  rows="8"
                  spellcheck="false"
                  placeholder="貼上 RecipeLevelTable JSON，例如：&#10;{&#10;  &quot;classJobLevel&quot;: 100,&#10;  &quot;stars&quot;: 4,&#10;  &quot;difficulty&quot;: 9000,&#10;  &quot;quality&quot;: 40000,&#10;  &quot;durability&quot;: 80,&#10;  &quot;progressDivider&quot;: 180,&#10;  &quot;qualityDivider&quot;: 180,&#10;  &quot;progressModifier&quot;: 80,&#10;  &quot;qualityModifier&quot;: 70&#10;}"
                />
                <div class="cr-json-actions">
                  <span v-if="jsonError" class="cr-err cr-json-err">{{ jsonError }}</span>
                  <button type="button" class="cr-btn cr-btn--ghost cr-btn--sm" @click="clearJson">清除</button>
                  <button type="button" class="cr-btn cr-btn--secondary cr-btn--sm" :disabled="!jsonText.trim()" @click="applyJson">套用</button>
                </div>
                <p class="cr-advanced-note">
                  支援 camelCase / PascalCase 欄位名（例如 <code>difficulty</code> 或 <code>Difficulty</code>），未命中的欄位會被忽略。
                </p>
              </section>

              <section v-show="inputMode === 'form'" class="cr-section">
                <h4 class="cr-section-title">配方參數</h4>

                <div class="cr-field cr-field--name">
                  <label class="cr-label" for="cr-name">名稱</label>
                  <input
                    id="cr-name"
                    ref="firstFieldRef"
                    v-model="form.name"
                    type="text"
                    class="cr-input"
                    :class="{ 'has-error': errors.name }"
                    placeholder="例如：7.2 木匠粗梳板"
                    maxlength="40"
                  />
                  <span v-if="errors.name" class="cr-err">{{ errors.name }}</span>
                </div>

                <div class="cr-field">
                  <label class="cr-label">職業</label>
                  <el-dropdown trigger="click" placement="bottom-start" @command="selectJob">
                    <button type="button" class="cr-job-trigger">
                      <span class="cr-job-trigger-label">{{ getJobLabel(form.job) }}</span>
                      <el-icon class="cr-job-trigger-chev" :size="14"><ArrowDown /></el-icon>
                    </button>
                    <template #dropdown>
                      <el-dropdown-menu>
                        <el-dropdown-item
                          v-for="abbr in JOB_ORDER"
                          :key="abbr"
                          :command="abbr"
                          :class="{ 'is-active': form.job === abbr }"
                        >
                          {{ getJobLabel(abbr) }}
                        </el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </div>

                <div class="cr-field-row">
                  <div class="cr-field cr-field--small">
                    <label class="cr-label cr-label--with-help" for="cr-rlv">
                      <span>rlv</span>
                      <el-tooltip
                        placement="top"
                        :show-after="200"
                        content="配方等級表 ID（rlv，Recipe Level Table key）。來自遊戲 RecipeLevelTable，與「製作等級」是不同的數值——例如 Lv100 ★4 對應 rlv 720。輸入後會自動帶入下方四個進階參數。"
                      >
                        <el-icon class="cr-label-help" :size="13"><QuestionFilled /></el-icon>
                      </el-tooltip>
                    </label>
                    <div class="cr-rlv-row">
                      <input
                        id="cr-rlv"
                        v-model.number="form.rlv"
                        type="number"
                        inputmode="numeric"
                        class="cr-input cr-input--num"
                        :class="{ 'has-error': errors.rlv }"
                        min="1"
                        @blur="runRlvLookup"
                        @keydown="onPositiveIntKeydown"
                        @paste="onPositiveIntPaste"
                      />
                      <span
                        v-if="rlvLookupState === 'hit'"
                        class="cr-rlv-hint cr-rlv-hint--hit"
                      >✓ 已載入進階參數</span>
                      <span
                        v-else-if="rlvLookupState === 'miss'"
                        class="cr-rlv-hint cr-rlv-hint--miss"
                      >⚠ 本地無資料，需手動填</span>
                      <span v-else-if="rlvLookupState === 'pending'" class="cr-rlv-hint">查詢中…</span>
                    </div>
                    <span v-if="errors.rlv" class="cr-err">{{ errors.rlv }}</span>
                  </div>

                  <div class="cr-field cr-field--small">
                    <label class="cr-label" for="cr-level">製作等級</label>
                    <input
                      id="cr-level"
                      v-model.number="form.level"
                      type="number"
                      inputmode="numeric"
                      class="cr-input cr-input--num"
                      :class="{ 'has-error': errors.level }"
                      min="1"
                      @keydown="onPositiveIntKeydown"
                      @paste="onPositiveIntPaste"
                    />
                    <span v-if="errors.level" class="cr-err">{{ errors.level }}</span>
                  </div>

                  <div class="cr-field cr-field--small">
                    <label class="cr-label" for="cr-stars">星數</label>
                    <input
                      id="cr-stars"
                      v-model.number="form.stars"
                      type="number"
                      inputmode="numeric"
                      class="cr-input cr-input--num"
                      min="0"
                      max="5"
                      @keydown="onPositiveIntKeydown"
                      @paste="onPositiveIntPaste"
                    />
                  </div>
                </div>

                <label class="cr-checkbox">
                  <input v-model="form.canHq" type="checkbox" />
                  <span>此配方可 HQ</span>
                </label>
              </section>

              <section v-show="inputMode === 'form'" class="cr-section">
                <h4 class="cr-section-title">三大值</h4>
                <div class="cr-field-row">
                  <div class="cr-field cr-field--small">
                    <label class="cr-label" for="cr-difficulty">難度</label>
                    <input
                      id="cr-difficulty"
                      v-model.number="form.difficulty"
                      type="number"
                      inputmode="numeric"
                      class="cr-input cr-input--num"
                      :class="{ 'has-error': errors.difficulty }"
                      min="1"
                      @keydown="onPositiveIntKeydown"
                      @paste="onPositiveIntPaste"
                    />
                    <span v-if="errors.difficulty" class="cr-err">{{ errors.difficulty }}</span>
                  </div>

                  <div class="cr-field cr-field--small">
                    <label class="cr-label" for="cr-quality">品質</label>
                    <input
                      id="cr-quality"
                      v-model.number="form.quality"
                      type="number"
                      inputmode="numeric"
                      class="cr-input cr-input--num"
                      :class="{ 'has-error': errors.quality }"
                      min="1"
                      @keydown="onPositiveIntKeydown"
                      @paste="onPositiveIntPaste"
                    />
                    <span v-if="errors.quality" class="cr-err">{{ errors.quality }}</span>
                  </div>

                  <div class="cr-field cr-field--small">
                    <label class="cr-label" for="cr-durability">耐久</label>
                    <input
                      id="cr-durability"
                      v-model.number="form.durability"
                      type="number"
                      inputmode="numeric"
                      class="cr-input cr-input--num"
                      :class="{ 'has-error': errors.durability }"
                      min="1"
                      @keydown="onPositiveIntKeydown"
                      @paste="onPositiveIntPaste"
                    />
                    <span v-if="errors.durability" class="cr-err">{{ errors.durability }}</span>
                  </div>
                </div>
              </section>

              <section v-show="inputMode === 'form'" class="cr-section">
                <button
                  type="button"
                  class="cr-advanced-toggle"
                  :class="{ 'is-open': advancedOpen, 'is-required': rlvLookupState === 'miss' }"
                  :aria-expanded="advancedOpen"
                  @click="advancedOpen = !advancedOpen"
                >
                  <span class="cr-chev" :class="{ 'is-open': advancedOpen }">▸</span>
                  <span>進階參數</span>
                  <span v-if="rlvLookupState === 'hit'" class="cr-advanced-hint">已由 rlv 帶入</span>
                  <span v-else-if="rlvLookupState === 'miss'" class="cr-advanced-hint cr-advanced-hint--required">必填</span>
                </button>
                <div v-if="advancedOpen" class="cr-advanced-body">
                  <div class="cr-field-row">
                    <div class="cr-field cr-field--small">
                      <label class="cr-label" for="cr-pdiv">Progress Divider</label>
                      <input
                        id="cr-pdiv"
                        v-model.number="form.progressDivider"
                        type="number"
                        inputmode="numeric"
                        class="cr-input cr-input--num"
                        :class="{ 'has-error': errors.progressDivider }"
                        min="1"
                        @keydown="onPositiveIntKeydown"
                        @paste="onPositiveIntPaste"
                      />
                      <span v-if="errors.progressDivider" class="cr-err">{{ errors.progressDivider }}</span>
                    </div>

                    <div class="cr-field cr-field--small">
                      <label class="cr-label" for="cr-qdiv">Quality Divider</label>
                      <input
                        id="cr-qdiv"
                        v-model.number="form.qualityDivider"
                        type="number"
                        inputmode="numeric"
                        class="cr-input cr-input--num"
                        :class="{ 'has-error': errors.qualityDivider }"
                        min="1"
                        @keydown="onPositiveIntKeydown"
                        @paste="onPositiveIntPaste"
                      />
                      <span v-if="errors.qualityDivider" class="cr-err">{{ errors.qualityDivider }}</span>
                    </div>
                  </div>
                  <div class="cr-field-row">
                    <div class="cr-field cr-field--small">
                      <label class="cr-label" for="cr-pmod">Progress Modifier</label>
                      <input
                        id="cr-pmod"
                        v-model.number="form.progressModifier"
                        type="number"
                        inputmode="numeric"
                        class="cr-input cr-input--num"
                        :class="{ 'has-error': errors.progressModifier }"
                        min="1"
                        @keydown="onPositiveIntKeydown"
                        @paste="onPositiveIntPaste"
                      />
                      <span v-if="errors.progressModifier" class="cr-err">{{ errors.progressModifier }}</span>
                    </div>

                    <div class="cr-field cr-field--small">
                      <label class="cr-label" for="cr-qmod">Quality Modifier</label>
                      <input
                        id="cr-qmod"
                        v-model.number="form.qualityModifier"
                        type="number"
                        inputmode="numeric"
                        class="cr-input cr-input--num"
                        :class="{ 'has-error': errors.qualityModifier }"
                        min="1"
                        @keydown="onPositiveIntKeydown"
                        @paste="onPositiveIntPaste"
                      />
                      <span v-if="errors.qualityModifier" class="cr-err">{{ errors.qualityModifier }}</span>
                    </div>
                  </div>
                  <p class="cr-advanced-note">
                    這四個值決定模擬器的進度／品質計算精度。可從遊戲內配方介面或 wiki RecipeLevelTable 抄。
                  </p>
                </div>
              </section>
            </div>

            <div class="cr-footer">
              <button type="button" class="cr-btn cr-btn--ghost" @click="close">取消</button>
              <button
                type="button"
                class="cr-btn cr-btn--secondary"
                :disabled="!isValid"
                @click="handleSaveOnly"
              >僅儲存</button>
              <button
                type="submit"
                class="cr-btn cr-btn--primary"
                :disabled="!isValid"
              >{{ primaryLabel }}</button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Teleport overlay matches RecipeSearchSidebar's pattern. */
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
  width: 600px;
  max-width: calc(100vw - 32px);
  max-height: 86vh;
  max-height: 86dvh;
  background: var(--app-bg);
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--el-border-color-dark);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
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
.dialog-leave-active { transition: opacity 0.25s; }
.dialog-enter-active .dialog-panel,
.dialog-leave-active .dialog-panel {
  transition: transform 0.25s var(--ease-out-quart), opacity 0.25s;
}
.dialog-enter-from,
.dialog-leave-to { opacity: 0; }
.dialog-enter-from .dialog-panel,
.dialog-leave-to .dialog-panel { transform: scale(0.95); opacity: 0; }

/* ====== Header ====== */
.cr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 24px 0;
}
.cr-header-text { min-width: 0; }
.cr-title {
  margin: 0;
  font-family: 'Noto Serif TC', serif;
  font-size: 18px;
  font-weight: 700;
  color: var(--app-text);
  letter-spacing: 0.01em;
}
.cr-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--app-text-muted);
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic;
}
.cr-close {
  width: 32px;
  height: 32px;
  border: 0;
  background: transparent;
  color: var(--app-text-muted);
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cr-close:hover {
  background: var(--app-hover);
  color: var(--app-text);
}

/* ====== Form / Body ====== */
.cr-form {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.cr-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 24px 8px;
}

/* ====== Saved list ====== */
.cr-saved {
  padding: 0 0 14px;
  border-bottom: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.cr-saved-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cr-saved-label {
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-muted);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.cr-saved-new {
  background: transparent;
  border: 0;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--app-craft);
  cursor: pointer;
  border-radius: 6px;
}
.cr-saved-new:hover { background: color-mix(in srgb, var(--app-craft) 10%, transparent); }
.cr-saved-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cr-saved-item {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--app-surface);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.12s ease-out;
}
.cr-saved-item:hover { background: var(--app-hover); }
.cr-saved-item.is-active { background: color-mix(in srgb, var(--app-craft) 14%, transparent); }
.cr-saved-item:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.cr-saved-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
/* CJK chars use sans, rlv numerics use mono — kept separate so monospace
   doesn't squash Chinese glyphs in the same span. */
.cr-saved-meta {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  color: var(--app-text-muted);
}
.cr-saved-meta-job {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
}
.cr-saved-meta-sep {
  font-family: 'Noto Sans TC', system-ui, sans-serif;
}
.cr-saved-meta-rlv {
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.04em;
}
.cr-saved-remove {
  width: 22px;
  height: 22px;
  background: transparent;
  border: 0;
  color: var(--app-text-muted);
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
}
.cr-saved-remove:hover { background: var(--app-hover); color: var(--app-danger, oklch(0.55 0.20 25)); }

/* Segmented input-mode switch — recessed cocoa track, raised pill that
   slides between "manual form" and "paste JSON". Mirrors SimulatorView's
   .mode-switch idiom so the dialog feels native to the simulator. */
.cr-mode-switch {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
  background: color-mix(in srgb, var(--app-craft) 10%, var(--app-surface));
  border: 1px solid color-mix(in srgb, var(--app-craft) 16%, var(--app-border));
  border-radius: 12px;
  isolation: isolate;
  align-self: stretch;
}
.cr-mode-switch-thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc(50% - 4px);
  background: var(--app-surface);
  border-radius: 8px;
  box-shadow:
    0 1px 2px color-mix(in srgb, var(--app-text) 6%, transparent),
    0 2px 6px color-mix(in srgb, var(--app-craft) 18%, transparent);
  transition: transform 0.22s var(--ease-out-quart, cubic-bezier(0.25, 1, 0.5, 1));
  z-index: 0;
}
.cr-mode-switch-thumb[data-mode="json"] {
  transform: translateX(100%);
}
.cr-mode-switch-option {
  position: relative;
  z-index: 1;
  padding: 8px 16px;
  background: transparent;
  border: 0;
  border-radius: 8px;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-muted);
  cursor: pointer;
  transition: color 0.18s var(--ease-out-quart, ease-out);
}
.cr-mode-switch-option:hover { color: var(--app-text); }
.cr-mode-switch-option.is-active { color: var(--app-craft); }

/* ====== Sections ====== */
.cr-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.cr-section--json { gap: 8px; }
.cr-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-muted);
  font-family: 'Noto Serif TC', serif;
  letter-spacing: 0.02em;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--app-border);
}

/* ====== Fields / inputs ====== */
.cr-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.cr-field-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.cr-field--small { flex: 1 1 140px; min-width: 110px; }
.cr-field--name { width: 100%; }

.cr-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text-muted);
  letter-spacing: 0.02em;
}
.cr-label--with-help {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.cr-label-help {
  color: var(--app-text-muted);
  cursor: help;
  opacity: 0.7;
  transition: opacity 0.12s ease-out, color 0.12s ease-out;
}
.cr-label-help:hover {
  opacity: 1;
  color: var(--app-craft);
}

.cr-input {
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text);
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 14px;
  transition: border-color 0.12s ease-out, box-shadow 0.12s ease-out;
}
.cr-input:focus {
  outline: 0;
  border-color: var(--app-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 20%, transparent);
}
.cr-input--num {
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.04em;
}
.cr-input.has-error { border-color: oklch(0.55 0.20 25); }
.cr-err {
  font-size: 11px;
  color: oklch(0.55 0.20 25);
}

/* ====== Job dropdown trigger ====== */
.cr-job-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  width: max-content;
  min-width: 140px;
  transition: border-color 0.12s ease-out, background-color 0.12s ease-out;
}
.cr-job-trigger:hover {
  background: var(--app-hover);
  border-color: color-mix(in srgb, var(--app-craft) 40%, var(--app-border));
}
.cr-job-trigger-label { flex: 1; text-align: left; }
.cr-job-trigger-chev { color: var(--app-text-muted); }

.cr-rlv-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cr-rlv-hint {
  font-size: 11px;
  font-family: 'Fira Code', ui-monospace, monospace;
  letter-spacing: 0.04em;
  color: var(--app-text-muted);
}
.cr-rlv-hint--hit { color: oklch(0.55 0.16 145); }
.cr-rlv-hint--miss { color: oklch(0.58 0.17 45); }

.cr-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--app-text);
  cursor: pointer;
  user-select: none;
  width: max-content;
}
.cr-checkbox input { cursor: pointer; }

/* ====== Advanced + JSON toggles ====== */
.cr-advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 0;
  padding: 6px 0;
  color: var(--app-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  align-self: flex-start;
}
.cr-advanced-toggle:hover { color: var(--app-craft); }
.cr-chev {
  display: inline-block;
  font-size: 10px;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
}
.cr-chev.is-open { transform: rotate(90deg); }
.cr-advanced-hint {
  font-size: 11px;
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
}
.cr-advanced-hint--required { color: oklch(0.58 0.17 45); }
.cr-advanced-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0 0 14px;
  border-left: 1px solid var(--app-border);
  margin-left: 4px;
}
.cr-advanced-note {
  margin: 4px 0 0;
  font-size: 11px;
  color: var(--app-text-muted);
  line-height: 1.5;
}
.cr-advanced-note code {
  font-family: 'Fira Code', ui-monospace, monospace;
  background: color-mix(in srgb, var(--app-craft) 8%, transparent);
  padding: 0 4px;
  border-radius: 3px;
  font-size: 10.5px;
}

/* ====== JSON paste section ====== */
.cr-json-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 0 14px;
  border-left: 1px solid var(--app-border);
  margin-left: 4px;
}
.cr-json-input {
  width: 100%;
  min-height: 120px;
  padding: 10px 12px;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  background: var(--app-surface);
  color: var(--app-text);
  font-family: 'Fira Code', ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}
.cr-json-input:focus {
  outline: 0;
  border-color: var(--app-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-accent) 20%, transparent);
}
.cr-json-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.cr-json-err {
  flex: 1;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
}

/* ====== Footer ====== */
.cr-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 24px 20px;
  border-top: 1px solid var(--app-border);
  background: var(--app-bg);
}
.cr-btn {
  padding: 9px 18px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-family: 'Noto Sans TC', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease-out;
}
.cr-btn--sm { padding: 6px 12px; font-size: 12px; }
.cr-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cr-btn--ghost {
  background: transparent;
  color: var(--app-text-muted);
  border-color: var(--app-border);
}
.cr-btn--ghost:hover:not(:disabled) {
  background: var(--app-hover);
  color: var(--app-text);
}
.cr-btn--secondary {
  background: var(--app-surface);
  color: var(--app-craft);
  border-color: color-mix(in srgb, var(--app-craft) 30%, transparent);
}
.cr-btn--secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--app-craft) 10%, transparent);
}
.cr-btn--primary {
  background: var(--app-accent);
  color: var(--app-surface);
}
.cr-btn--primary:hover:not(:disabled) {
  background: var(--app-accent-light, var(--app-accent));
  transform: translateY(-1px);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--app-accent) 28%, transparent);
}

/* ====== Mobile bottom sheet (matches RecipeSearchSidebar) ====== */
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
    display: grid;
    grid-template-rows: auto auto 1fr;
    padding-top: env(safe-area-inset-top, 0px);
    overflow: hidden;
  }
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
  .cr-header { padding: 4px 16px 0; }
  .cr-title { font-size: 16px; }
  .cr-form {
    display: grid;
    grid-template-rows: 1fr auto;
    min-height: 0;
  }
  .cr-body {
    padding: 12px 16px 8px;
  }
  .cr-footer {
    padding: 12px 16px;
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  .cr-field-row { flex-direction: column; gap: 10px; }
  .cr-field--small { flex: 1 1 auto; }
  .cr-job-trigger { width: 100%; }
  .dialog-enter-from .dialog-panel,
  .dialog-leave-to .dialog-panel {
    transform: translateY(100%);
    opacity: 1;
  }
}
</style>

<style>
/* Active item in the job dropdown menu */
.el-dropdown-menu__item.is-active {
  color: var(--app-craft);
  font-weight: 600;
  background: color-mix(in srgb, var(--app-craft) 10%, transparent);
}
</style>
