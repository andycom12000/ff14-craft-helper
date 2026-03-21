# Batch Progress Bar Granularity Improvement

## Context

The batch optimizer progress bar currently only reports two phases (`solving` at 0-95%, `pricing` at 95%), then jumps to 100%. After pricing, multiple potentially slow operations (buff recommendation with solver calls, recursive BOM expansion with API calls, material aggregation) run silently at 95%, making the user think the app is frozen.

## Goals

1. **No "stuck at 95%"** — every slow operation reports progress
2. **Fine-grained status text** — user can see what's happening at each step

## Design: Weighted Step System

### New Phase Enum

```typescript
phase: 'idle' | 'solving' | 'pricing' | 'evaluating-buffs' | 'aggregating' | 'done'
```

### Phase → Percentage Mapping

| Phase | Range | Status Text | Sub-progress |
|-------|-------|-------------|-------------|
| `solving` | 0% → 60% | `正在求解：{name} ({current}/{total})` | Per-recipe solver % |
| `pricing` | 60% → 70% | `正在查詢市場價格...` | None (single API call) |
| `evaluating-buffs` | 70% → 85% | `正在評估食藥組合 ({n}/{total})...` | Per-combo progress |
| `aggregating` | 85% → 95% | `正在整理採購清單...` | Sub-step text |
| `done` | 100% | `計算完成` | — |

### Phase Skipping

When a phase doesn't execute (e.g., no buff recommendation needed, no recursive BOM), it is simply skipped — the percentage jumps from the end of the previous phase to the start of the next active phase. This avoids misleading pauses.

### Progress Data Structure Changes

```typescript
// src/stores/batch.ts
const defaultProgress = () => ({
  current: 0,
  total: 0,
  currentName: '',
  phase: 'idle' as 'idle' | 'solving' | 'pricing' | 'evaluating-buffs' | 'aggregating' | 'done',
  solverPercent: 0,
})
```

No new fields needed. The existing `currentName` field is reused to carry sub-step descriptions in the `aggregating` phase (e.g., '整理材料清單', '展開遞迴材料').

### Percentage Calculation (BatchProgress.vue)

```typescript
const PHASE_RANGES: Record<string, [number, number]> = {
  solving: [0, 60],
  pricing: [60, 70],
  'evaluating-buffs': [70, 85],
  aggregating: [85, 95],
  done: [100, 100],
}

const percentage = computed(() => {
  const p = batchStore.progress
  if (p.total === 0 || p.phase === 'idle') return 0
  if (p.phase === 'done') return 100

  const range = PHASE_RANGES[p.phase]
  if (!range) return 0
  const [start, end] = range

  if (p.phase === 'solving') {
    const completedPortion = (p.current - 1) / p.total
    const currentPortion = (p.solverPercent / 100) / p.total
    const progress = completedPortion + currentPortion
    return Math.round(start + progress * (end - start))
  }

  if (p.phase === 'evaluating-buffs' && p.total > 0) {
    const progress = p.current / p.total
    return Math.round(start + progress * (end - start))
  }

  // For pricing and aggregating, show the start of the range
  return start
})
```

### Status Text (BatchProgress.vue)

```typescript
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
```

## Integration Points

### Files to Modify

| File | Change |
|------|--------|
| `src/stores/batch.ts` | Add `'evaluating-buffs'` and `'aggregating'` to phase type |
| `src/views/BatchView.vue` | Update progress mapping in `startOptimization()` to pass through new phase values |
| `src/components/batch/BatchProgress.vue` | Rewrite percentage calculation and status text with new phases |
| `src/services/batch-optimizer.ts` | Add progress callbacks for pricing, buff evaluation, aggregation phases |
| `src/services/buff-recommender.ts` | Add `onProgress` callback parameter to `evaluateBuffRecommendation()` |

### batch-optimizer.ts Progress Callback Additions

**Phase 4 (pricing):** Before the `getAggregatedPrices` call:
```typescript
onProgress({ current: 0, total: 0, name: '查詢市場價格', phase: 'pricing', solverPercent: 0 })
```

**Phase 4.6-buff:** Pass progress callback to `evaluateBuffRecommendation()`:
```typescript
const recommendation = await evaluateBuffRecommendation(
  recipesToCraft, buyFinishedIds, getGearset,
  priceMap, isCancelled,
  (info) => onProgress({
    current: info.current, total: info.total,
    name: '', phase: 'evaluating-buffs', solverPercent: 0,
  }),
)
```

**Phase 5-6 (aggregation):** Report sub-steps:
```typescript
onProgress({ current: 0, total: 0, name: '整理材料清單', phase: 'aggregating', solverPercent: 0 })
// ... material aggregation ...

if (settings.recursivePricing) {
  onProgress({ ..., name: '展開遞迴材料', phase: 'aggregating', ... })
  // ... BOM expansion ...
  onProgress({ ..., name: '查詢材料價格', phase: 'aggregating', ... })
  // ... price query ...
}

onProgress({ ..., name: '分組採購清單', phase: 'aggregating', ... })
// ... server grouping ...
```

### buff-recommender.ts onProgress

Add optional `onProgress` callback to `evaluateBuffRecommendation()`:

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

Report progress in the combo evaluation loop:
```typescript
for (let i = 0; i < candidates.length; i++) {
  onProgress?.({ current: i + 1, total: candidates.length })
  // ... existing combo evaluation logic ...
}
```

### Counter Visibility (BatchProgress.vue)

The `{current} / {total}` counter in the template should only display for phases that have meaningful sub-progress (`solving` and `evaluating-buffs`). For `pricing` and `aggregating`, hide the counter to avoid showing "0 / 0".

```vue
<span v-if="batchStore.progress.phase === 'solving' || batchStore.progress.phase === 'evaluating-buffs'">
  {{ batchStore.progress.current }} / {{ batchStore.progress.total }}
</span>
```

### Phase Weight Tuning Note

The percentage ranges (solving 0-60%, pricing 60-70%, etc.) are initial estimates. They can be tuned post-implementation based on real-world timing measurements. The key invariant is that no phase should appear "stuck" — better to overestimate fast phases than underestimate slow ones.

## Edge Cases

1. **Single recipe batch** — solving phase shows 0→60% for one recipe, then phases continue normally
2. **No buff recommendation** — phase jumps from `pricing` (70%) directly to `aggregating` (85%)
3. **No recursive BOM** — aggregating phase is near-instant, jumps quickly through 85→95%
4. **Cancellation** — `isCancelled()` checks remain in all phases
5. **All recipes buy-finished** — no solving (skip to pricing), no buff evaluation, minimal aggregation

## Verification

1. **Manual test**: Run batch with multiple recipes, verify progress bar moves smoothly through all phases
2. **Manual test**: Run batch with buff recommendation enabled (no food selected + quality deficit), verify "正在評估食藥組合" appears
3. **Manual test**: Run batch with recursive BOM, verify "展開遞迴材料" and "查詢材料價格" appear
4. **Manual test**: Cancel during buff evaluation phase, verify it stops promptly
5. **Unit test**: Verify BatchProgress percentage calculation for each phase
