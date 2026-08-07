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
  /**
   * #211 — `batch_optimization_failed` 的 `calc_mode` 維度分佈（'macro' | 'quick-buy'）。
   * `count` above stays the full aggregate (unchanged semantics, sums every calc_mode incl.
   * the `(not set)` sentinel) — this is a strict addition, not a replacement.
   *
   * `undefined`, never `[]` populated with zeros: `solver`/`wasm` rows structurally never carry
   * `calc_mode` (the param only exists on batch events), and even `event === 'batch'` rows can
   * have zero attributable rows if every matching instance predates the dimension (GA4's
   * `(not set)` sentinel, excluded from this array). Both cases mean "no breakdown available",
   * not "measured zero for every mode" — same undefined-not-0 contract as `TaxonomyCell.macroCopies`
   * (#209 review 2). Pipeline builder: `buildFailureRows()` in `ga-analyze.mjs`.
   */
  costModeBreakdown?: { costMode: 'macro' | 'quick-buy'; count: number }[]
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

/**
 * Chart #3 — Tool usage row per raw RLV value (#209 — pipeline no longer
 * buckets; the frontend's `aggregateTopRlv()` groups top-8 + 其他
 * dynamically. See `rlv-aggregate.ts`).
 */
export interface ToolUsageRow {
  /** Raw recipe level value (1–770, not bucketed). */
  rlv: number
  /** Total times this rlv was opened (recipe_select). */
  selectCount: number
  /** solver_start count for this rlv, human-filtered (#200). */
  simulatorCount: number
  /** batch_optimization_start count where ANY targeted recipe has this rlv.
   *  Always 0 today — needs a recipes.json join not yet implemented
   *  (spec #194 item 14, tracked separately from #209). */
  batchTargetCount: number
  /** bom_target_add count for this rlv. */
  bomTargetCount: number
}

/**
 * @deprecated Chart #4 legacy shape — the pipeline retired the wide
 * expansion-aligned buckets in #209 (spec #194 §C3: "分組從 pipeline 移到
 * 前端"). No snapshot produced after that ticket populates
 * `TaxonomyBundle.rlvHistogram` anymore; this type/field stays ONLY so the
 * 71+ frozen `gh-data/history/` snapshots that still carry it keep parsing.
 * New code should read `TaxonomyBundle.rlvRaw` instead.
 */
export interface RlvBucket {
  bucket: '≤300' | '301–510' | '511–600' | '601–680' | '681+' // expansion-aligned RLV buckets
  events: number // recipe_select count (rlv lives on recipe_select, not solver_start)
}

/** Chart #4a — raw per-rlv histogram row (#209). No bucketing — the
 *  frontend's `aggregateTopRlv()` (`rlv-aggregate.ts`) picks the dynamic
 *  top-8-by-volume leaderboard + 其他 at render time. */
export interface RlvRawBucket {
  /** Raw recipe level value (1–770). */
  rlv: number
  /** recipe_select count for this rlv (rlv lives on recipe_select, not solver_start). */
  events: number
}

/**
 * `starts`/`completes`/`macroCopies` are human-only (#200): machine-loop rows
 * (`isMachineSolveRow()`) are filtered out before bucketing so a matrix cell
 * never gets padded by batch-optimizer/buff-recommender/meld-advisor noise.
 *
 * `macroCopies`/`macroCopyRate` are `undefined` — NOT `0` — whenever
 * attribution is structurally impossible (#209 review 2): `solver_macro_copy`
 * has never carried taxonomy in production, so every row gets filtered out as
 * machine-originated before it can be counted. A `0` there would read as "we
 * measured zero macro copies" when the true state is "we cannot currently
 * tell" — the exact same failure mode #200 review caught for
 * `glance.solver.humanFails`. Pipeline guard: `canAttributeMacroCopies()` in
 * ga-analyze.mjs. Chart consumers MUST render `undefined` as "—" / "無法歸戶",
 * never as a zero-length bar.
 */
export interface TaxonomyCell {
  isExpert: boolean
  isCollectable: boolean
  starts: number
  completes: number
  macroCopies?: number
  completeRate: number // 0–1
  macroCopyRate?: number // 0–1, denominator = completes; undefined = unattributable, see doc above
}

/**
 * `starts`/`completes`/`macroCopies`/`completeRate`/`macroCopyRate` are all
 * human-only (#200) — see `TaxonomyCell` doc above (same `undefined`-not-0
 * contract for `macroCopies`/`macroCopyRate` applies here). Rendered as the
 * third row of `ExpertCollectableMatrix.vue` (#209 merged this in — see that
 * component's doc comment) so the matrix stays the dashboard's one
 * macro-copy-rate-bearing structure; `RecipeDifficultyKind.vue` no longer
 * consumes this shape.
 *
 * `completeRate` is deliberately NOT clamped to `[0, 1]` (#209 review 3):
 * >100% means GA dropped a start event relative to its matching completes,
 * per #200's issue body — that's a diagnostic signal, not a display bug to
 * paper over. A live probe found `quick` at 101.6% the day this was fixed.
 */
export interface CraftKindRow {
  kind: 'normal' | 'expert' | 'quick' | 'custom_delivery' | 'company'
  starts: number
  completes: number
  macroCopies?: number
  completeRate: number // 0–1, NOT clamped — can exceed 1, see doc above
  macroCopyRate?: number // 0–1, denominator = completes; undefined = unattributable, see doc above
}

/**
 * 裝備水準桶——`classifyGearBucket()`（`src/utils/gear-bucket.ts`）的三個輸出值，
 * 鏡射 `gear_bucket` custom dimension 的真實值域。
 */
export type GearBucketKey = 'entry' | 'mid' | 'bis'

/**
 * 裝備水準 × 求解結果（#211, spec #194 §C3）。`gear_bucket` 與 `craft_kind`/`source`
 * 一樣騎在 solver_start/_complete/_failed 三個事件本身上（`src/solver/worker.ts`），不是另一個
 * 事件的參數——GA4 不能跨事件 join，但這張圖不需要：三個結果桶都來自「同一個」求解嘗試各自發出
 * 的事件，不是兩個獨立事件湊出來的假關聯。
 *
 * `starts`/`completes`/`fails` 全部人類過濾（#200 `isMachineSolveRow()`），與 `CraftKindRow` 同一種
 * 過濾邏輯——機器迴圈（batch-optimizer / buff-recommender / meld-advisor）的求解不歸戶進任何一個
 * 裝備水準桶。`gear_bucket` 值不在 entry/mid/bis 三者之列的列（例如維度上線前的歷史事件，不可回溯）
 * 直接跳過，不會誤入某一桶。
 *
 * `fails`/`failRate` 是 `undefined`——不是 `0`——當 `solver_failed` 整批都無法歸戶（今天的實況：
 * `solver_failed` 尚未在 production 帶 taxonomy，見 `TaxonomyCell` doc 的 `macroCopies` 同款保護，
 * 判別式重用 `buildSolverHumanGlance()`/`canAttributeMacroCopies()` 的「整批都無 taxonomy → 無法
 * 歸戶」邏輯，見 `buildGearBucketBreakdown()`（ga-analyze.mjs）。
 *
 * `completeRate` 刻意不 clamp 到 `[0, 1]`（同 `CraftKindRow` 的理由，#209 review 3）。
 */
export interface GearBucketRow {
  bucket: GearBucketKey
  starts: number
  completes: number
  fails?: number
  completeRate: number // completes/starts, 0–1, NOT clamped — see doc above
  failRate?: number // fails/starts, 0–1; undefined = unattributable, see doc above
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
  /** @deprecated see `RlvBucket`'s doc comment — no longer populated by the
   *  pipeline (#209). Present only on frozen pre-#209 history snapshots. */
  rlvHistogram?: RlvBucket[]
  /** Raw per-rlv histogram (#209). Optional — absent on all pre-#209
   *  history until the 71-day backfill lands (`ga-backfill-rlv-raw.mjs`). */
  rlvRaw?: RlvRawBucket[]
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

/**
 * `glance.adoption` — cross-server usage + meld-advisor adoption denominators (#203).
 *
 * Both features fire real events already; what's new here is two custom dimensions
 * (`cross_server` on `batch_optimization_start`, `fields` on `gearset_apply_all`) that had to
 * be hand-registered (2026-07-31, no Admin API access on this property — #186 決定 5) and a
 * client-only event (`meld_advisor_run`, #198) that needs no registration at all.
 *
 * All four fields are optional (v2-additive, same contract as `GlanceApi` above): this is a
 * brand-new `glance` key, so unlike `solver`/`batch`/`bom` (which have existed since the
 * container's inception) none of the 79+ frozen `gh-data/history/` snapshots carry it and it
 * will never be backfilled. `ga-thresholds.ts`'s `pick()` guards with `?? {}` / `== null` so
 * feeding one of those into `evaluate()` resolves to `state: 'absent'` instead of throwing
 * (same failure mode #201 review B2 and #200 already hit).
 *
 * `batchStarts` is deliberately its own field, NOT a reuse of `glance.batch.starts` — same
 * underlying `batch_optimization_start` event today, but a different question ("what's the
 * denominator for the cross-server ADOPTION rate" vs "how many batch runs happened"). Reusing
 * the variable would silently couple the two if either population's definition ever diverges
 * (#203 issue body).
 */
export interface GlanceAdoption {
  /** `batch_optimization_start` 全部（跨服率的分母，語意獨立，刻意不與 `glance.batch.starts` 共用）。 */
  batchStarts?: number
  /** `batch_optimization_start` 且 `cross_server === true`。 */
  crossServerBatches?: number
  /** 新事件 `meld_advisor_run`（`runAdvisor()` 成功產出 advice 時發，#198）——事件名免註冊，不吃 28 天暗期。 */
  meldAdvisorRuns?: number
  /** `gearset_apply_all` 且 `fields ∈ { meld_delta, meld_delta_single }`（鑲嵌建議的兩個寫入分支，#189 決定 2）。 */
  meldApplies?: number
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
    /** See `GlanceAdoption` doc. Optional — absent on all pre-#203 history. */
    adoption?: GlanceAdoption
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
  /**
   * 裝備水準 × 求解結果（#211）。Optional — omitted (not an empty array) whenever the window has
   * zero solver_start/_complete/_failed rows at all, same "field absent, don't fake zeros" pattern
   * as `taxonomy` above; also absent on every pre-#211 `gh-data/history/` snapshot (no backfill —
   * `gear_bucket` only rides `solver_complete`/`solver_failed` since #198, not yet deployed to
   * production as of this ticket).
   */
  gearBucketBreakdown?: GearBucketRow[]
}

export interface GaSnapshot {
  schemaVersion: 1
  generatedAt: string  // ISO 8601
  propertyId: string
  windows: Record<WindowKey, MetricsBundle>
}
