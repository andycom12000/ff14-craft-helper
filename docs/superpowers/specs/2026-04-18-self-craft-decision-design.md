# Self-Craft Decision Mechanism — Design

**Date:** 2026-04-18
**Scope:** Batch crafting flow (`BatchView`)
**Goal:** 讓批量製作在某子材料「買」比「做」顯著昂貴時，主動列出可省錢的自製候選，交由使用者勾選，勾選後自動整合進購物清單與 todo。

---

## 1. 問題背景

現有 `batch-optimizer.ts` 的 Phase 5 本意就是處理這件事，但有三個關鍵缺陷導致機制完全不觸發：

1. **致命 Bug**：`batch-optimizer.ts:332-334` 建 `bomTargets` 時把 `recipeId` 硬寫為 `0`，`buildMaterialTree` 呼叫 `fetchRecipeCached(0)` 必定失敗，`Promise.allSettled` 吞錯後 fallback 成無 children 節點，tree 永遠不展開。
2. **結構性錯位**：`computeOptimalCosts` 只對 `root.children` 做買/做決策，但我們把「nonCrystals 材料」當 root 傳入，導致這一層根本不在決策範圍。
3. **整合斷裂**：即使 `selfCraftItems` 有值，只在 `ShoppingList.vue:179` 顯示一個提示區塊，既不從購物清單移除、不加入 todo、也不把新原物料加進購物清單。

此外，`maxRecursionDepth` 設定欄位雖有 UI、有 store，但 `bom-calculator.ts` 完全沒讀取它，永遠使用 hardcoded `MAX_RECURSION_DEPTH = 10`。

## 2. 設計決策摘要

| 議題 | 決策 |
| --- | --- |
| HQ 需求的子材料 | 只要玩家 HQ 裝備能讓該子材料 double-max 就推薦 |
| 遞迴深度 | 使用現有 UI field，預設值從 3 下修到 **2** |
| 職業等級不足 | 不列入自製候選（對齊現有 level-insufficient exception 邏輯） |
| solver 時機 | 批次計算時對每個候選先跑好，勾選即套用 |
| UI 位置 | 現有 `ShoppingList.vue` 上方獨立區塊 |
| 省錢門檻 | `savings / buyCost < 5%` 自動跳過，不進 UI |

## 3. 概念模型

對每個 `recipesToCraft` 裡的配方，展開 BOM tree（深度 = `maxRecursionDepth`）。對 tree 中的每個中間節點計算 `buyCost` 與 `craftCost`，產生 `SelfCraftCandidate[]`。

**Candidate ≠ 已套用。** Candidates 是「可勾選的選項清單」，使用者勾選後才改動 shopping list 與 todo。

## 4. 候選過濾條件

候選必須依序通過：

1. 該 item 有對應 recipe（`findFirstRecipe` 查得到）
2. 玩家該職業等級 ≥ 配方等級
3. 子材料的子材料 + 本體在 Universalis 都有報價（`buyCost > 0` 且 `craftCost > 0`）
4. `craftCost < buyCost` 且 `(buyCost - craftCost) / buyCost ≥ 0.05`
5. 若母配方對此子材料要求 HQ（`hqAmounts[j] > 0`）：solver 驗證當前裝備 + 食品/藥品 buff 能 double-max

順序重要：便宜的檢查放前面，solver 放最後（最貴）。低於 5% 門檻的連 solver 都不跑。

## 5. 資料結構

### 5.1 新增 `SelfCraftCandidate`

```ts
export interface SelfCraftCandidate {
  itemId: number
  name: string
  icon: string
  amount: number                // 需要多少份
  recipe: Recipe                // 中間品配方
  job: string                   // 需要的職業
  buyCost: number               // amount * unitPrice (總額)
  craftCost: number             // 子材料成本加總 (總額)
  savings: number               // buyCost - craftCost
  savingsRatio: number          // savings / buyCost
  actions: string[]             // solver 產的技能序列
  hqAmounts: number[]           // HQ 分配
  rawMaterials: MaterialBase[]  // 展開後要加入購物清單的原料清單
  hqRequired: boolean           // 母配方是否要求 HQ
  depth: number                 // tree 深度（用於 UI 縮排）
  parentRecipeId?: number       // 屬於哪個母配方（同一子材料若被多個母配方需要會合併）
}
```

同一 itemId 的候選會被聚合：`amount`、`buyCost`、`craftCost`、`rawMaterials` 累加。

### 5.2 `BatchResults` 擴充

```ts
interface BatchResults {
  // ...既有欄位
  selfCraftCandidates: SelfCraftCandidate[]  // 新增
  // 移除: selfCraftItems (被 candidates 取代)
}
```

### 5.3 `batch` store 擴充

```ts
const selectedSelfCraftIds = ref<Set<number>>(new Set())

function toggleSelfCraft(itemId: number) { /* ... */ }
function selectAllSelfCraft() { /* ... */ }
function clearSelfCraftSelection() { /* ... */ }

// computed: 套用選取後的 final shopping list / todo list
const finalShoppingItems = computed(() => { /* ... */ })
const finalTodoList = computed(() => { /* ... */ })
```

## 6. 批次計算流程改動（`batch-optimizer.ts`）

現有流程：
- Phase 1-3: solve + HQ optimize（per recipe）
- Phase 4: early price query
- Phase 4.5: 成品買 vs 做比較
- Phase 5: 聚合材料 + 遞迴 BOM（壞的）
- Phase 5.5: 定價
- Phase 6: todo

新流程插入在 Phase 4.5 之後：

- **Phase 4.6 — BOM 展開**
  對每個 `recipesToCraft.recipe` 建 material tree，深度 = `settings.maxRecursionDepth`。
  修掉舊的 `recipeId: 0` bug：用 `findFirstRecipe(m.itemId, m.name)` 取得真正 recipeId 才傳入 `buildMaterialTree`。
  - 過程中會對中間品 itemId 查 recipe（`recipeByItemCache`、`recipeCache` 已有機制）
  - 展樹後走遍所有節點收集 itemId，過濾掉已在 Phase 4 `priceMap` 裡的，用剩下的呼叫 `getAggregatedPrices` 補查價格並 merge 回 `priceMap`

- **Phase 4.7 — 候選過濾**
  走遍 tree 中的中間節點，套用 §4 的條件 1-4（不含 solver）。
  - 通過的保留為 preliminary candidate
  - 已知玩家各職業等級（`getGearset`）與 priceMap 都齊備

- **Phase 4.8 — Solver 驗證 + macro 產生**
  對每個 preliminary candidate 跑 `optimizeRecipe(candidate.recipe, gearset, buffs)`：
  - `hqRequired = true` 時：檢查 `isDoubleMax`；否則視 candidate 所需 HQ 數檢查 `hqAmounts` 足量
  - 通過則收集 `actions`、`hqAmounts` 入 candidate
  - 不通過就排除
  - 顯示 progress bar：`phase: 'evaluating-self-craft'`

- 其餘 Phase 5 / 5.5 / 6 保持，但：
  - `selfCraftItems` 欄位移除（不再產出）
  - `recipesToCraft` 不變（勾選套用是前端 computed，不影響批次階段）

### 6.1 效能考量

- 每個候選跑一次 solver。若有 N 個候選，總 solver 次數 = 原有 + N
- 現有 solver worker 是單一 worker（`src/solver/worker.ts`）；先 **循序** 跑，不改 worker 架構。
- 5% threshold 過濾已經大幅減少 N
- 遞迴深度預設 2，進一步壓縮候選數量
- Progress bar 更新頻率與 solve 粒度對齊

## 7. UI 設計（`ShoppingList.vue`）

新增區塊置於現有 server-groups **上方**，只在 `selfCraftCandidates.length > 0` 時顯示：

```
┌─ 💡 自製建議 ─────────────────────────────────────┐
│ 勾選要改為自製的素材，購物清單與製作步驟會自動更新  │
│                                                    │
│ 已省下：12,400g (3 項勾選 / 共 5 項)                │
│ [全選] [取消全選]                                   │
│                                                    │
│ ☑ 楓木板 x20        買 60,000g  做 48,000g  -20%   │
│   └ 需要：楓木材 x40                                │
│   └ 半成品工序：已加入 todo                         │
│ ☑ 銀線 x5           買 15,000g  做 14,250g   -5%   │
│ ☐ 鐵錠 x10          買 20,000g  做 19,000g   -5%   │
│ ☐ 亞麻布 x3         買  9,000g  做  8,500g   -6%   │
│ ☐ ...                                               │
└────────────────────────────────────────────────────┘
```

每列包含：
- Checkbox（反應 `selectedSelfCraftIds` 狀態）
- Icon + 名稱 + 數量
- 買價 / 做價 / 省比例（用顏色強調）
- 展開區：顯示會被加入購物清單的原料
- 若 `hqRequired`：標一個「需 HQ」小 tag

### 7.1 勾選的即時效果（computed，不重跑 solver）

Candidate 採「全有或全無」取代：若 Phase 4.8 solver 驗證通過，代表該 candidate 能完全滿足母配方對此子材料的 HQ/NQ 需求；勾選即 100% 取代，不做部分取代。

當 `selectedSelfCraftIds` 變動：
- **ShoppingList**：
  - 從購物清單中完全移除 candidate.itemId 對應的購買條目（NQ + HQ 皆移除）
  - 加入 candidate 的 `rawMaterials`
- **TodoList**（`TodoList.vue`）：
  - 加入 `TodoItem { recipe, quantity: amount, actions, hqAmounts, isSemiFinished: true, done: false }`
  - 半成品顯示在對應母配方之前（排序：`isSemiFinished` 先於成品、同層按批次順序）
- **CostSummaryPanel**：總金額重算

## 8. 牽動的檔案

| 檔案 | 改動 |
| --- | --- |
| `src/services/bom-calculator.ts` | 修 `recipeId: 0` bug、`buildMaterialTree` 接受 `maxDepth` 參數、`computeOptimalCosts` 對 root 本身決策、加 `SELF_CRAFT_SAVINGS_THRESHOLD = 0.05` |
| `src/services/batch-optimizer.ts` | 新增 Phase 4.6-4.8、移除舊 Phase 5 裡的遞迴 BOM 段落、`selfCraftItems` → `selfCraftCandidates` |
| `src/stores/batch.ts` | 新增 `selfCraftCandidates`、`selectedSelfCraftIds`、`toggleSelfCraft`、`finalShoppingItems`、`finalTodoList` computed |
| `src/components/batch/ShoppingList.vue` | 新增「自製建議」區塊、移除舊 `selfCraftItems` 區塊；改用 `finalShoppingItems` |
| `src/components/batch/TodoList.vue` | 確認 `isSemiFinished` 排序正確；改用 `finalTodoList` |
| `src/components/batch/BatchProgress.vue` | 新增 `evaluating-self-craft` phase 文字 |
| `src/components/batch/BatchSettings.vue` | 遞迴深度 label 微調（預設值從 store 預設決定）|
| `src/stores/settings.ts` | `maxRecursionDepth` 預設值 3 → 2 |

## 9. 測試策略

- `bom-calculator.test.ts`：新增對 root 節點做決策的 case、`maxDepth` 參數、5% threshold 過濾
- `batch-optimizer.test.ts`：mock 一個子材料做比買便宜 10% 的情境、一個只便宜 3% 的情境（後者不應產出）
- `batch.test.ts`：勾選 toggle 後 `finalShoppingItems` / `finalTodoList` 正確性

## 10. 不在此次範圍

- 使用者可調的 threshold（先 hardcode 5%）
- 批次多個候選平行跑 solver（先循序）
- 遞迴超過 2 層的 UI 表達（目前 UI 支援任意深度，但 depth 3+ 的經驗尚未驗證）
- 將勾選狀態持久化到 localStorage
