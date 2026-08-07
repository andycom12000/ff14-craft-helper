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
import { ref, computed } from 'vue'
import type { RuleTrends, TrendPoint } from '@/analytics/ga-evaluate'

const TRENDS_URL_PROD = 'https://raw.githubusercontent.com/andycom12000/ff14-craft-helper/gh-data/trends.json'
const TRENDS_URL_DEV  = `${import.meta.env.BASE_URL}data/ga-trends.json`

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

const trendFile = ref<GaTrendFile | null>(null)
const loading = ref(true)
const error = ref<Error | null>(null)

export function useGaTrends() {
  // `trends` is derived, not the fetched payload itself — `evaluate()` only ever needs the
  // reshaped `RuleTrends`, and computing it lazily means a failed fetch degrades to `{}` (see
  // catch branch below) without a second conversion step at every call site.
  const trends = computed<RuleTrends>(() => (trendFile.value ? toRuleTrends(trendFile.value) : {}))

  async function load() {
    loading.value = true
    error.value = null
    try {
      const url = import.meta.env.DEV ? TRENDS_URL_DEV : TRENDS_URL_PROD
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`trends fetch ${res.status}`)
      trendFile.value = (await res.json()) as GaTrendFile
    } catch (err) {
      // Trends are supplementary — a fetch failure must not block the todo ledger itself.
      // `evaluate()` treats a rule id missing from `trends` as "no history yet" (same path a
      // brand-new rule takes on day 1), so degrading to `{}` here just means every verdict's
      // `streak`/`streakCensored`/`lastFire` come back at their zero values instead of surfacing
      // a second error state next to `useGaSnapshot`'s.
      error.value = err as Error
      trendFile.value = null
    } finally {
      loading.value = false
    }
  }

  return { trends, loading, error, load }
}
