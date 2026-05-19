// src/types/ga-snapshot.ts

export type WindowKey = '7d' | '14d' | '28d'
export type PageFamily = 'core' | 'craft' | 'gather' | 'company' | 'meta' | 'market'
export type EventFamily = 'core' | 'craft' | 'gather' | 'company' | 'meta' | 'market' | 'error'
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

export interface ChannelRow {
  channel: string
  source: string
  sessions: number
  users: number
  engagement: number
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

export interface FlipBuckets {
  new: number
  returning: number
  other: number
}

export interface EventRow {
  event: string
  family: EventFamily
  count: number
  users: number
}

export interface ReturningPageRow {
  path: string
  returningViews: number
  returningUsers: number
  engagement: number
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
  channels: ChannelRow[]
  solverFunnel: FunnelStep[]
  batchFunnel: FunnelStep[]
  simulatorFunnel: SimulatorFunnel
  failures: FailureRow[]
  vitals: VitalRow[]
  flip: { users: FlipBuckets; sessions: FlipBuckets }
  returningEvents: EventRow[]
  returningPages: ReturningPageRow[]
  q4Funnels: Q4Funnel[]
  marketRegion: MarketRegionRow[]
}

export interface GaSnapshot {
  schemaVersion: 1
  generatedAt: string  // ISO 8601
  propertyId: string
  windows: Record<WindowKey, MetricsBundle>
}
