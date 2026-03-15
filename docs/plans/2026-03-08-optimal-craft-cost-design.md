# Optimal Craft Cost & Crafting Price Tree

**Date:** 2026-03-08
**Goal:** Fix the total cost calculation to use optimal buy/craft routing per intermediate material, and add a visual crafting price tree.

## Problem

Current `grandTotal = rawTotalCost + craftTotalCost` double-counts: raw materials are ingredients OF intermediates, so summing both is incorrect. The correct approach is to compare buy vs craft for each intermediate and pick the cheaper path.

## Design

### 1. Optimal Cost Calculation

New function `computeOptimalCosts(tree, getUnitPrice)` in `bom-calculator.ts`:

- Recursively walks `MaterialNode[]` tree bottom-up
- For leaf/raw nodes: cost = market price × amount
- For intermediate nodes: compare `buyCost` (market price × amount) vs `craftCost` (sum of children's optimal costs), pick min
- Returns `{ totalCost: number, decisions: CostDecision[] }`

```typescript
interface CostDecision {
  itemId: number
  name: string
  icon: string
  amount: number
  buyCost: number    // market price × amount
  craftCost: number  // sum of children's optimal costs
  optimalCost: number
  recommendation: 'buy' | 'craft'
}
```

Edge cases:
- `buyCost === 0` (no market listing): force craft
- `craftCost === 0` (children have no prices): force buy
- Same itemId appearing in multiple branches: accumulate amounts and costs

### 2. BomSummary Fix

- Add `materialTree` prop
- Replace incorrect `grandTotal` with `computeOptimalCosts` result
- Intermediates table: add craft cost column and recommendation tag per row
- Keep raw materials table as reference

### 3. Crafting Price Tree (New Tab)

New tab in BomView: 「材料總覽」(existing table) | 「製作價格樹」(new tree)

New component `BomCraftTree.vue`:
- Recursive Vue component with CSS flexbox layout
- Pseudo-element (`::before`/`::after`) connectors between parent and children
- Node card: icon, name, quantity badge, price
- Decision box between parent and children: "材料: X vs 成品: Y → 自製省 Z / 直購省 Z"
- Green border = craft recommended, orange border = buy recommended
- Root summary: "最優製作: X vs 直購成品: Y"
- Horizontal scroll for wide trees

### 4. Files Affected

- `src/services/bom-calculator.ts` — add `computeOptimalCosts`, export `CostDecision`
- `src/stores/bom.ts` — no changes needed (types already exported)
- `src/components/bom/BomSummary.vue` — add `materialTree` prop, fix grandTotal, show decisions
- `src/components/bom/BomCraftTree.vue` — new component
- `src/views/BomView.vue` — add tabs, pass `materialTree`
- `src/components/simulator/CraftRecommendation.vue` — store tree ref, pass to BomSummary
