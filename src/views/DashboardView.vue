<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGearsetsStore } from '@/stores/gearsets'
import { useBatchStore } from '@/stores/batch'
import { useTimerStore } from '@/stores/timer'
import { useSettingsStore } from '@/stores/settings'
import { useIsMobile } from '@/composables/useMediaQuery'
import { JOB_NAMES } from '@/utils/jobs'
import WelcomeSetup from '@/components/onboarding/WelcomeSetup.vue'

const router = useRouter()
const gearsets = useGearsetsStore()
const batchStore = useBatchStore()
const timerStore = useTimerStore()
const settingsStore = useSettingsStore()
const isMobile = useIsMobile()

function readOnboardingComplete(): boolean {
  try {
    return localStorage.getItem('onboardingComplete') === '1'
  } catch {
    return false
  }
}

const showOnboarding = ref(
  !readOnboardingComplete()
  && !settingsStore.region
  && !settingsStore.dataCenter
  && !settingsStore.server,
)

function onboardingDone() {
  showOnboarding.value = false
}

// Rotating Cormorant italic greeting — picked once per mount,
// scoped to time-of-day so the line tracks when the player is on.
// Bakery flavor kept light (1-2 per bucket); rest is crafting/FFXIV.
function getTimeBucket(): 'morning' | 'noon' | 'afternoon' | 'evening' | 'lateNight' {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 14) return 'noon'
  if (h >= 14 && h < 18) return 'afternoon'
  if (h >= 18 && h < 22) return 'evening'
  return 'lateNight'
}

const greetingsByTime: Record<string, string[]> = {
  morning: [
    '早安，光之戰士。',
    '新的一天，先把材料準備好。',
    '今天想做點什麼？',
    '趁早開工，晚上才有時間刷副本。',
    '新的一爐，新的一天。',
  ],
  noon: [
    '趁手感正好，再來幾件。',
    '中午也是好時段。',
    '歇個手，再來一輪。',
    '材料齊了嗎？',
    '趁熱開工。',
  ],
  afternoon: [
    '差幾件就湊齊一套了。',
    '下午的進度怎麼樣？',
    '副本前先把貨備好。',
    '光之戰士，準備好了嗎？',
    '今天打算挑戰什麼？',
  ],
  evening: [
    '晚上適合規劃明天的批次。',
    '工坊還沒打烊，慢慢來。',
    '今天的成品都收得整齊了嗎？',
    '夜班的光之戰士，準備好了嗎？',
    '今天的進度還好嗎？',
  ],
  lateNight: [
    '深夜的手最穩。',
    '別忘了休息，明天還有副本。',
    '夜班肝開了？慢慢來。',
    '一爐又一爐，慢慢來不急。',
    '夜深人靜，最適合刷手法。',
  ],
}

const greeting = (() => {
  const pool = greetingsByTime[getTimeBucket()]
  return pool[Math.floor(Math.random() * pool.length)]
})()

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

// Batch is the headline feature — pulled out into a hero card below.
// These are the supporting craft tools, rendered smaller.
const workflows = [
  {
    icon: '⚗️', title: '模擬單一配方', path: '/simulator', color: 'var(--app-craft)',
    desc: '針對單一配方算最佳手法',
  },
  {
    icon: '📜', title: '查看材料與價格', path: '/bom', color: 'var(--app-craft)',
    desc: '展開素材樹，查市場價格',
  },
]

const batchFeatures = [
  '展開素材樹 → 採購清單一次給',
  '跨服比價，找最省的那條路',
  '自製 vs 直購算給你看，自己決定怎麼走',
  '製作 todo + 一鍵複製巨集',
]

const tools = [
  { icon: '🪙', title: '市場查價', path: '/market', color: 'var(--app-market)', disabled: true, badge: '開發中' },
  { icon: '🌿', title: '採集計時器', path: '/timer', color: 'var(--app-gather)' },
]
</script>

<template>
  <WelcomeSetup v-if="showOnboarding" @done="onboardingDone" />
  <div v-else class="view-container dashboard" :class="{ 'is-mobile': isMobile }">
    <!-- Welcome -->
    <div class="welcome">
      <p class="welcome-quote">{{ greeting }}</p>
      <h2>歡迎回來，冒險者</h2>
      <p class="welcome-greeting" v-if="isMobile">嗨，冒險者 👋</p>
      <p class="view-desc">
        <span>選一個功能開始，或先設定好你的裝備。</span>
        <kbd v-if="!isMobile" class="shortcut-hint" title="快速跳轉頁面">Ctrl+K</kbd>
      </p>
    </div>

    <!-- Hero: Batch (主打功能) -->
    <button class="batch-hero" @click="router.push('/batch')" type="button">
      <div class="batch-hero-head">
        <span class="batch-hero-eyebrow">主打功能</span>
        <h3 class="batch-hero-title">
          <span class="batch-hero-icon" aria-hidden="true">📋</span>
          批量製作
        </h3>
      </div>
      <p class="batch-hero-tagline">"一次給我清單，剩下交給工坊。"</p>
      <ul class="batch-hero-features">
        <li v-for="line in batchFeatures" :key="line">{{ line }}</li>
      </ul>
      <span class="batch-hero-cta">開始規劃 →</span>
    </button>

    <!-- Supporting craft tools -->
    <div class="section-header" style="margin-top: 28px; margin-bottom: 12px">
      <h3>其他製作工具</h3>
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
      <h3>周邊工具</h3>
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
  </div>
</template>

<style scoped>
.dashboard { --page-accent: var(--app-accent-light); --page-accent-dim: var(--app-accent-glow); max-width: 960px; }

.welcome h2 { border-left-color: var(--app-accent-light); }

.welcome {
  background-image: var(--paper-noise);
  background-size: var(--paper-noise-size);
  margin: -8px -16px 8px;
  padding: 12px 16px 4px;
  border-radius: 12px;
}

.welcome-quote {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 17px;
  color: oklch(0.62 0.12 65);
  margin: 0 0 6px;
  letter-spacing: 0.01em;
  line-height: 1.4;
}

@media (max-width: 768px) {
  .welcome-quote {
    /* Don't sit flush against the mobile app bar — give it room */
    margin-top: 12px;
    font-size: 16px;
  }
}

/* Batch hero — the headline feature */
.batch-hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  text-align: left;
  font: inherit;
  color: var(--app-text);
  padding: 28px 32px;
  margin: 8px 0 0;
  border-radius: 16px;
  border: 1px solid oklch(0.50 0.16 40 / 0.30);
  background:
    linear-gradient(140deg, oklch(0.50 0.16 40 / 0.06) 0%, oklch(0.50 0.16 40 / 0) 60%),
    var(--app-surface);
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.6),
    0 2px 8px oklch(0.40 0.05 60 / 0.06);
  transition:
    transform 0.2s var(--ease-out-quart),
    border-color 0.2s var(--ease-out-quart),
    box-shadow 0.2s var(--ease-out-quart);
}

.batch-hero:hover {
  transform: translateY(-1px);
  border-color: oklch(0.50 0.16 40 / 0.55);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.6),
    0 8px 22px oklch(0.40 0.05 60 / 0.10);
}

.batch-hero:focus-visible {
  outline: 2px solid var(--app-craft);
  outline-offset: 3px;
}

.batch-hero-head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.batch-hero-eyebrow {
  font-family: 'Fira Code', monospace;
  font-size: 10.5px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--app-craft);
}

.batch-hero-title {
  font-family: 'Noto Serif TC', serif;
  font-size: 28px;
  font-weight: 800;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  letter-spacing: 0.5px;
  line-height: 1.1;
}

.batch-hero-icon {
  font-size: 32px;
  line-height: 1;
}

.batch-hero-tagline {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 16px;
  color: var(--app-craft);
  margin: 0;
  letter-spacing: 0.01em;
}

.batch-hero-features {
  list-style: none;
  margin: 4px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 18px;
  font-size: 13px;
  color: var(--app-text-muted);
}

.batch-hero-features li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  line-height: 1.5;
}

.batch-hero-features li::before {
  content: '·';
  color: var(--app-craft);
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
}

.batch-hero-cta {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: var(--app-craft);
  color: oklch(0.99 0 0);
  border-radius: 10px;
  font-weight: 700;
  font-size: 13.5px;
  align-self: flex-start;
  box-shadow: 0 2px 6px oklch(0.50 0.16 40 / 0.30);
  transition: transform 0.18s var(--ease-out-quart);
}

.batch-hero:hover .batch-hero-cta {
  transform: translateX(2px);
}

@media (max-width: 640px) {
  .batch-hero {
    padding: 20px;
    border-radius: 14px;
  }
  .batch-hero-title {
    font-size: 22px;
  }
  .batch-hero-icon {
    font-size: 26px;
  }
  .batch-hero-features {
    grid-template-columns: 1fr;
    gap: 4px;
  }
}

/* Workflow Cards — 2-col grid (matches tools-row) */
.workflow-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

@media (max-width: 480px) {
  .workflow-list {
    grid-template-columns: 1fr;
  }
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
  border-color: oklch(0.55 0.04 65 /0.22);
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

@media (max-width: 480px) {
  .tools-row {
    grid-template-columns: 1fr;
  }
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
  border-color: oklch(0.55 0.04 65 /0.22);
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
  border-color: oklch(0.55 0.04 65 /0.22);
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
  gap: 3px;
}

.status-label {
  font-weight: 600;
  font-size: 13px;
}

.status-value {
  font-size: 12px;
  color: var(--app-text-muted);
}

/* Gearset Summary — fixed 4-col grid (8 jobs = 2 rows of 4) */
.gearset-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 640px) {
  .gearset-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
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
  border-color: oklch(0.55 0.04 65 /0.25);
}

.gs-chip.configured {
  border-color: oklch(0.50 0.16 40 /0.25);
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
  background: oklch(0.55 0.04 65 /0.08);
  border: 1px solid oklch(0.55 0.04 65 /0.15);
  border-radius: 4px;
  padding: 1px 6px;
  margin-left: 8px;
  font-family: inherit;
  cursor: pointer;
  vertical-align: middle;
}

@media (max-width: 768px) {
  .quick-grid {
    grid-template-columns: 1fr;
  }
}

/* ======== Mobile-native layout ======== */
.dashboard.is-mobile {
  padding-top: 4px;
}

.dashboard.is-mobile .welcome h2 {
  display: none;
}

.welcome-greeting {
  margin: 0 0 4px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--app-text);
  line-height: 1.25;
}

.dashboard.is-mobile .view-desc {
  font-size: 14px;
  margin-bottom: 22px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dashboard.is-mobile .section-header h3 {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--app-text-muted);
}

.dashboard.is-mobile .section-gap-sm { margin-top: 22px; }
.dashboard.is-mobile .section-gap-lg { margin-top: 28px; }

/* Workflow cards: bigger, more tactile, full-bleed corners */
.dashboard.is-mobile .workflow-list {
  gap: 8px;
}

.dashboard.is-mobile .workflow-card {
  padding: 14px;
  gap: 14px;
  border-radius: 14px;
  min-height: 64px;
}

.dashboard.is-mobile .wf-icon {
  width: 48px;
  height: 48px;
  font-size: 24px;
  border-radius: 12px;
}

.dashboard.is-mobile .wf-title { font-size: 15px; }
.dashboard.is-mobile .wf-desc { font-size: 12.5px; line-height: 1.4; }

/* Tools row: keep 2-col grid but bigger touch targets */
.dashboard.is-mobile .tools-row {
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.dashboard.is-mobile .tool-card {
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 14px;
  border-radius: 14px;
  min-height: 92px;
  position: relative;
}

.dashboard.is-mobile .tool-icon {
  width: 40px;
  height: 40px;
  font-size: 20px;
  border-radius: 11px;
}

.dashboard.is-mobile .tool-card .wf-arrow {
  position: absolute;
  right: 12px;
  bottom: 12px;
}

.dashboard.is-mobile .tool-badge {
  position: absolute;
  right: 10px;
  top: 10px;
}

/* Status row stacks vertically for clearer scan */
.dashboard.is-mobile .status-row {
  grid-template-columns: 1fr;
  gap: 8px;
}

.dashboard.is-mobile .status-card {
  padding: 14px;
  border-radius: 14px;
}

.dashboard.is-mobile .status-icon { font-size: 22px; }

/* Gearset chips: snug and grid-aligned for thumb taps */
.dashboard.is-mobile .gearset-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.dashboard.is-mobile .gs-chip {
  padding: 10px 12px;
  border-radius: 10px;
  min-height: 44px;
  gap: 8px;
}

.dashboard.is-mobile .gs-name { flex: 1; font-size: 13px; }

/* Inline link in gs-hint sits on its own line for thumb reach */
.dashboard.is-mobile .gs-hint {
  font-size: 12.5px;
  line-height: 1.6;
}
</style>
