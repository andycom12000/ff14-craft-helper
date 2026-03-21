# Progress Bar Granularity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the batch optimizer progress bar smoother and more informative by adding fine-grained phases for pricing, buff evaluation, and material aggregation.

**Architecture:** Extend the existing phase enum with `'evaluating-buffs'` and `'aggregating'`, update the `onProgress` callback type, add progress reporting to all slow pipeline steps, and rewrite the percentage/status-text calculation in `BatchProgress.vue`.

**Tech Stack:** Vue 3, TypeScript, Pinia

**Spec:** `docs/superpowers/specs/2026-03-21-progress-granularity-design.md`

---

### Task 1: Extend phase type and onProgress callback signature

**Files:**
- Modify: `src/stores/batch.ts:56-57` (phase type in defaultProgress)
- Modify: `src/services/batch-optimizer.ts:105` (phase type in onProgress callback)

- [ ] **Step 1: Update phase type in batch store**

In `src/stores/batch.ts`, change the `defaultProgress` function's `phase` field (line 56):

```typescript
  phase: 'idle' as 'idle' | 'solving' | 'pricing' | 'evaluating-buffs' | 'aggregating' | 'done',
```

- [ ] **Step 2: Update phase type in onProgress callback**

In `src/services/batch-optimizer.ts`, change the `phase` type in the `onProgress` parameter (line 105):

```typescript
    phase: 'solving' | 'pricing' | 'evaluating-buffs' | 'aggregating' | 'done'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add src/stores/batch.ts src/services/batch-optimizer.ts
git commit -m "refactor(batch): extend progress phase type with evaluating-buffs and aggregating"
```

---

### Task 2: Add progress callbacks to batch-optimizer pipeline

**Files:**
- Modify: `src/services/batch-optimizer.ts:178-300` (phases 4, 4.6-buff, 5, 5.5)
- Modify: `src/services/buff-recommender.ts` (add onProgress parameter)

- [ ] **Step 1: Add pricing phase progress report**

In `src/services/batch-optimizer.ts`, the line that currently says:

```typescript
  // === Phase 4: Early price query (materials + finished products) ===
  onProgress({ current: targets.length, total: targets.length, name: '查詢市場價格', phase: 'pricing', solverPercent: 100 })
```

Change the `phase` from `'pricing'` to `'pricing'` and `solverPercent` to `0` (since we're no longer in the solving phase):

```typescript
  // === Phase 4: Early price query (materials + finished products) ===
  onProgress({ current: 0, total: 0, name: '查詢市場價格', phase: 'pricing', solverPercent: 0 })
```

- [ ] **Step 2: Add onProgress to evaluateBuffRecommendation**

In `src/services/buff-recommender.ts`, add `onProgress` parameter to the function signature. Change:

```typescript
export async function evaluateBuffRecommendation(
  recipeResults: RecipeOptimizeResult[],
  buyFinishedIds: Set<number>,
  getGearset: (job: string) => GearsetStats | null,
  priceMap: Map<number, MarketData>,
  isCancelled: () => boolean,
): Promise<BuffRecommendation | null> {
```

To:

```typescript
export async function evaluateBuffRecommendation(
  recipeResults: RecipeOptimizeResult[],
  buyFinishedIds: Set<number>,
  getGearset: (job: string) => GearsetStats | null,
  priceMap: Map<number, MarketData>,
  isCancelled: () => boolean,
  onProgress?: (info: { current: number; total: number }) => void,
): Promise<BuffRecommendation | null> {
```

In the combo evaluation loop (the `for (const candidate of candidates)` loop), add progress reporting. Change to index-based iteration:

```typescript
  for (let i = 0; i < candidates.length; i++) {
    if (isCancelled()) return null
    onProgress?.({ current: i + 1, total: candidates.length })
    const candidate = candidates[i]
    const combo: BuffCombo = { food: candidate.food, medicine: candidate.medicine }
```

- [ ] **Step 3: Update Phase 4.6-buff call in batch-optimizer to pass onProgress**

In `src/services/batch-optimizer.ts`, update the `evaluateBuffRecommendation` call to pass a progress callback. Change:

```typescript
      const recommendation = await evaluateBuffRecommendation(
        recipesToCraft, buyFinishedIds, getGearset as (job: string) => GearsetStats | null,
        priceMap, isCancelled,
      )
```

To:

```typescript
      onProgress({ current: 0, total: 0, name: '', phase: 'evaluating-buffs', solverPercent: 0 })
      const recommendation = await evaluateBuffRecommendation(
        recipesToCraft, buyFinishedIds, getGearset as (job: string) => GearsetStats | null,
        priceMap, isCancelled,
        (info) => onProgress({ current: info.current, total: info.total, name: '', phase: 'evaluating-buffs', solverPercent: 0 }),
      )
```

- [ ] **Step 4: Add aggregation phase progress reports**

In `src/services/batch-optimizer.ts`, add progress callbacks before each aggregation sub-step.

Before `// === Phase 5: Aggregate materials` (around line 244):

```typescript
  onProgress({ current: 0, total: 0, name: '整理材料清單', phase: 'aggregating', solverPercent: 0 })
```

Before the recursive BOM block `if (settings.recursivePricing)` (around line 277):

```typescript
    onProgress({ current: 0, total: 0, name: '展開遞迴材料', phase: 'aggregating', solverPercent: 0 })
```

After BOM expansion, before the BOM price query `const bomPriceMap = await getAggregatedPrices(...)`:

```typescript
    onProgress({ current: 0, total: 0, name: '查詢材料價格', phase: 'aggregating', solverPercent: 0 })
```

Before `// === Phase 5.5: Price materials` (around line 302):

```typescript
  onProgress({ current: 0, total: 0, name: '分組採購清單', phase: 'aggregating', solverPercent: 0 })
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS (72 tests). The existing tests mock `onProgress` as `() => {}` so new callback shapes don't break them.

- [ ] **Step 6: Commit**

```bash
git add src/services/batch-optimizer.ts src/services/buff-recommender.ts
git commit -m "feat(batch): add progress reporting for pricing, buff evaluation, and aggregation phases"
```

---

### Task 3: Rewrite BatchProgress.vue percentage and status text

**Files:**
- Modify: `src/components/batch/BatchProgress.vue`

- [ ] **Step 1: Rewrite the component**

Replace the entire `<script setup>` section and template of `src/components/batch/BatchProgress.vue`:

```vue
<script setup lang="ts">
import { useBatchStore } from '@/stores/batch'
import { computed } from 'vue'

const batchStore = useBatchStore()

const PHASE_RANGES: Record<string, [number, number]> = {
  solving: [0, 60],
  pricing: [60, 70],
  'evaluating-buffs': [70, 85],
  aggregating: [85, 95],
  done: [100, 100],
}

const percentage = computed(() => {
  const p = batchStore.progress
  if (p.phase === 'idle' || p.phase === 'done') return p.phase === 'done' ? 100 : 0

  const range = PHASE_RANGES[p.phase]
  if (!range) return 0
  const [start, end] = range

  if (p.phase === 'solving' && p.total > 0) {
    const completedPortion = (p.current - 1) / p.total
    const currentPortion = (p.solverPercent / 100) / p.total
    return Math.round(start + (completedPortion + currentPortion) * (end - start))
  }

  if (p.phase === 'evaluating-buffs' && p.total > 0) {
    return Math.round(start + (p.current / p.total) * (end - start))
  }

  return start
})

const statusText = computed(() => {
  const p = batchStore.progress
  switch (p.phase) {
    case 'solving':
      return `正在求解：${p.currentName}`
    case 'pricing':
      return '正在查詢市場價格...'
    case 'evaluating-buffs':
      return p.total > 0
        ? `正在評估食藥組合 (${p.current}/${p.total})...`
        : '正在評估食藥組合...'
    case 'aggregating':
      return p.currentName || '正在整理採購清單...'
    case 'done':
      return '計算完成'
    default:
      return ''
  }
})

const showCounter = computed(() => {
  const phase = batchStore.progress.phase
  return phase === 'solving' || phase === 'evaluating-buffs'
})
</script>

<template>
  <el-card v-if="batchStore.isRunning" shadow="never" class="progress-card">
    <template #header>
      <span class="card-title">計算進度</span>
    </template>
    <div class="progress-body">
      <div class="progress-status">
        <el-text size="small" type="info">
          <strong>{{ statusText }}</strong>
        </el-text>
        <el-text v-if="showCounter" size="small" type="info">
          {{ batchStore.progress.current }} / {{ batchStore.progress.total }}
        </el-text>
      </div>
      <el-progress :percentage="percentage" :stroke-width="8" />
      <div class="progress-actions">
        <el-button size="small" @click="batchStore.cancel()">取消</el-button>
      </div>
    </div>
  </el-card>
</template>
```

Keep the existing `<style scoped>` section unchanged.

- [ ] **Step 2: Verify the app builds**

Run: `npx vite build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/batch/BatchProgress.vue
git commit -m "feat(batch): rewrite progress bar with fine-grained phases and status text"
```

---

### Task 4: Verification

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run TypeScript type check**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify build**

Run: `npx vite build 2>&1 | tail -5`
Expected: Build succeeds
