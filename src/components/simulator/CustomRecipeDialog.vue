<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import { useCustomRecipes, type CustomRecipeForm } from '@/composables/useCustomRecipes'
import { JOB_NAMES, JOB_ICONS } from '@/utils/jobs'
import type { Recipe } from '@/stores/recipe'

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
const errors = ref<Record<string, string>>({})

const jobOrder = ['CRP', 'BSM', 'ARM', 'GSM', 'LTW', 'WVR', 'ALC', 'CUL']

watch(dialogVisible, (open) => {
  if (open) {
    resetForm()
  }
})

function resetForm() {
  form.value = emptyForm()
  editingExistingId.value = null
  rlvLookupState.value = 'idle'
  advancedOpen.value = false
  errors.value = {}
}

function loadExisting(entry: CustomRecipeForm) {
  form.value = { ...entry }
  editingExistingId.value = entry.id
  errors.value = {}
  // Re-run lookup so the visual indicator matches the loaded data.
  if (entry.rlv > 0) runRlvLookup()
  else rlvLookupState.value = 'idle'
  // If advanced values are non-zero (rlv miss territory), expand for visibility.
  advancedOpen.value =
    entry.progressDivider > 0 || entry.qualityDivider > 0 ||
    entry.progressModifier > 0 || entry.qualityModifier > 0
}

async function runRlvLookup() {
  if (!form.value.rlv || form.value.rlv <= 0) {
    rlvLookupState.value = 'idle'
    return
  }
  rlvLookupState.value = 'pending'
  const record = await lookupRlv(form.value.rlv)
  if (record) {
    form.value.level = record.classJobLevel
    form.value.difficulty = record.difficulty
    form.value.quality = record.quality
    form.value.durability = record.durability
    form.value.progressDivider = record.progressDivider
    form.value.qualityDivider = record.qualityDivider
    form.value.progressModifier = record.progressModifier
    form.value.qualityModifier = record.qualityModifier
    rlvLookupState.value = 'hit'
    advancedOpen.value = false
  } else {
    rlvLookupState.value = 'miss'
    advancedOpen.value = true
  }
}

function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.value.name.trim()) e.name = '請輸入配方名稱'
  if (!form.value.job) e.job = '請選擇職業'
  if (!form.value.rlv || form.value.rlv <= 0) e.rlv = 'Recipe Lv 必須是正整數'
  if (!form.value.level || form.value.level <= 0) e.level = '製作等級必須是正整數'
  if (!form.value.difficulty || form.value.difficulty <= 0) e.difficulty = '難度必須是正整數'
  if (!form.value.quality || form.value.quality <= 0) e.quality = '品質必須是正整數'
  if (!form.value.durability || form.value.durability <= 0) e.durability = '耐久必須是正整數'
  if (!form.value.progressDivider || form.value.progressDivider <= 0) e.progressDivider = 'Progress Divider 必填'
  if (!form.value.qualityDivider || form.value.qualityDivider <= 0) e.qualityDivider = 'Quality Divider 必填'
  if (!form.value.progressModifier || form.value.progressModifier <= 0) e.progressModifier = 'Progress Modifier 必填'
  if (!form.value.qualityModifier || form.value.qualityModifier <= 0) e.qualityModifier = 'Quality Modifier 必填'
  errors.value = e
  return Object.keys(e).length === 0
}

const isValid = computed(() => {
  if (!form.value.name.trim()) return false
  if (!form.value.job) return false
  if (!form.value.rlv || form.value.rlv <= 0) return false
  if (!form.value.level || form.value.level <= 0) return false
  if (!form.value.difficulty || form.value.difficulty <= 0) return false
  if (!form.value.quality || form.value.quality <= 0) return false
  if (!form.value.durability || form.value.durability <= 0) return false
  if (!form.value.progressDivider || form.value.progressDivider <= 0) return false
  if (!form.value.qualityDivider || form.value.qualityDivider <= 0) return false
  if (!form.value.progressModifier || form.value.progressModifier <= 0) return false
  if (!form.value.qualityModifier || form.value.qualityModifier <= 0) return false
  return true
})

function handleSave() {
  if (!validate()) {
    ElMessage.warning('請先填好必填欄位')
    return
  }
  const wasEditing = editingExistingId.value != null
  const saved = save({ ...form.value, id: editingExistingId.value ?? form.value.id })
  editingExistingId.value = saved.id
  ElMessage.success(wasEditing ? '已更新自訂配方' : '已儲存自訂配方')
}

function handleEnqueue() {
  if (!validate()) {
    ElMessage.warning('請先填好必填欄位')
    return
  }
  const recipe = buildRecipe(form.value)
  emit('enqueue', recipe)
  dialogVisible.value = false
}

async function handleDelete(entry: CustomRecipeForm, ev: Event) {
  ev.stopPropagation()
  try {
    await ElMessageBox.confirm(
      `要刪除「${entry.name || '未命名配方'}」嗎？`,
      '刪除自訂配方',
      { type: 'warning', confirmButtonText: '刪除', cancelButtonText: '取消' },
    )
    remove(entry.id)
    if (editingExistingId.value === entry.id) {
      resetForm()
    }
    ElMessage.success('已刪除')
  } catch {
    // user cancelled
  }
}

function handleNew() {
  resetForm()
}

function jobLabel(abbr: string): string {
  return `${JOB_ICONS[abbr] ?? ''} ${JOB_NAMES[abbr] ?? abbr}`
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    width="620px"
    class="custom-recipe-dialog"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <template #header>
      <div class="cr-header">
        <div class="cr-header-text">
          <h3 class="cr-title">自訂配方</h3>
          <p class="cr-subtitle">適用於資料源尚未同步新版配方時</p>
        </div>
        <button
          type="button"
          class="cr-close"
          aria-label="關閉視窗"
          @click="dialogVisible = false"
        >
          <el-icon :size="18"><Close /></el-icon>
        </button>
      </div>
    </template>

    <div class="cr-body">
      <!-- Saved recipes list (only when there are entries) -->
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
            <span class="cr-saved-meta">{{ JOB_NAMES[entry.job] ?? entry.job }} · rlv {{ entry.rlv }}</span>
            <button
              type="button"
              class="cr-saved-remove"
              aria-label="刪除"
              @click="handleDelete(entry, $event)"
            >✕</button>
          </li>
        </ul>
      </section>

      <!-- Form -->
      <section class="cr-section">
        <h4 class="cr-section-title">配方參數</h4>

        <div class="cr-field cr-field--name">
          <label class="cr-label" for="cr-name">名稱</label>
          <input
            id="cr-name"
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
          <div class="cr-job-row" role="radiogroup" aria-label="職業">
            <button
              v-for="abbr in jobOrder"
              :key="abbr"
              type="button"
              class="cr-job-chip"
              :class="{ 'is-active': form.job === abbr }"
              role="radio"
              :aria-checked="form.job === abbr"
              @click="form.job = abbr"
            >
              {{ jobLabel(abbr) }}
            </button>
          </div>
        </div>

        <div class="cr-field-row">
          <div class="cr-field cr-field--small">
            <label class="cr-label" for="cr-rlv">Recipe Lv</label>
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
                @keydown.enter="runRlvLookup"
              />
              <span
                v-if="rlvLookupState === 'hit'"
                class="cr-rlv-hint cr-rlv-hint--hit"
                title="已從本地資料載入 dividers / modifiers"
              >✓ 已載入</span>
              <span
                v-else-if="rlvLookupState === 'miss'"
                class="cr-rlv-hint cr-rlv-hint--miss"
                title="本地無此 rlv 資料，請手動輸入下方進階參數"
              >⚠ 需手動填</span>
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
            />
          </div>
        </div>

        <label class="cr-checkbox">
          <input v-model="form.canHq" type="checkbox" />
          <span>此配方可 HQ</span>
        </label>
      </section>

      <section class="cr-section">
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
            />
            <span v-if="errors.durability" class="cr-err">{{ errors.durability }}</span>
          </div>
        </div>
      </section>

      <section class="cr-section">
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
              />
              <span v-if="errors.qualityModifier" class="cr-err">{{ errors.qualityModifier }}</span>
            </div>
          </div>
          <p class="cr-advanced-note">
            這四個值決定模擬器的進度/品質計算精度。可從遊戲內配方介面或 wiki RecipeLevelTable 抄。
          </p>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="cr-footer">
        <button type="button" class="cr-btn cr-btn--ghost" @click="dialogVisible = false">取消</button>
        <button
          type="button"
          class="cr-btn cr-btn--secondary"
          :disabled="!isValid"
          @click="handleSave"
        >{{ editingExistingId ? '更新' : '儲存' }}</button>
        <button
          type="button"
          class="cr-btn cr-btn--primary"
          :disabled="!isValid"
          @click="handleEnqueue"
        >加入佇列</button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.cr-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
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

.cr-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 0 8px;
}

.cr-saved {
  padding: 12px 14px;
  background: color-mix(in srgb, var(--app-craft) 5%, transparent);
  border-radius: 12px;
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
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--app-craft);
  font-family: 'Fira Code', ui-monospace, monospace;
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
.cr-saved-item.is-active {
  background: color-mix(in srgb, var(--app-craft) 14%, transparent);
}
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
.cr-saved-meta {
  font-size: 11px;
  font-family: 'Fira Code', ui-monospace, monospace;
  color: var(--app-text-muted);
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

.cr-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
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
.cr-input.has-error {
  border-color: oklch(0.55 0.20 25);
}
.cr-err {
  font-size: 11px;
  color: oklch(0.55 0.20 25);
}

.cr-job-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cr-job-chip {
  padding: 6px 12px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text-muted);
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.12s ease-out;
}
.cr-job-chip:hover {
  background: var(--app-hover);
  color: var(--app-text);
}
.cr-job-chip.is-active {
  background: var(--app-craft);
  color: var(--app-surface);
  border-color: var(--app-craft);
}

.cr-rlv-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: stretch;
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

.cr-advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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

.cr-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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

@media (max-width: 640px) {
  .cr-field-row { flex-direction: column; gap: 10px; }
  .cr-field--small { flex: 1 1 auto; }
}
</style>

<style>
.custom-recipe-dialog .el-dialog__headerbtn { display: none; }
.custom-recipe-dialog .el-dialog__header { padding-bottom: 8px; margin-right: 0; }
.custom-recipe-dialog .el-dialog__body { padding-top: 12px; }

@media (max-width: 640px) {
  .custom-recipe-dialog { width: calc(100% - 24px) !important; max-width: 100%; }
}
</style>
