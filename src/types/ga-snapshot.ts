// src/types/ga-snapshot.ts

export type WindowKey = '7d' | '14d' | '28d'
export type PageFamily = 'core' | 'craft' | 'gather' | 'company' | 'meta' | 'market'
export type FailureEvent = 'solver' | 'batch' | 'wasm'
export type VitalMetric = 'INP' | 'TTFB' | 'CLS' | 'FCP' | 'LCP'
export type StepTone = 'neutral' | 'success' | 'danger' | 'warn'
export type Q4Flag = 'ok' | 'warn' | 'danger' | 'noise'

export interface PageRow {
  path: string
  title: string
  family: PageFamily
  views: number
  users: number
  sessions: number
  engagement: number
  bounce: number
  avgSession: number
}

export interface FunnelStep {
  step: string
  count: number
  tone: StepTone
}

export interface SimulatorFunnel {
  entry: { label: string; count: number; users: number }
  macroCopy: { label: string; count: number; users: number }
  globalContext: Array<{ label: string; count: number }>
}

export interface FailureRow {
  event: FailureEvent
  reason: string
  count: number
}

export interface VitalRow {
  metric: VitalMetric
  good: number
  ni: number
  poor: number
}

export interface Q4Funnel {
  name: string
  label: string
  from: number
  to: number
  note: string
  flag: Q4Flag
}

export interface MarketRegionRow {
  event: string
  notset: number
  unset: number
  cht?: number
  intl?: number
}

// =====================================================
//  v2 additive shapes — schemaVersion stays 1.
//  Every MetricsBundle field below is optional; old snapshots
//  without these dims still parse and charts render a placeholder.
// =====================================================

/** A single region-scoped glance value used in RegionSplitLedger rows. */
export interface RegionGlance {
  /** Primary numeric value — interpretation depends on the row
   *  (activeUsers→total, solver/batch→starts, bom→calculates, infra→warnings). */
  value: number
  /** Rate 0–1 for rows that have one (solver/batch/bom complete or handoff). */
  sparkPct?: number
  /** Free-form short note rendered below the cell (zh-TW preferred). */
  secondary?: string
  /** Used on infra row only — surfaces danger/warn tinting. */
  tone?: 'danger' | 'warn'
}

/** Chart #3 — Tool usage row per RLV bucket */
export interface ToolUsageRow {
  /** Expansion-aligned RLV range label: '≤300' | '301–510' | '511–600' | '601–680' | '681+'. */
  bucket: string
  /** Total times any recipe in this bucket was opened (recipe_select). */
  selectCount: number
  /** solver_start count for recipes in this bucket. */
  simulatorCount: number
  /** batch_optimization_start count where ANY targeted recipe falls in this
   *  bucket. A multi-RLV batch contributes to multiple buckets. */
  batchTargetCount: number
  /** bom_target_add count for recipes in this bucket. */
  bomTargetCount: number
}

/** Chart #4 — Taxonomy bundle */
export interface RlvBucket {
  bucket: '≤300' | '301–510' | '511–600' | '601–680' | '681+' // expansion-aligned RLV buckets
  events: number // recipe_select count (rlv lives on recipe_select, not solver_start)
}

/**
 * `starts`/`completes`/`macroCopies` are human-only (#200): machine-loop rows
 * (`isMachineSolveRow()`) are filtered out before bucketing so a matrix cell
 * never gets padded by batch-optimizer/buff-recommender/meld-advisor noise.
 */
export interface TaxonomyCell {
  isExpert: boolean
  isCollectable: boolean
  starts: number
  completes: number
  macroCopies: number
  completeRate: number // 0–1
  macroCopyRate: number // 0–1, denominator = completes
}

/** `starts`/`completeRate` are human-only (#200) — see `TaxonomyCell` doc above. */
export interface CraftKindRow {
  kind: 'normal' | 'expert' | 'quick' | 'custom_delivery' | 'company'
  starts: number
  completeRate: number // 0–1
}

/** Chart #5 — Misuse signal */
export interface MisuseRow {
  type: 'single_recipe_in_batch' | 'large_queue_in_simulator' | 'bom_without_quantity'
  /** Display label for the misuse type — zh-TW preferred. */
  label: string
  /** Italic editorial gloss explaining the misuse (one sentence). */
  gloss: string
  eventCount: number
  affectedUsers: number
}

/** Chart #7 — API failures */
export interface ApiFailureCell {
  api: 'xivapi' | 'universalis'
  status: number // HTTP status; 0 = network error
  count: number
}

export interface ApiFailureEndpoint {
  api: 'xivapi' | 'universalis'
  endpoint: string // truncated to ~50 chars by buildBundle()
  status: number
  count: number
}

/**
 * Chart #1 — RegionSplitLedger: four event-scoped metrics × three regions.
 * `activeUsers` is deliberately NOT a key here (#202): `market_region` is a
 * user-scoped property, so GA dedupes each region bucket independently but
 * NOT across buckets — a user who starts the window unset and later
 * completes onboarding is counted in both 'unset' and 'cht'. The other four
 * rows are event-scoped (an event either happened in a cht session or it
 * didn't) and safe to bucket. The ledger's first row renders un-split;
 * see RegionSplitLedger.vue.
 */
export interface ByRegion {
  solver: { cht: RegionGlance; intl: RegionGlance; unset: RegionGlance }
  batch: { cht: RegionGlance; intl: RegionGlance; unset: RegionGlance }
  bom: { cht: RegionGlance; intl: RegionGlance; unset: RegionGlance }
  infra: { cht: RegionGlance; intl: RegionGlance; unset: RegionGlance }
}

/** Charts #4a + #4b bundle. */
export interface TaxonomyBundle {
  rlvHistogram: RlvBucket[]
  matrix: TaxonomyCell[]
  craftKindBreakdown: CraftKindRow[]
}

/** Chart #7 bundle. */
export interface ApiFailures {
  matrix: ApiFailureCell[]
  topEndpoints: ApiFailureEndpoint[]
}

/**
 * `glance.api` — universalis 真故障率的分子分母（#201）——三者同源取 `universalis_fetch`，
 * 不與 `apiFailures`（走 `api_failure`）混用，兩條流不同步 ~3.5%（#189 決定 3）。
 *
 * Optional (v2-additive pattern, same as `byRegion` / `misuseSignals` below): the 77 pre-#201
 * daily snapshots under `gh-data/history/` were generated without this field and are frozen —
 * they will never be backfilled. `ga-thresholds.ts`'s `pick()` guards with `?.` so feeding one
 * of those historical bundles into `evaluate()` (#205) resolves to `state: 'absent'` instead of
 * throwing.
 */
export interface GlanceApi {
  /** universalis_fetch 全部（分母）。 */
  universalisCalls: number
  /** ok=false & status=0（真故障，進分子）。 */
  universalisRealFails: number
  /** ok=false & status=404（查無掛單，常駐註腳用，不進分子）。 */
  universalisNoListing: number
  /**
   * ok=false 但 status 既非 0 亦非 404（例如未知 5xx、或轉型失敗的 `(not set)`）——常駐註腳用，
   * 不進分子，也刻意不改變 #189 決定 3 的分子定義。存在目的是讓這類事故在 snapshot 裡可見，
   * 不會無聲被分母稀釋掉（見 #201 review N4）。
   */
  universalisOtherFails?: number
}

export interface MetricsBundle {
  window: { days: number; startDate: string; endDate: string }
  glance: {
    /**
     * `total`/`returningPct`（#202）——`total` 來自無維度的單次 totalUsers 查詢，
     * 不是 `new + returning + other` 三桶相加（那會灌水 ~27.8%，因為
     * newVsReturning 是 session-scoped，同一使用者可能同時落在 new 與
     * returning）。`returningPct` 分母同步換成 `total`。`new`/`returning` 未變動
     * ——它們本來就是乾淨的單列使用者數，仍只能取自 flip（newVsReturning）查詢。
     */
    activeUsers: { total: number; new: number; returning: number; returningPct: number }
    /**
     * `starts`/`completes`/`fails`/`completePct` 維持全量（含機器迴圈：batch-optimizer /
     * buff-recommender / meld-advisor），語意不變。`human*` 五欄（#200）套用 `isMachineSolveRow()`
     * 判別式（`craft_kind` 缺席 `(not set)`/`''` OR `source === 'machine'`）排除機器解後的人類子集
     * ——`completePct` 71 天有 63 天 >100%（#181 探測）的污染分母正是 `starts`/`completes` 這兩欄，
     * 人類分母 `humanCompletePct` 是 #200 驗收條件（應 ≤100%）的量測對象。
     *
     * Optional（v2-additive，同 `api` 欄位下方）：`gh-data/history/` 的歷史快照沒有這五欄且不會
     * 回填，`ga-thresholds.ts` 的 `pick()` 要 guard，讓歷史快照落到 `state: 'absent'` 而非讓
     * `evaluate()` 整圈拋錯（#201 踩過的坑）。
     */
    solver: {
      starts: number; completes: number; fails: number; completePct: number
      /** 人類 `solver_start`（分母，#200）。 */
      humanStarts?: number
      /** 人類 `solver_complete`（#200）。 */
      humanCompletes?: number
      /** 人類 `solver_failed`（#200）——`solver_failed` 從沒帶過 taxonomy，需累積約 3 天才有 n≥30。 */
      humanFails?: number
      /** `humanCompletes / humanStarts`（#200）——驗收條件：應 ≤100%。 */
      humanCompletePct?: number
      /**
       * `solver_macro_copy` 全量（#200）——固定只有人類會發（三條複製 UI 都是使用者點擊觸發，
       * 機器迴圈路徑不呼叫任何複製 UI），不需要 `isMachineSolveRow()` 過濾。
       */
      macroCopies?: number
    }
    batch: { starts: number; completes: number; fails: number; cancelled: number; completePct: number }
    bom: { calculates: number; sentToBatch: number; handoffPct: number }
    infra: { sabUnavailable: number; wasmLoadFailed: number }
    /** See `GlanceApi` doc. Optional — absent on all pre-#201 history. */
    api?: GlanceApi
  }
  pages: PageRow[]
  solverFunnel: FunnelStep[]
  batchFunnel: FunnelStep[]
  simulatorFunnel: SimulatorFunnel
  failures: FailureRow[]
  vitals: VitalRow[]
  q4Funnels: Q4Funnel[]
  marketRegion: MarketRegionRow[]

  // ---------- v2 ADDITIVE — all optional, schemaVersion stays 1 ----------

  /** Chart #1 — RegionSplitLedger. */
  byRegion?: ByRegion
  /** Chart #3 — ToolUsageByRlv. */
  toolUsageByRlv?: ToolUsageRow[]
  /** Charts #4a + #4b — RecipeDifficultyKind + ExpertCollectableMatrix. */
  taxonomy?: TaxonomyBundle
  /** Chart #5 — MisuseHintTally. */
  misuseSignals?: MisuseRow[]
  /** Chart #7 — ApiFailureEndpoints. */
  apiFailures?: ApiFailures
}

export interface GaSnapshot {
  schemaVersion: 1
  generatedAt: string  // ISO 8601
  propertyId: string
  windows: Record<WindowKey, MetricsBundle>
}
