<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const open = ref(false)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement>()

interface Command {
  label: string
  path: string
  icon: string
  keywords: string
}

const commands: Command[] = [
  { label: '首頁', path: '/', icon: '🏠', keywords: '首頁 home dashboard' },
  { label: '配裝管理', path: '/gearset', icon: '🛠️', keywords: '配裝 裝備 gearset gear' },
  { label: '製作模擬', path: '/simulator', icon: '⚗️', keywords: '模擬 製作 simulator craft' },
  { label: '購物清單', path: '/bom', icon: '📜', keywords: '購物 採購 材料 清單 bom shopping material' },
  { label: '批量製作', path: '/batch', icon: '📋', keywords: '批量 batch plan' },
  { label: '市場查價', path: '/market', icon: '🪙', keywords: '市場 查價 market price' },
  { label: '採集計時器', path: '/timer', icon: '🌿', keywords: '採集 計時 timer gather' },
  { label: '更新日誌', path: '/changelog', icon: '📄', keywords: '更新 日誌 changelog' },
  { label: '設定', path: '/settings', icon: '⚙️', keywords: '設定 settings' },
]

const filtered = computed(() => {
  if (!query.value) return commands
  const q = query.value.toLowerCase()
  return commands.filter(c =>
    c.label.includes(q) || c.keywords.toLowerCase().includes(q)
  )
})

watch(query, () => { selectedIndex.value = 0 })

function toggle() {
  open.value = !open.value
  if (open.value) {
    query.value = ''
    selectedIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
}

function select(cmd: Command) {
  router.push(cmd.path)
  open.value = false
}

const paletteRef = ref<HTMLElement>()

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filtered.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filtered.value[selectedIndex.value]) {
      select(filtered.value[selectedIndex.value])
    }
  } else if (e.key === 'Tab') {
    // Focus trap: keep tab cycling within the palette
    const root = paletteRef.value
    if (!root) return
    const focusable = root.querySelectorAll<HTMLElement>(
      'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
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
}

function onGlobalKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    toggle()
  }
  if (e.key === 'Escape' && open.value) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('keydown', onGlobalKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', onGlobalKeydown)
  document.body.style.overflow = ''
})

watch(open, (isOpen) => {
  document.body.style.overflow = isOpen ? 'hidden' : ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="palette">
      <div v-if="open" class="palette-backdrop" @click.self="open = false">
        <div
          ref="paletteRef"
          class="palette"
          role="dialog"
          aria-modal="true"
          aria-label="快速前往頁面"
          @keydown="onKeydown"
        >
          <div class="palette-input-row">
            <span class="palette-search-icon" aria-hidden="true">⌘</span>
            <input
              ref="inputRef"
              v-model="query"
              class="palette-input"
              placeholder="前往頁面…"
              aria-label="頁面搜尋"
              autocomplete="off"
              spellcheck="false"
            />
            <kbd class="palette-kbd">ESC</kbd>
          </div>
          <div v-if="filtered.length > 0" class="palette-list">
            <button
              v-for="(cmd, i) in filtered"
              :key="cmd.path"
              class="palette-item"
              :class="{ active: i === selectedIndex }"
              @click="select(cmd)"
              @mouseenter="selectedIndex = i"
            >
              <span class="palette-item-icon">{{ cmd.icon }}</span>
              <span class="palette-item-label">{{ cmd.label }}</span>
            </button>
          </div>
          <div v-else class="palette-empty">找不到匹配的頁面</div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 20vh;
  padding-top: 20dvh;
}

.palette {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--app-surface, #161822);
  border: 1px solid var(--app-border, rgba(148,163,184,0.12));
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.palette-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border, rgba(148,163,184,0.12));
  transition: border-color 0.15s;
}

.palette-input-row:focus-within {
  border-bottom-color: var(--app-accent-light, #A78BFA);
}

.palette-search-icon {
  font-size: 14px;
  color: var(--app-text-muted, #94A3B8);
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--app-text, #E2E8F0);
  font-size: 16px;
  font-family: inherit;
}

.palette-input:focus-visible {
  outline: 2px solid var(--app-accent-light);
  outline-offset: 2px;
  border-radius: 4px;
}

.palette-input::placeholder {
  color: var(--app-text-muted, #94A3B8);
}

.palette-kbd {
  font-size: 11px;
  color: var(--app-text-muted, #94A3B8);
  background: oklch(0.55 0.04 65 /0.08);
  border: 1px solid oklch(0.55 0.04 65 /0.15);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: inherit;
  flex-shrink: 0;
}

.palette-list {
  padding: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--app-text, #E2E8F0);
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}

.palette-item.active {
  background: var(--app-accent-glow, oklch(0.65 0.18 65 /0.15));
}

.palette-item:active {
  background: var(--app-surface-hover, oklch(0.55 0.04 65 /0.12));
}

.palette-item:focus-visible {
  outline: 2px solid var(--app-accent-light, #A78BFA);
  outline-offset: -2px;
}

@media (pointer: coarse) {
  .palette-item {
    min-height: 44px;
    padding: 12px 14px;
  }
}

.palette-item-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
}

.palette-item-label {
  font-weight: 500;
}

.palette-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--app-text-muted, #94A3B8);
  font-size: 13px;
}

/* Transition */
.palette-enter-active { transition: opacity 0.15s; }
.palette-leave-active { transition: opacity 0.1s; }
.palette-enter-from,
.palette-leave-to { opacity: 0; }
</style>
