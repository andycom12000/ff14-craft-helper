<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTimerStore } from '@/stores/timer'
import { playAlarmSound } from '@/services/alarm-manager'

const store = useTimerStore()
const settings = computed(() => store.alarmSettings)

// ---------------------------------------------------------------------------
// Sound options
// ---------------------------------------------------------------------------
const soundOptions = [
  { value: 'chime', label: 'Chime' },
  { value: 'alert', label: 'Alert' },
  { value: 'soft',  label: 'Soft'  },
  { value: 'custom', label: '自訂' },
]

const hasCustom = computed(() => {
  const sf = settings.value.soundFile
  return sf.startsWith('data:') || sf.startsWith('blob:')
})

// el-select model — show 'custom' when a custom file is loaded
const selectedSound = computed({
  get: () => {
    const sf = settings.value.soundFile
    if (sf.startsWith('data:') || sf.startsWith('blob:')) return 'custom'
    return sf
  },
  set: (val: string) => {
    if (val !== 'custom') {
      settings.value.soundFile = val
    }
    // If 'custom' selected from dropdown but no file loaded yet, do nothing
  },
})

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------
const previewing = ref(false)

async function previewSound() {
  if (previewing.value) return
  previewing.value = true
  try {
    await playAlarmSound(settings.value.soundFile, settings.value.volume)
  } catch (e) {
    console.warn('[AlarmSettings] preview error:', e)
  } finally {
    previewing.value = false
  }
}

// ---------------------------------------------------------------------------
// Custom upload
// ---------------------------------------------------------------------------
const MAX_BYTES = 500 * 1024 // 500 KB
const uploadError = ref('')
const fileInputRef = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInputRef.value?.click()
}

async function onFileChange(event: Event) {
  uploadError.value = ''
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > MAX_BYTES) {
    uploadError.value = `檔案過大（最大 500 KB），目前 ${(file.size / 1024).toFixed(0)} KB`
    input.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    settings.value.soundFile = dataUrl
    selectedSound.value = 'custom'
  }
  reader.onerror = () => {
    uploadError.value = '檔案讀取失敗'
  }
  reader.readAsDataURL(file)
  input.value = ''
}

// ---------------------------------------------------------------------------
// Helpers: bind number inputs safely
// ---------------------------------------------------------------------------
function setFirstMinutes(val: number | undefined) {
  if (typeof val === 'number') settings.value.firstAlert.realMinutesBefore = val
}

function setSecondMinutes(val: number | undefined) {
  if (typeof val === 'number') settings.value.secondAlert.realMinutesBefore = val
}

function setVolume(val: number) {
  settings.value.volume = val
}
</script>

<template>
  <div class="alarm-panel">
    <h3 class="panel-title">提醒設定</h3>

    <!-- ---------------------------------------------------------------- -->
    <!-- First alert                                                        -->
    <!-- ---------------------------------------------------------------- -->
    <div class="setting-row">
      <el-switch
        :model-value="settings.firstAlert.enabled"
        size="small"
        aria-label="啟用第一提醒"
        @update:model-value="(v: boolean) => settings.firstAlert.enabled = v"
      />
      <span class="row-label">第一提醒（開始前）</span>
      <el-input-number
        :model-value="settings.firstAlert.realMinutesBefore"
        :disabled="!settings.firstAlert.enabled"
        :min="0"
        :max="60"
        :step="1"
        size="small"
        controls-position="right"
        class="minutes-input"
        @update:model-value="setFirstMinutes"
      />
      <span class="unit-label">分鐘</span>
    </div>

    <!-- ---------------------------------------------------------------- -->
    <!-- Second alert                                                       -->
    <!-- ---------------------------------------------------------------- -->
    <div class="setting-row">
      <el-switch
        :model-value="settings.secondAlert.enabled"
        size="small"
        aria-label="啟用第二提醒"
        @update:model-value="(v: boolean) => settings.secondAlert.enabled = v"
      />
      <span class="row-label">第二提醒（開始前）</span>
      <el-input-number
        :model-value="settings.secondAlert.realMinutesBefore"
        :disabled="!settings.secondAlert.enabled"
        :min="0"
        :max="60"
        :step="1"
        size="small"
        controls-position="right"
        class="minutes-input"
        @update:model-value="setSecondMinutes"
      />
      <span class="unit-label">分鐘</span>
    </div>

    <div class="divider" />

    <!-- ---------------------------------------------------------------- -->
    <!-- Sound selector + preview                                           -->
    <!-- ---------------------------------------------------------------- -->
    <div class="setting-row setting-row--sound">
      <span class="row-label">音效</span>
      <el-select
        v-model="selectedSound"
        size="small"
        class="sound-select"
      >
        <el-option
          v-for="opt in soundOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <button
        class="preview-btn"
        :disabled="previewing"
        title="預覽音效"
        @click="previewSound"
      >
        ▶
      </button>
    </div>

    <!-- Custom upload -->
    <div class="setting-row setting-row--upload">
      <span class="row-label upload-label">
        自訂音效
        <span v-if="hasCustom" class="custom-loaded">（已載入）</span>
      </span>
      <button class="upload-btn" @click="openFilePicker">
        選擇檔案
      </button>
      <!-- Hidden file input -->
      <input
        ref="fileInputRef"
        type="file"
        accept=".mp3,.wav,.ogg"
        class="file-input-hidden"
        @change="onFileChange"
      />
    </div>

    <div v-if="uploadError" class="upload-error">{{ uploadError }}</div>

    <div class="divider" />

    <!-- ---------------------------------------------------------------- -->
    <!-- Volume slider                                                      -->
    <!-- ---------------------------------------------------------------- -->
    <div class="setting-row setting-row--volume">
      <span class="row-label">音量</span>
      <el-slider
        :model-value="settings.volume"
        :min="0"
        :max="100"
        :step="1"
        class="volume-slider"
        @update:model-value="(v: number) => setVolume(v)"
      />
      <span class="volume-value">{{ settings.volume }}%</span>
    </div>
  </div>
</template>

<style scoped>
.alarm-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0;
}

.panel-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--app-text, #E2E8F0);
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin: 0 0 4px;
}

/* ------------------------------------------------------------------ */
/* Setting rows                                                          */
/* ------------------------------------------------------------------ */
.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.row-label {
  font-size: 13px;
  color: var(--app-text, #E2E8F0);
  white-space: nowrap;
  flex-shrink: 0;
}

.unit-label {
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  white-space: nowrap;
  flex-shrink: 0;
}

.minutes-input {
  width: 90px;
  flex-shrink: 0;
}

/* ------------------------------------------------------------------ */
/* Sound row                                                             */
/* ------------------------------------------------------------------ */
.sound-select {
  width: 110px;
  flex-shrink: 0;
}

.preview-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  background: rgba(74, 222, 128, 0.12);
  border: 1px solid rgba(74, 222, 128, 0.35);
  border-radius: 4px;
  color: #4ADE80;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s;
}

.preview-btn:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.25);
}

.preview-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ------------------------------------------------------------------ */
/* Upload row                                                            */
/* ------------------------------------------------------------------ */
.setting-row--upload {
  flex-wrap: wrap;
  gap: 6px;
}

.upload-label {
  flex-shrink: 0;
}

.custom-loaded {
  font-size: 11px;
  color: #4ADE80;
  font-weight: 400;
}

.upload-btn {
  padding: 4px 12px;
  background: rgba(148, 163, 184, 0.1);
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 4px;
  color: var(--app-text, #E2E8F0);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.upload-btn:hover {
  background: rgba(148, 163, 184, 0.2);
}

.file-input-hidden {
  display: none;
}

.upload-error {
  font-size: 11px;
  color: #F87171;
  padding: 2px 0;
}

/* ------------------------------------------------------------------ */
/* Volume row                                                            */
/* ------------------------------------------------------------------ */
.setting-row--volume {
  gap: 10px;
}

.volume-slider {
  flex: 1;
  min-width: 80px;
}

.volume-value {
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  white-space: nowrap;
  min-width: 36px;
  text-align: right;
  flex-shrink: 0;
}

/* ------------------------------------------------------------------ */
/* Divider                                                               */
/* ------------------------------------------------------------------ */
.divider {
  height: 1px;
  background: rgba(148, 163, 184, 0.1);
  margin: 2px 0;
}
</style>
