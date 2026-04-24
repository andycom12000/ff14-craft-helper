<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useSimulatorStore } from '@/stores/simulator'

const store = useSimulatorStore()

const canUndo = computed(() => store.history.length > 0)
const canRedo = computed(() => store.future.length > 0)
const canReset = computed(() => store.actions.length > 0 || store.history.length > 0)

function onKeydown(e: KeyboardEvent) {
  if (store.mode !== 'manual') return
  // Don't steal input while typing in a form field.
  const target = e.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  if (target?.isContentEditable) return

  const mod = e.ctrlKey || e.metaKey
  if (!mod) return

  const key = e.key.toLowerCase()
  if (key === 'z' && !e.shiftKey) {
    e.preventDefault()
    store.undo()
  } else if ((key === 'z' && e.shiftKey) || key === 'y') {
    e.preventDefault()
    store.redo()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="manual-controls" role="toolbar" aria-label="手動模擬控制">
    <button
      type="button"
      class="mc-btn"
      :disabled="!canUndo"
      :title="'復原 (Ctrl+Z)'"
      @click="store.undo()"
    >
      復原
    </button>
    <button
      type="button"
      class="mc-btn"
      :disabled="!canRedo"
      :title="'重做 (Ctrl+Shift+Z)'"
      @click="store.redo()"
    >
      重做
    </button>
    <button
      type="button"
      class="mc-btn mc-btn-danger"
      :disabled="!canReset"
      @click="store.resetManual()"
    >
      重置
    </button>
  </div>
</template>

<style scoped>
.manual-controls {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.mc-btn {
  padding: 5px 14px;
  font-size: 12px;
  line-height: 1.4;
  border-radius: 8px;
  border: 1px solid var(--el-border-color);
  background: transparent;
  color: var(--el-text-color-regular);
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
}

.mc-btn:hover:not(:disabled) {
  background: var(--el-fill-color-light);
  border-color: var(--app-accent, var(--el-color-primary));
  color: var(--el-text-color-primary);
}

.mc-btn:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
}

.mc-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mc-btn-danger:hover:not(:disabled) {
  border-color: var(--el-color-danger);
  color: var(--el-color-danger);
}

@media (pointer: coarse) {
  .mc-btn {
    padding: 10px 18px;
    min-height: 40px;
    font-size: 13px;
  }
}
</style>
