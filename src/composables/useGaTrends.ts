// src/composables/useGaTrends.ts
//
// Fetches the independent trend file produced by `scripts/dev/ga-build-trend.mjs` (#205 / #191
// 決定 5) and reshapes it into `RuleTrends` — the `(obs, n)` history shape `evaluate()`
// (`src/analytics/ga-evaluate.ts`) walks for streak/censored/lastFire. Mirrors
// `useGaSnapshot.ts`'s dev/prod URL split and module-level singleton-ref pattern on purpose (same
// fetch semantics, same "只在自己的 worktree 起 dev server 才看得到本機 fixture" convention).
//
// The trend file's own shape (`dates: string[]` + `series[id]: (null | [obs, n])[]`, index-aligned
// to `dates`) is NOT `RuleTrends` — it's the compact wire format `ga-build-trend.mjs` writes
// (avoids repeating each date string once per rule id). `toRuleTrends()` below re-attaches the
// date onto every point, producing exactly the `TrendPoint[]` shape `evaluate()` expects.
//
// #207 — 加了 `bundleWindow` 參數：`ga-build-trend.mjs` 支援 `--bundle-window 7d|14d|28d`
// （見該檔頭註解），production 現在跑兩次 build 產出兩個獨立檔案（`.github/workflows/
// ga-snapshot.yml` 的兩個「Build trend file」步驟）——`trends.json`（28d，本期待辦固定吃這個，
// #191 決定 5）與 `trends-7d.json`（7d，RegionSplitLedger 的 WoW + sparkline 專用，#184 決定 2/5：
// 「28d 滾動視窗畫不出趨勢」，sparkline 必須用 7d 視窗）。**module-level 的 fetch 狀態刻意 keyed by
// bundleWindow**（`STATE` 這個小型 cache），不是單一共用 singleton——這兩個視窗的資料完全獨立
// （不同的 `--bundle-window` 產出不同的 `(obs, n)` 序列），若沿用改參數前那種「模組頂層一份 ref」
// 的寫法，`useGaTrends('7d')` 與 `useGaTrends('28d')` 會共寫同一份 `trendFile` ref，後呼叫的
// `load()` 會把先呼叫那個的資料整個覆蓋掉——GaDashboardView.vue 同一頁面兩者都要用，這個 bug
// 會立即發生，不是理論風險。
import { ref, computed, type Ref } from 'vue'
import type { RuleTrends, TrendPoint } from '@/analytics/ga-evaluate'

export type TrendBundleWindow = '7d' | '28d'

const TRENDS_URL: Record<TrendBundleWindow, { prod: string; dev: string }> = {
  '28d': {
    prod: 'https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/trends.json',
    dev: `${import.meta.env.BASE_URL}data/ga-trends.json`,
  },
  '7d': {
    prod: 'https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/trends-7d.json',
    dev: `${import.meta.env.BASE_URL}data/ga-trends-7d.json`,
  },
}

interface GaTrendFile {
  schemaVersion: number
  generatedAt: string
  window: { days: number; bundleWindow: '7d' | '14d' | '28d' }
  dates: string[]
  series: Record<string, (readonly [number, number] | null)[]>
}

function toRuleTrends(file: GaTrendFile): RuleTrends {
  const out: RuleTrends = {}
  for (const [id, points] of Object.entries(file.series)) {
    out[id] = points.map((point, i): TrendPoint => {
      if (point === null) return null
      const [obs, n] = point
      return { date: file.dates[i], obs, n }
    })
  }
  return out
}

interface TrendState {
  trendFile: Ref<GaTrendFile | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
}

/** 每個 `bundleWindow` 各自一份 singleton state——見檔頭註解，不要合併成一份共用 ref。 */
const STATE: Record<TrendBundleWindow, TrendState> = {
  '28d': { trendFile: ref(null), loading: ref(true), error: ref(null) },
  '7d': { trendFile: ref(null), loading: ref(true), error: ref(null) },
}

export function useGaTrends(bundleWindow: TrendBundleWindow = '28d') {
  const state = STATE[bundleWindow]

  // `trends` is derived, not the fetched payload itself — `evaluate()` only ever needs the
  // reshaped `RuleTrends`, and computing it lazily means a failed fetch degrades to `{}` (see
  // catch branch below) without a second conversion step at every call site.
  const trends = computed<RuleTrends>(() => (state.trendFile.value ? toRuleTrends(state.trendFile.value) : {}))

  async function load() {
    state.loading.value = true
    state.error.value = null
    try {
      const url = import.meta.env.DEV ? TRENDS_URL[bundleWindow].dev : TRENDS_URL[bundleWindow].prod
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`trends fetch ${res.status}`)
      state.trendFile.value = (await res.json()) as GaTrendFile
    } catch (err) {
      // Trends are supplementary — a fetch failure must not block the todo ledger itself.
      // `evaluate()` treats a rule id missing from `trends` as "no history yet" (same path a
      // brand-new rule takes on day 1), so degrading to `{}` here just means every verdict's
      // `streak`/`streakCensored`/`lastFire` come back at their zero values instead of surfacing
      // a second error state next to `useGaSnapshot`'s.
      state.error.value = err as Error
      state.trendFile.value = null
    } finally {
      state.loading.value = false
    }
  }

  return { trends, loading: state.loading, error: state.error, load }
}
