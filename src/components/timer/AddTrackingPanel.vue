<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTimerStore } from '@/stores/timer'
import type { GatheringNode } from '@/api/garland'

const store = useTimerStore()

// ---------------------------------------------------------------------------
// Tab state
// ---------------------------------------------------------------------------
const activeTab = ref<'search' | 'browse'>('search')

// ---------------------------------------------------------------------------
// Search tab
// ---------------------------------------------------------------------------
const rawQuery = ref('')
const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const query = ref('')

function onInput(val: string) {
  rawQuery.value = val
  if (debounceTimer.value) clearTimeout(debounceTimer.value)
  debounceTimer.value = setTimeout(() => {
    query.value = val
  }, 300)
}

const searchResults = computed<GatheringNode[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return store.nodeCache.slice(0, 50)
  return store.nodeCache.filter((n) => n.itemName.toLowerCase().includes(q)).slice(0, 100)
})

function addItem(node: GatheringNode) {
  store.addTrackedItem(node.id, node.itemId)
}

// ---------------------------------------------------------------------------
// Browse tab
// ---------------------------------------------------------------------------
// Group: gatheringClass -> nodeType -> nodes
interface NodeGroup {
  nodeType: string
  nodes: GatheringNode[]
}

interface ClassGroup {
  label: string
  key: 'MIN' | 'BTN'
  nodeTypes: NodeGroup[]
}

const browseGroups = computed<ClassGroup[]>(() => {
  const minNodes = store.nodeCache.filter((n) => n.gatheringClass === 'MIN')
  const btnNodes = store.nodeCache.filter((n) => n.gatheringClass === 'BTN')

  function groupByType(nodes: GatheringNode[]): NodeGroup[] {
    const map = new Map<string, GatheringNode[]>()
    for (const n of nodes) {
      const list = map.get(n.nodeType) ?? []
      list.push(n)
      map.set(n.nodeType, list)
    }
    return Array.from(map.entries()).map(([nodeType, ns]) => ({ nodeType, nodes: ns }))
  }

  return [
    { label: '採礦師 (MIN)', key: 'MIN', nodeTypes: groupByType(minNodes) },
    { label: '園藝師 (BTN)', key: 'BTN', nodeTypes: groupByType(btnNodes) },
  ]
})

// Expanded accordion state: Set of "class/nodeType" keys
const expanded = ref<Set<string>>(new Set())

function toggleExpand(key: string) {
  if (expanded.value.has(key)) {
    expanded.value.delete(key)
  } else {
    expanded.value.add(key)
  }
}
</script>

<template>
  <div class="add-panel">
    <!-- Tab headers -->
    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'search' }"
        @click="activeTab = 'search'"
      >
        搜尋
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'browse' }"
        @click="activeTab = 'browse'"
      >
        瀏覽
      </button>
    </div>

    <!-- ---------------------------------------------------------------- -->
    <!-- Search tab                                                         -->
    <!-- ---------------------------------------------------------------- -->
    <div v-if="activeTab === 'search'" class="tab-content">
      <el-input
        :model-value="rawQuery"
        placeholder="搜尋採集素材..."
        clearable
        class="search-input"
        @input="onInput"
        @clear="() => { rawQuery = ''; query = '' }"
      />

      <div v-if="store.nodeCache.length === 0" class="empty-hint">
        資料載入中，請稍候...
      </div>

      <div v-else class="result-list">
        <div
          v-for="node in searchResults"
          :key="node.id"
          class="result-row"
        >
          <div class="result-info">
            <span class="result-name">{{ node.itemName }}</span>
            <span class="result-meta">
              {{ node.gatheringClass }} · Lv{{ node.level }} · {{ node.nodeType }}
            </span>
          </div>
          <button
            v-if="!store.isTracked(node.id)"
            class="add-btn"
            @click="addItem(node)"
          >
            + 追蹤
          </button>
          <span v-else class="tracked-badge">已追蹤</span>
        </div>

        <div v-if="searchResults.length === 0" class="empty-hint">
          找不到符合的素材
        </div>
      </div>
    </div>

    <!-- ---------------------------------------------------------------- -->
    <!-- Browse tab                                                         -->
    <!-- ---------------------------------------------------------------- -->
    <div v-else class="tab-content">
      <div v-if="store.nodeCache.length === 0" class="empty-hint">
        資料載入中，請稍候...
      </div>

      <div v-else class="browse-tree">
        <!-- Class level -->
        <div v-for="cls in browseGroups" :key="cls.key" class="browse-class">
          <button
            class="browse-class-header"
            @click="toggleExpand(cls.key)"
          >
            <span class="accordion-arrow" :class="{ open: expanded.has(cls.key) }">▶</span>
            {{ cls.label }}
            <span class="count-badge">{{ cls.nodeTypes.reduce((s, g) => s + g.nodes.length, 0) }}</span>
          </button>

          <div v-if="expanded.has(cls.key)" class="browse-class-body">
            <!-- nodeType level -->
            <div
              v-for="group in cls.nodeTypes"
              :key="group.nodeType"
              class="browse-type"
            >
              <button
                class="browse-type-header"
                @click="toggleExpand(`${cls.key}/${group.nodeType}`)"
              >
                <span class="accordion-arrow" :class="{ open: expanded.has(`${cls.key}/${group.nodeType}`) }">▶</span>
                {{ group.nodeType }}
                <span class="count-badge">{{ group.nodes.length }}</span>
              </button>

              <div v-if="expanded.has(`${cls.key}/${group.nodeType}`)" class="browse-nodes">
                <div
                  v-for="node in group.nodes"
                  :key="node.id"
                  class="result-row result-row--indent"
                >
                  <div class="result-info">
                    <span class="result-name">{{ node.itemName }}</span>
                    <span class="result-meta">Lv{{ node.level }}</span>
                  </div>
                  <button
                    v-if="!store.isTracked(node.id)"
                    class="add-btn"
                    @click="addItem(node)"
                  >
                    + 追蹤
                  </button>
                  <span v-else class="tracked-badge">已追蹤</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                  */
/* ------------------------------------------------------------------ */
.tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  flex-shrink: 0;
}

.tab-btn {
  flex: 1;
  padding: 10px 0;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--app-text-muted, #94A3B8);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.tab-btn.active {
  color: #4ADE80;
  border-bottom-color: #4ADE80;
}

.tab-btn:hover:not(.active) {
  color: var(--app-text, #E2E8F0);
}

/* ------------------------------------------------------------------ */
/* Content area                                                          */
/* ------------------------------------------------------------------ */
.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-input {
  flex-shrink: 0;
  margin-bottom: 4px;
}

/* ------------------------------------------------------------------ */
/* Result rows                                                           */
/* ------------------------------------------------------------------ */
.result-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border-radius: 6px;
  background: rgba(148, 163, 184, 0.04);
  gap: 8px;
  transition: background 0.12s;
}

.result-row:hover {
  background: rgba(148, 163, 184, 0.09);
}

.result-row--indent {
  margin-left: 8px;
}

.result-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.result-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--app-text, #E2E8F0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  font-size: 11px;
  color: var(--app-text-muted, #94A3B8);
}

/* ------------------------------------------------------------------ */
/* Buttons / badges                                                      */
/* ------------------------------------------------------------------ */
.add-btn {
  flex-shrink: 0;
  padding: 3px 10px;
  background: rgba(74, 222, 128, 0.15);
  border: 1px solid rgba(74, 222, 128, 0.4);
  border-radius: 4px;
  color: #4ADE80;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.add-btn:hover {
  background: rgba(74, 222, 128, 0.28);
}

.tracked-badge {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--app-text-muted, #94A3B8);
  opacity: 0.6;
  white-space: nowrap;
}

/* ------------------------------------------------------------------ */
/* Browse tree                                                           */
/* ------------------------------------------------------------------ */
.browse-tree {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.browse-class-header,
.browse-type-header {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(148, 163, 184, 0.06);
  border: none;
  border-radius: 6px;
  color: var(--app-text, #E2E8F0);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
}

.browse-class-header:hover,
.browse-type-header:hover {
  background: rgba(148, 163, 184, 0.12);
}

.browse-type-header {
  font-weight: 500;
  margin-left: 8px;
  width: calc(100% - 8px);
  margin-top: 2px;
}

.browse-class-body {
  margin-left: 4px;
}

.browse-nodes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 2px;
}

.accordion-arrow {
  display: inline-block;
  font-size: 10px;
  color: var(--app-text-muted, #94A3B8);
  transition: transform 0.15s;
  flex-shrink: 0;
}

.accordion-arrow.open {
  transform: rotate(90deg);
}

.count-badge {
  margin-left: auto;
  font-size: 11px;
  font-weight: 400;
  color: var(--app-text-muted, #94A3B8);
  opacity: 0.7;
}

/* ------------------------------------------------------------------ */
/* Empty hint                                                            */
/* ------------------------------------------------------------------ */
.empty-hint {
  text-align: center;
  font-size: 12px;
  color: var(--app-text-muted, #94A3B8);
  opacity: 0.6;
  padding: 24px 0;
}
</style>
