<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useGearsetsStore } from '@/stores/gearsets'
import { useBatchStore } from '@/stores/batch'
import { useTimerStore } from '@/stores/timer'
import { useSettingsStore } from '@/stores/settings'
import { useIsMobile } from '@/composables/useMediaQuery'
import { JOB_NAMES, JOB_ICONS } from '@/utils/jobs'
import { isOnboardingComplete } from '@/utils/onboarding'
import WelcomeSetup from '@/components/onboarding/WelcomeSetup.vue'

function getTimeBucket(): 'morning' | 'noon' | 'afternoon' | 'evening' | 'lateNight' {
  const h = new Date().getHours()
  if (h >= 5 && h < 11) return 'morning'
  if (h >= 11 && h < 14) return 'noon'
  if (h >= 14 && h < 18) return 'afternoon'
  if (h >= 18 && h < 22) return 'evening'
  return 'lateNight'
}

const GREETINGS_BY_TIME: Record<string, string[]> = {
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

const router = useRouter()
const gearsets = useGearsetsStore()
const batchStore = useBatchStore()
const timerStore = useTimerStore()
const settingsStore = useSettingsStore()
const isMobile = useIsMobile()

const showOnboarding = ref(
  !isOnboardingComplete()
  && !settingsStore.region
  && !settingsStore.dataCenter
  && !settingsStore.server,
)

function onboardingDone() {
  showOnboarding.value = false
}

const greeting = (() => {
  const pool = GREETINGS_BY_TIME[getTimeBucket()]
  return pool[Math.floor(Math.random() * pool.length)]
})()

const batchTargetCount = computed(() => batchStore.targets.length)
const trackedTimerCount = computed(() => timerStore.trackedItems.length)
const hasActiveWork = computed(() => batchTargetCount.value > 0 || trackedTimerCount.value > 0)
const hasActiveBatch = computed(() => batchTargetCount.value > 0)

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

  <!-- Mobile path — preserve existing stacked layout untouched -->
  <div v-else-if="isMobile" class="view-container dashboard is-mobile">
    <div class="welcome">
      <p class="quote-flavor welcome-quote">{{ greeting }}</p>
      <h2>歡迎回來，冒險者</h2>
      <p class="welcome-greeting">嗨，冒險者 👋</p>
      <p class="view-desc">
        <span>選一個功能開始，或先設定好你的裝備。</span>
      </p>
    </div>

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

    <div class="section-header" style="margin-top: 28px; margin-bottom: 12px">
      <h3>其他製作工具</h3>
    </div>
    <div class="workflow-list">
      <button v-for="wf in workflows" :key="wf.path" class="workflow-card" @click="router.push(wf.path)">
        <span class="wf-icon" :style="{ background: `color-mix(in srgb, ${wf.color} 15%, transparent)` }">{{ wf.icon }}</span>
        <div class="wf-body">
          <span class="wf-title">{{ wf.title }}</span>
          <span class="wf-desc">{{ wf.desc }}</span>
        </div>
        <span class="wf-arrow">→</span>
      </button>
    </div>

    <div class="section-header section-gap-sm">
      <h3>周邊工具</h3>
    </div>
    <div class="tools-row">
      <button v-for="tool in tools" :key="tool.path" class="tool-card" :class="{ disabled: tool.disabled }" :disabled="tool.disabled" @click="!tool.disabled && router.push(tool.path)">
        <span class="tool-icon" :style="{ background: `color-mix(in srgb, ${tool.color} 15%, transparent)` }">{{ tool.icon }}</span>
        <span class="tool-title">{{ tool.title }}</span>
        <span v-if="tool.badge" class="tool-badge">{{ tool.badge }}</span>
        <span v-else class="wf-arrow">→</span>
      </button>
    </div>

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

    <div class="section-header section-gap-lg">
      <h3>裝備狀態</h3>
      <button class="link-btn" @click="router.push('/gearset')">管理裝備 →</button>
    </div>

    <div class="gearset-summary">
      <div v-for="job in Object.keys(JOB_NAMES)" :key="job" class="gs-chip" :class="{ configured: configuredJobs.includes(job) }" @click="router.push('/gearset')">
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

  <!-- Desktop path — wide-viewport 3-tier grid (per spec 2026-04-27) -->
  <div v-else class="view-container dashboard dashboard-wide">
    <!-- Greeting -->
    <header class="dash-greeting">
      <div class="dash-greeting-text">
        <h2 class="dash-greeting-h">歡迎回來</h2>
        <span class="dash-greeting-q">"{{ greeting }}"</span>
      </div>
      <div class="dash-greeting-meta">
        快速跳轉 <kbd class="shortcut-hint">⌘ K</kbd>
      </div>
    </header>

    <!-- TIER 1 — Hero (toast slice) -->
    <button class="dw-hero" @click="router.push('/batch')" type="button">
      <p class="dw-hero-eyebrow">— 主打功能</p>
      <h3 class="dw-hero-title"><span class="dw-hero-icon" aria-hidden="true">📋</span>批量製作</h3>
      <p class="dw-hero-tag">"一次給我清單，剩下交給工坊。"</p>
      <ul class="dw-hero-feats">
        <li v-for="line in batchFeatures" :key="line">{{ line }}</li>
      </ul>
      <div class="dw-hero-cta-row">
        <span class="dw-hero-cta">開始規劃 →</span>
        <span class="dw-hero-cta-meta">5 分鐘搞定一爐 100 件</span>
      </div>
    </button>

    <!-- TIER 1.5 — Pulse rail -->
    <aside class="dw-pulse">
      <section v-if="hasActiveBatch" class="dw-pulse-block">
        <div class="dw-pulse-h">
          <span>進行中 · 批量</span>
          <a class="dw-pulse-link" @click="router.push('/batch')">繼續 →</a>
        </div>
        <div class="dw-batch-line">
          <span class="dw-batch-name">{{ batchTargetCount }} 個配方</span>
          <span class="dw-batch-pct">規劃中</span>
        </div>
        <div class="dw-batch-bar"><i style="width: 30%"></i></div>
      </section>
      <section v-else class="dw-pulse-block">
        <div class="dw-pulse-h">
          <span>進行中 · 批量</span>
        </div>
        <div class="dw-pulse-empty">
          還沒有規劃中的批次 · <a @click="router.push('/batch')">開始一個 →</a>
        </div>
      </section>

      <section v-if="trackedTimerCount > 0" class="dw-pulse-block">
        <div class="dw-pulse-h">
          <span>追蹤中 · {{ trackedTimerCount }} 個素材</span>
          <a class="dw-pulse-link" @click="router.push('/timer')">看全部 →</a>
        </div>
        <div class="dw-pulse-empty">
          🌿 已追蹤 · 開啟採集計時器查看倒數
        </div>
      </section>
    </aside>

    <!-- TIER 2 — Editorial 3-col tools -->
    <section class="dw-tools">
      <div class="dw-tools-h">— 次要工具</div>
      <div class="dw-tools-row">
        <button class="dw-tool-col is-feature" @click="router.push('/simulator')" type="button">
          <div class="dw-tool-head">
            <span class="dw-tool-icon">⚗️</span>
            <div class="dw-tool-meta">
              <span class="dw-tool-name">製作模擬</span>
              <span class="dw-tool-desc">單一配方算最佳手法序，輸出巨集</span>
            </div>
          </div>
          <div class="dw-tool-state">
            <span class="dw-tool-state-label">用途</span>
            <span class="dw-tool-state-value">針對<strong>單一配方</strong>逐步推算手法</span>
          </div>
        </button>
        <button class="dw-tool-col" @click="router.push('/bom')" type="button">
          <div class="dw-tool-head">
            <span class="dw-tool-icon">📜</span>
            <div class="dw-tool-meta">
              <span class="dw-tool-name">購物清單</span>
              <span class="dw-tool-desc">展開素材樹查市價</span>
            </div>
          </div>
          <div class="dw-tool-state">
            <span class="dw-tool-state-label">能做</span>
            <span class="dw-tool-state-value">展開素材 · <strong>跨服比價</strong></span>
          </div>
        </button>
        <button class="dw-tool-col" @click="router.push('/timer')" type="button">
          <div class="dw-tool-head">
            <span class="dw-tool-icon">🌿</span>
            <div class="dw-tool-meta">
              <span class="dw-tool-name">採集計時器</span>
              <span class="dw-tool-desc">追蹤限時採集點</span>
            </div>
          </div>
          <div class="dw-tool-state">
            <span class="dw-tool-state-label">{{ trackedTimerCount > 0 ? '追蹤中' : '能做' }}</span>
            <span class="dw-tool-state-value">
              <template v-if="trackedTimerCount > 0"><strong>{{ trackedTimerCount }}</strong> 個素材</template>
              <template v-else>追蹤<strong>限時節點</strong>倒數</template>
            </span>
          </div>
        </button>
      </div>
    </section>

    <!-- TIER 3 — Footer gear chips -->
    <div class="dw-footer">
      <div class="dw-footer-row">
        <span class="dw-footer-h"><strong>配裝</strong> {{ configuredJobs.length }} / {{ Object.keys(JOB_NAMES).length }}</span>
        <div class="dw-gear-grid">
          <span
            v-for="job in Object.keys(JOB_NAMES)"
            :key="job"
            class="dw-gear-chip"
            :class="{ unset: !configuredJobs.includes(job) }"
            @click="router.push('/gearset')"
          >
            <span class="dw-gear-chip-icon">{{ JOB_ICONS[job] }}</span>
            <span class="dw-gear-chip-name">{{ JOB_NAMES[job] }}</span>
            <span class="dw-gear-chip-lv">{{ configuredJobs.includes(job) ? gearsets.gearsets[job].level : '—' }}</span>
          </span>
        </div>
        <a class="dw-footer-link" @click="router.push('/gearset')">管理 →</a>
      </div>
    </div>
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
.welcome-quote { font-size: 17px; margin-bottom: 6px; line-height: 1.4; }
@media (max-width: 768px) {
  .welcome-quote { margin-top: 12px; font-size: 16px; }
}

/* Batch hero — original mobile-friendly hero (used by .is-mobile path) */
.batch-hero {
  display: flex; flex-direction: column; gap: 12px;
  width: 100%; text-align: left; font: inherit;
  color: var(--app-text);
  padding: 28px 32px; margin: 8px 0 0;
  border-radius: 16px;
  border: 1px solid oklch(0.50 0.16 40 / 0.30);
  background:
    linear-gradient(140deg, oklch(0.50 0.16 40 / 0.06) 0%, oklch(0.50 0.16 40 / 0) 60%),
    var(--app-surface);
  cursor: pointer;
  box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.6), 0 2px 8px oklch(0.40 0.05 60 / 0.06);
  transition: transform 0.2s var(--ease-out-quart), border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart);
}
.batch-hero:hover { transform: translateY(-1px); border-color: oklch(0.50 0.16 40 / 0.55); box-shadow: inset 0 1px 0 oklch(1 0 0 / 0.6), 0 8px 22px oklch(0.40 0.05 60 / 0.10); }
.batch-hero:focus-visible { outline: 2px solid var(--app-craft); outline-offset: 3px; }
.batch-hero-head { display: flex; flex-direction: column; gap: 6px; }
.batch-hero-eyebrow { font-family: 'Fira Code', monospace; font-size: 10.5px; letter-spacing: 0.3em; text-transform: uppercase; color: var(--app-craft); }
.batch-hero-title { font-family: 'Noto Serif TC', serif; font-size: 28px; font-weight: 800; margin: 0; display: flex; align-items: center; gap: 12px; letter-spacing: 0.5px; line-height: 1.1; }
.batch-hero-icon { font-size: 32px; line-height: 1; }
.batch-hero-tagline { font-family: 'Cormorant Garamond', serif; font-style: italic; font-size: 16px; color: var(--app-craft); margin: 0; letter-spacing: 0.01em; }
.batch-hero-features { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 18px; font-size: 13px; color: var(--app-text-muted); }
.batch-hero-features li { display: flex; align-items: baseline; gap: 8px; line-height: 1.5; }
.batch-hero-features li::before { content: '·'; color: var(--app-craft); font-weight: 700; font-size: 18px; flex-shrink: 0; }
.batch-hero-cta { margin-top: 10px; display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; background: var(--app-craft); color: oklch(0.99 0 0); border-radius: 10px; font-weight: 700; font-size: 13.5px; align-self: flex-start; box-shadow: 0 2px 6px oklch(0.50 0.16 40 / 0.30); transition: transform 0.18s var(--ease-out-quart); }
.batch-hero:hover .batch-hero-cta { transform: translateX(2px); }
@media (max-width: 640px) {
  .batch-hero { padding: 20px; border-radius: 14px; }
  .batch-hero-title { font-size: 22px; }
  .batch-hero-icon { font-size: 26px; }
  .batch-hero-features { grid-template-columns: 1fr; gap: 4px; }
}

.workflow-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 480px) { .workflow-list { grid-template-columns: 1fr; } }
.workflow-card { display: flex; align-items: center; gap: 14px; padding: 16px; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 10px; cursor: pointer; text-align: left; color: var(--app-text); transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart); }
.workflow-card:hover { border-color: oklch(0.55 0.04 65 /0.22); box-shadow: 0 1px 8px rgba(0, 0, 0, 0.15); }
.wf-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
.wf-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.wf-title { font-weight: 600; font-size: 14px; }
.wf-desc { font-size: 12px; color: var(--app-text-muted); }
.wf-arrow { font-size: 16px; color: var(--app-text-muted); transition: transform 0.15s; }
.workflow-card:hover .wf-arrow, .tool-card:hover .wf-arrow { transform: translateX(3px); }

.tools-row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
@media (max-width: 480px) { .tools-row { grid-template-columns: 1fr; } }
.tool-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 10px; cursor: pointer; color: var(--app-text); transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart); }
.tool-card:hover { border-color: oklch(0.55 0.04 65 /0.22); box-shadow: 0 1px 8px rgba(0, 0, 0, 0.15); }
.tool-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
.tool-title { font-weight: 600; font-size: 14px; flex: 1; }
.tool-card.disabled { cursor: not-allowed; opacity: 0.55; }
.tool-card.disabled:hover { border-color: var(--app-border); box-shadow: none; }
.tool-badge { padding: 2px 8px; font-size: 11px; font-weight: 500; line-height: 1.4; color: var(--app-text-muted); background: var(--el-fill-color-lighter); border: 1px solid var(--app-border); border-radius: 999px; letter-spacing: 0.5px; }

.section-gap-sm { margin-top: 24px; }
.section-gap-lg { margin-top: 36px; }
.section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-header h3 { font-size: 15px; font-weight: 600; color: var(--app-text); margin: 0; }
.link-btn { background: none; border: none; color: var(--app-accent-light); font-size: 13px; cursor: pointer; padding: 0; }
.link-btn:hover { text-decoration: underline; }

.status-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; }
.status-card { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--app-surface); border: 1px solid var(--app-border); border-radius: 10px; cursor: pointer; color: var(--app-text); text-align: left; transition: border-color 0.2s var(--ease-out-quart), box-shadow 0.2s var(--ease-out-quart); }
.status-card:hover { border-color: oklch(0.55 0.04 65 /0.22); box-shadow: 0 1px 8px rgba(0, 0, 0, 0.15); }
.status-card:hover .wf-arrow { transform: translateX(3px); }
.status-icon { font-size: 20px; flex-shrink: 0; }
.status-body { flex: 1; display: flex; flex-direction: column; gap: 3px; }
.status-label { font-weight: 600; font-size: 13px; }
.status-value { font-size: 12px; color: var(--app-text-muted); }

.gearset-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 640px) { .gearset-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.gs-chip { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--app-border); background: var(--app-surface); font-size: 13px; cursor: pointer; transition: border-color 0.15s; }
.gs-chip:hover { border-color: oklch(0.55 0.04 65 /0.25); }
.gs-chip.configured { border-color: oklch(0.50 0.16 40 /0.25); }
.gs-icon { font-size: 16px; }
.gs-name { color: var(--app-text); font-weight: 500; }
.gs-lv { color: var(--app-craft); font-size: 12px; font-weight: 500; }
.gs-empty { color: var(--app-text-muted); font-size: 12px; }
.gs-hint { margin-top: 10px; font-size: 13px; color: var(--app-text-muted); }
.inline-link { background: none; border: none; color: var(--app-accent-light); cursor: pointer; font-size: 13px; padding: 0; text-decoration: underline; }

.shortcut-hint { font-size: 11px; color: var(--app-text-muted); background: oklch(0.55 0.04 65 /0.08); border: 1px solid oklch(0.55 0.04 65 /0.15); border-radius: 4px; padding: 1px 6px; margin-left: 8px; font-family: inherit; cursor: pointer; vertical-align: middle; }

/* ======== Mobile-native layout (untouched) ======== */
.dashboard.is-mobile { padding-top: 4px; }
.dashboard.is-mobile .welcome h2 { display: none; }
.welcome-greeting { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: -0.01em; color: var(--app-text); line-height: 1.25; }
.dashboard.is-mobile .view-desc { font-size: 14px; margin-bottom: 22px; display: flex; align-items: center; gap: 6px; }
.dashboard.is-mobile .section-header h3 { font-size: 12px; font-weight: 600; letter-spacing: 0.4px; color: var(--app-text-muted); }
.dashboard.is-mobile .section-gap-sm { margin-top: 22px; }
.dashboard.is-mobile .section-gap-lg { margin-top: 28px; }
.dashboard.is-mobile .workflow-list { gap: 8px; }
.dashboard.is-mobile .workflow-card { padding: 14px; gap: 14px; border-radius: 14px; min-height: 64px; }
.dashboard.is-mobile .wf-icon { width: 48px; height: 48px; font-size: 24px; border-radius: 12px; }
.dashboard.is-mobile .wf-title { font-size: 15px; }
.dashboard.is-mobile .wf-desc { font-size: 12.5px; line-height: 1.4; }
.dashboard.is-mobile .tools-row { grid-template-columns: repeat(2, 1fr); gap: 8px; }
.dashboard.is-mobile .tool-card { flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; border-radius: 14px; min-height: 92px; position: relative; }
.dashboard.is-mobile .tool-icon { width: 40px; height: 40px; font-size: 20px; border-radius: 11px; }
.dashboard.is-mobile .tool-card .wf-arrow { position: absolute; right: 12px; bottom: 12px; }
.dashboard.is-mobile .tool-badge { position: absolute; right: 10px; top: 10px; }
.dashboard.is-mobile .status-row { grid-template-columns: 1fr; gap: 8px; }
.dashboard.is-mobile .status-card { padding: 14px; border-radius: 14px; }
.dashboard.is-mobile .status-icon { font-size: 22px; }
.dashboard.is-mobile .gearset-summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
.dashboard.is-mobile .gs-chip { padding: 10px 12px; border-radius: 10px; min-height: 44px; gap: 8px; }
.dashboard.is-mobile .gs-name { flex: 1; font-size: 13px; }
.dashboard.is-mobile .gs-hint { font-size: 12.5px; line-height: 1.6; }

/* ======================================================================
 * Dashboard wide (desktop ≥ 1100px) — 3-tier grid per spec 2026-04-27
 * ====================================================================== */

.dashboard.dashboard-wide {
  max-width: 2400px;
  padding: 36px 72px 80px;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(380px, 0.85fr);
  column-gap: 56px;
  row-gap: 64px;
}

/* Greeting */
.dash-greeting {
  grid-column: 1 / -1;
  display: flex; align-items: baseline; justify-content: space-between;
}
.dash-greeting-text { display: flex; align-items: baseline; gap: 18px; }
.dash-greeting-h {
  font-family: 'Noto Serif TC', serif; font-weight: 700;
  font-size: 36px; margin: 0; letter-spacing: 2px; color: var(--app-text);
  border: none; padding: 0;
}
.dash-greeting-q {
  font-family: 'Cormorant Garamond', 'Noto Serif TC', serif;
  font-style: italic; font-size: 22px;
  color: var(--app-text-muted);
}
.dash-greeting-meta {
  font-family: 'Fira Code', monospace; font-size: 13px;
  color: var(--app-text-muted); letter-spacing: 0.05em;
  display: flex; align-items: center; gap: 6px;
}

/* TIER 1 — Hero (toast slice)
 * Light: cream surface + 頂部柔光（吐司切片內裡）
 * Dark: 純 dark surface + 同樣柔光（光的色相不變，亮度感保留） */
.dw-hero {
  grid-column: 1;
  position: relative;
  padding: 56px 52px;
  background:
    radial-gradient(ellipse 70% 32% at 50% 0%, var(--toast-crust-glow, oklch(0.97 0.04 82 / 0.42)) 0%, transparent 75%),
    var(--app-surface);
  border: 1px solid var(--toast-crust-soft);
  color: var(--app-text); text-align: left; font: inherit;
  border-radius: 18px;
  overflow: hidden; cursor: pointer;
  display: flex; flex-direction: column;
  transition: transform 0.2s var(--ease-out-quart);
}
.dw-hero:hover { transform: translateY(-1px); }
.dw-hero:focus-visible { outline: 2px solid var(--app-craft); outline-offset: 3px; }
.dw-hero::before {
  content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  border: solid var(--toast-crust);
  border-width: 3px 1.5px 0 1.5px;
  border-radius: 18px;
  -webkit-mask: linear-gradient(to bottom,
    black 0% 6%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.18) 55%, transparent 80%);
          mask: linear-gradient(to bottom,
    black 0% 6%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.18) 55%, transparent 80%);
}
.dw-hero::after {
  content: ""; position: absolute; inset: 0;
  background-image: var(--paper-noise); background-size: var(--paper-noise-size);
  opacity: 0.45; pointer-events: none;
}
.dw-hero > * { position: relative; z-index: 2; }
.dw-hero-eyebrow {
  font-size: 12px; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--app-accent);
  margin: 0 0 16px;
}
.dw-hero-title {
  font-family: 'Noto Serif TC', serif; font-weight: 900;
  font-size: 76px; line-height: 1; margin: 0 0 22px;
  letter-spacing: 3px; color: var(--app-text);
  display: flex; align-items: center; gap: 18px;
}
.dw-hero-icon { font-size: 64px; line-height: 1; }
.dw-hero-tag {
  font-family: 'Cormorant Garamond', serif; font-style: italic;
  font-size: 22px; color: var(--app-text-muted); margin: 0 0 32px;
}
.dw-hero-feats {
  list-style: none; margin: 0 0 36px; padding: 0;
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px 36px;
  font-size: 15px; color: var(--app-text-muted);
}
.dw-hero-feats li { display: flex; align-items: baseline; gap: 8px; line-height: 1.5; }
.dw-hero-feats li::before { content: '·'; color: var(--app-accent); font-weight: 700; font-size: 18px; flex-shrink: 0; }
.dw-hero-cta-row { display: flex; align-items: center; gap: 18px; }
.dw-hero-cta {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 14px 26px; border-radius: 10px;
  background: var(--app-accent); color: oklch(0.98 0.02 80);
  font-size: 15px; font-weight: 700; letter-spacing: 0.04em;
  box-shadow: 0 2px 8px oklch(0.65 0.18 65 / 0.20);
  transition: transform 0.18s var(--ease-out-quart);
}
.dw-hero:hover .dw-hero-cta { transform: translateX(2px); }
.dw-hero-cta-meta {
  font-family: 'Cormorant Garamond', serif; font-style: italic;
  color: var(--app-text-muted); font-size: 15px;
}

/* TIER 1.5 — Pulse rail */
.dw-pulse {
  grid-column: 2;
  display: flex; flex-direction: column; gap: 36px;
  padding-top: 12px;
}
.dw-pulse-block { display: flex; flex-direction: column; gap: 10px; }
.dw-pulse-h {
  font-size: 11px; font-weight: 700; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--app-text-muted);
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 6px;
}
.dw-pulse-link {
  font-size: 12px; font-weight: 600; color: var(--app-accent);
  text-transform: none; letter-spacing: 0.02em; cursor: pointer;
}
.dw-pulse-link:hover { text-decoration: underline; }

.dw-batch-line {
  display: flex; align-items: baseline; justify-content: space-between;
}
.dw-batch-name {
  font-family: 'Noto Serif TC', serif; font-weight: 700;
  font-size: 22px; letter-spacing: 1px; color: var(--app-text);
}
.dw-batch-pct {
  font-family: 'Fira Code', monospace; font-size: 13px;
  color: var(--app-text-muted); font-weight: 600;
}
.dw-batch-bar {
  height: 8px; border-radius: 999px;
  background: var(--app-surface-2);
  overflow: hidden;
}
.dw-batch-bar > i {
  display: block; height: 100%;
  background: linear-gradient(90deg, var(--app-accent), oklch(0.55 0.18 60));
}

.dw-pulse-empty {
  font-size: 13px; color: var(--app-text-muted);
  padding: 10px 0;
}
.dw-pulse-empty a { color: var(--app-accent); cursor: pointer; font-weight: 600; }
.dw-pulse-empty a:hover { text-decoration: underline; }

/* TIER 2 — Editorial 3-col tools */
.dw-tools {
  grid-column: 1 / -1;
  display: flex; flex-direction: column; gap: 18px;
  padding-top: 28px;
  border-top: 1px solid var(--app-border);
}
.dw-tools-h {
  font-size: 11px; font-weight: 700; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--app-text-muted);
}
.dw-tools-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: auto auto;
  row-gap: 14px;
}
.dw-tool-col {
  padding: 4px 36px;
  border-left: 1px solid var(--app-border);
  display: grid;
  grid-template-rows: subgrid;
  grid-row: span 2;
  cursor: pointer;
  min-width: 0;
  background: none; font: inherit; color: inherit; text-align: left;
}
.dw-tool-col:first-child { border-left: 0; padding-left: 0; }
.dw-tool-col:last-child { padding-right: 0; }
.dw-tool-col:hover .dw-tool-name { color: var(--app-accent); }
.dw-tool-col:focus-visible { outline: 2px solid var(--app-craft); outline-offset: 4px; border-radius: 4px; }
.dw-tool-head { display: flex; align-items: center; gap: 14px; min-width: 0; }
.dw-tool-icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--app-surface-2);
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 20px; flex-shrink: 0;
}
.dw-tool-col.is-feature .dw-tool-icon { width: 52px; height: 52px; font-size: 26px; border-radius: 12px; }
.dw-tool-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dw-tool-name {
  font-family: 'Noto Serif TC', serif; font-weight: 700;
  font-size: 18px; line-height: 1.2; letter-spacing: 1px;
  color: var(--app-text);
  transition: color 0.15s;
}
.dw-tool-col.is-feature .dw-tool-name { font-size: 22px; }
.dw-tool-desc { font-size: 13px; color: var(--app-text-muted); }
.dw-tool-state {
  padding-top: 12px;
  border-top: 1px dashed var(--app-border);
  display: flex; flex-direction: column; gap: 4px;
}
.dw-tool-state-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--app-text-muted);
}
.dw-tool-state-value { font-size: 13px; color: var(--app-text); font-weight: 600; }
.dw-tool-state-value strong { color: var(--app-accent); font-weight: 700; }

/* TIER 3 — Footer gear chips */
.dw-footer {
  grid-column: 1 / -1;
  padding-top: 22px;
  border-top: 1px dashed var(--app-border);
}
.dw-footer-row {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 6px 14px;
}
.dw-footer-h {
  font-size: 13px; font-weight: 600; color: var(--app-text-muted);
  letter-spacing: 0.04em; white-space: nowrap;
}
.dw-footer-h strong { color: var(--app-text); font-weight: 700; }
.dw-footer-link {
  margin-left: auto;
  font-size: 13px; font-weight: 600; color: var(--app-accent);
  text-decoration: none; cursor: pointer; white-space: nowrap;
}
.dw-footer-link:hover { text-decoration: underline; }
.dw-gear-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.dw-gear-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 11px;
  background: var(--app-surface-2); border-radius: 999px;
  font-size: 12px; min-width: 0; cursor: pointer;
  transition: border-color 0.15s;
}
.dw-gear-chip.unset {
  opacity: 0.55;
  background: transparent;
  border: 1px dashed var(--app-border);
  padding: 4px 10px;
}
.dw-gear-chip-icon { font-size: 14px; line-height: 1; }
.dw-gear-chip-name { font-size: 12px; color: var(--app-text); font-weight: 500; }
.dw-gear-chip-lv {
  font-family: 'Fira Code', monospace; font-size: 11px; font-weight: 700;
  color: var(--app-accent); line-height: 1;
}
.dw-gear-chip.unset .dw-gear-chip-lv { color: var(--app-text-muted); }

/* Wide-viewport breakpoints */
@media (max-width: 1500px) {
  .dashboard.dashboard-wide { padding: 32px 48px 64px; column-gap: 40px; }
  .dw-hero { padding: 44px 40px; }
  .dw-hero-title { font-size: 60px; letter-spacing: 2px; }
  .dw-hero-icon { font-size: 52px; }
}
@media (max-width: 1100px) {
  .dashboard.dashboard-wide { grid-template-columns: 1fr; row-gap: 48px; }
  .dw-hero, .dw-pulse { grid-column: 1; }
  .dw-tools-row { grid-template-columns: 1fr; }
  .dw-tool-col { border-left: 0; padding: 12px 0; border-top: 1px dashed var(--app-border); grid-template-rows: auto auto; }
  .dw-tool-col:first-child { border-top: 0; padding-top: 4px; }
}
</style>
