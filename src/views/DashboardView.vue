<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGearsetsStore } from '@/stores/gearsets'
import { useBatchStore } from '@/stores/batch'
import { useTimerStore } from '@/stores/timer'
import { JOB_NAMES } from '@/utils/jobs'

const router = useRouter()
const gearsets = useGearsetsStore()
const batchStore = useBatchStore()
const timerStore = useTimerStore()

const guideCollapsed = ref(localStorage.getItem('ff14-guide-collapsed') === 'true')

function toggleGuide() {
  guideCollapsed.value = !guideCollapsed.value
  localStorage.setItem('ff14-guide-collapsed', String(guideCollapsed.value))
}

const batchTargetCount = computed(() => batchStore.targets.length)
const trackedTimerCount = computed(() => timerStore.trackedItems.length)
const hasActiveWork = computed(() => batchTargetCount.value > 0 || trackedTimerCount.value > 0)

const JOB_ICONS: Record<string, string> = {
  CRP: '🪓', BSM: '⚒️', ARM: '🛡️', GSM: '💍',
  LTW: '🧶', WVR: '🪡', ALC: '⚗️', CUL: '🍳',
}

const configuredJobs = computed(() =>
  Object.keys(JOB_NAMES).filter(job => {
    const g = gearsets.gearsets[job]
    return g && (g.craftsmanship > 0 || g.control > 0)
  })
)

const unconfiguredCount = computed(() => Object.keys(JOB_NAMES).length - configuredJobs.value.length)

const workflows = [
  {
    icon: '⚗️', title: '模擬單一配方', path: '/simulator', color: 'var(--app-craft)',
    desc: '找到最佳製作手法，提高成品品質',
  },
  {
    icon: '📜', title: '查看材料與價格', path: '/bom', color: 'var(--app-craft)',
    desc: '展開材料樹，查詢市場價格',
  },
  {
    icon: '📋', title: '批量製作規劃', path: '/batch', color: 'var(--app-craft)',
    desc: '多個配方一次算好採購和製作順序',
  },
]

const tools = [
  { icon: '🪙', title: '市場查價', path: '/market', color: 'var(--app-market)', disabled: true, badge: '開發中' },
  { icon: '🌿', title: '採集計時器', path: '/timer', color: 'var(--app-gather)' },
]
</script>

<template>
  <div class="view-container dashboard">
    <!-- Welcome -->
    <div class="welcome">
      <h2>歡迎回來，冒險者</h2>
      <p class="view-desc">選一個功能開始，或先設定好你的裝備。<kbd class="shortcut-hint" title="快速跳轉頁面">Ctrl+K</kbd></p>
    </div>

    <!-- Workflow Cards -->
    <div class="section-header" style="margin-bottom: 12px">
      <h3>製作流程</h3>
    </div>
    <div class="workflow-list">
      <button
        v-for="wf in workflows"
        :key="wf.path"
        class="workflow-card"
        @click="router.push(wf.path)"
      >
        <span class="wf-icon" :style="{ background: `color-mix(in srgb, ${wf.color} 15%, transparent)` }">{{ wf.icon }}</span>
        <div class="wf-body">
          <span class="wf-title">{{ wf.title }}</span>
          <span class="wf-desc">{{ wf.desc }}</span>
        </div>
        <span class="wf-arrow">→</span>
      </button>
    </div>

    <!-- Tools -->
    <div class="section-header section-gap-sm">
      <h3>實用工具</h3>
    </div>
    <div class="tools-row">
      <button
        v-for="tool in tools"
        :key="tool.path"
        class="tool-card"
        :class="{ disabled: tool.disabled }"
        :disabled="tool.disabled"
        @click="!tool.disabled && router.push(tool.path)"
      >
        <span class="tool-icon" :style="{ background: `color-mix(in srgb, ${tool.color} 15%, transparent)` }">{{ tool.icon }}</span>
        <span class="tool-title">{{ tool.title }}</span>
        <span v-if="tool.badge" class="tool-badge">{{ tool.badge }}</span>
        <span v-else class="wf-arrow">→</span>
      </button>
    </div>

    <!-- Active Work Status -->
    <template v-if="hasActiveWork">
      <div class="section-header section-gap-lg">
        <h3>進行中</h3>
      </div>
      <div class="status-row">
        <button v-if="batchTargetCount > 0" class="status-card" @click="router.push('/batch')">
          <span class="status-icon">📋</span>
          <div class="status-body">
            <span class="status-label">批量製作</span>
            <span class="status-value">{{ batchTargetCount }} 個配方待處理</span>
          </div>
          <span class="wf-arrow">→</span>
        </button>
        <button v-if="trackedTimerCount > 0" class="status-card" @click="router.push('/timer')">
          <span class="status-icon">🌿</span>
          <div class="status-body">
            <span class="status-label">採集追蹤</span>
            <span class="status-value">{{ trackedTimerCount }} 個素材追蹤中</span>
          </div>
          <span class="wf-arrow">→</span>
        </button>
      </div>
    </template>

    <!-- Gearset Summary -->
    <div class="section-header section-gap-lg">
      <h3>裝備狀態</h3>
      <button class="link-btn" @click="router.push('/gearset')">管理裝備 →</button>
    </div>

    <div class="gearset-summary">
      <div
        v-for="job in Object.keys(JOB_NAMES)"
        :key="job"
        class="gs-chip"
        :class="{ configured: configuredJobs.includes(job) }"
        @click="router.push('/gearset')"
      >
        <span class="gs-icon">{{ JOB_ICONS[job] }}</span>
        <span class="gs-name">{{ JOB_NAMES[job] }}</span>
        <span v-if="configuredJobs.includes(job)" class="gs-lv">Lv.{{ gearsets.gearsets[job].level }}</span>
        <span v-else class="gs-empty">未設定</span>
      </div>
    </div>

    <p v-if="unconfiguredCount > 0" class="gs-hint">
      還有 {{ unconfiguredCount }} 個職業尚未設定裝備數值，<button class="inline-link" @click="router.push('/gearset')">前往設定</button>
    </p>

    <!-- Getting Started -->
    <div class="section-header section-gap-lg">
      <h3>新手指南</h3>
      <button class="link-btn" @click="toggleGuide">{{ guideCollapsed ? '展開' : '收起' }}</button>
    </div>
    <div v-if="!guideCollapsed" class="steps">
      <div class="step">
        <span class="step-num">1</span>
        <div>
          <strong>設定裝備</strong>
          <p>填入你的職業等級、作業精度、加工精度和 CP</p>
        </div>
      </div>
      <div class="step">
        <span class="step-num">2</span>
        <div>
          <strong>搜尋配方</strong>
          <p>在模擬器或批量製作中搜尋你想做的道具</p>
        </div>
      </div>
      <div class="step">
        <span class="step-num">3</span>
        <div>
          <strong>開始製作</strong>
          <p>模擬器會算出最佳手法，批量製作幫你規劃採購清單</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { --page-accent: var(--app-accent-light); --page-accent-dim: var(--app-accent-glow); max-width: 960px; }

.welcome h2 { border-left-color: var(--app-accent-light); }

/* Workflow Cards */
.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workflow-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  color: var(--app-text);
  transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}

.workflow-card:hover {
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.15);
}

.wf-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.wf-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wf-title { font-weight: 600; font-size: 14px; }
.wf-desc { font-size: 12px; color: var(--app-text-muted); }

.wf-arrow {
  font-size: 16px;
  color: var(--app-text-muted);
  transition: transform 0.15s;
}

.workflow-card:hover .wf-arrow,
.tool-card:hover .wf-arrow {
  transform: translateX(3px);
}

/* Tools Row */
.tools-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.tool-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  cursor: pointer;
  color: var(--app-text);
  transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}

.tool-card:hover {
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.15);
}

.tool-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.tool-title { font-weight: 600; font-size: 14px; flex: 1; }

.tool-card.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.tool-card.disabled:hover {
  border-color: var(--app-border);
  box-shadow: none;
}

.tool-badge {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--app-text-muted);
  background: var(--el-fill-color-lighter);
  border: 1px solid var(--app-border);
  border-radius: 999px;
  letter-spacing: 0.5px;
}

/* Section Spacing Rhythm */
.section-gap-sm { margin-top: 24px; }
.section-gap-lg { margin-top: 36px; }

/* Section Headers */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h3 {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-text);
  margin: 0;
}

.link-btn {
  background: none;
  border: none;
  color: var(--app-accent-light);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}

/* Active Work Status */
.status-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.status-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 10px;
  cursor: pointer;
  color: var(--app-text);
  text-align: left;
  transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}

.status-card:hover {
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.15);
}

.status-card:hover .wf-arrow {
  transform: translateX(3px);
}

.status-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.status-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.status-label {
  font-weight: 600;
  font-size: 13px;
}

.status-value {
  font-size: 12px;
  color: var(--app-text-muted);
}

/* Gearset Summary */
.gearset-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gs-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  font-size: 13px;
  cursor: pointer;
  transition: border-color 0.15s;
}

.gs-chip:hover {
  border-color: rgba(148, 163, 184, 0.25);
}

.gs-chip.configured {
  border-color: rgba(245, 158, 11, 0.25);
}

.gs-icon { font-size: 16px; }
.gs-name { color: var(--app-text); font-weight: 500; }
.gs-lv { color: var(--app-craft); font-size: 12px; font-weight: 500; }
.gs-empty { color: var(--app-text-muted); font-size: 12px; }

.gs-hint {
  margin-top: 10px;
  font-size: 13px;
  color: var(--app-text-muted);
}

.inline-link {
  background: none;
  border: none;
  color: var(--app-accent-light);
  cursor: pointer;
  font-size: 13px;
  padding: 0;
  text-decoration: underline;
}

/* Shortcut hint */
.shortcut-hint {
  font-size: 11px;
  color: var(--app-text-muted);
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 8px;
  font-family: inherit;
  cursor: pointer;
  vertical-align: middle;
}

/* Steps */
.steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--app-accent-glow);
  color: var(--app-accent-light);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.step strong {
  font-size: 14px;
  color: var(--app-text);
}

.step p {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--app-text-muted);
  line-height: 1.4;
}

@media (max-width: 768px) {
  .quick-grid {
    grid-template-columns: 1fr;
  }
}
</style>
