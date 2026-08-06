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

export interface TaxonomyCell {
  isExpert: boolean
  isCollectable: boolean
  starts: number
  completes: number
  macroCopies: number
  completeRate: number // 0–1
  macroCopyRate: number // 0–1, denominator = completes
}

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

/** Chart #1 — RegionSplitLedger: five metrics × three regions. */
export interface ByRegion {
  activeUsers: { cht: RegionGlance; intl: RegionGlance; unset: RegionGlance }
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

export interface MetricsBundle {
  window: { days: number; startDate: string; endDate: string }
  glance: {
    activeUsers: { total: number; new: number; returning: number; returningPct: number }
    solver: { starts: number; completes: number; fails: number; completePct: number }
    batch: { starts: number; completes: number; fails: number; cancelled: number; completePct: number }
    bom: { calculates: number; sentToBatch: number; handoffPct: number }
    infra: { sabUnavailable: number; wasmLoadFailed: number }
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
