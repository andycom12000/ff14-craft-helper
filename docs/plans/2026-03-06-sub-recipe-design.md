# Sub-Recipe（子配方）功能設計

日期：2026-03-06

## 背景

目前 BOM（材料清單）只展開一層，所有材料都被視為原始素材。使用者無法得知哪些材料本身可以被製作，也無法選擇「自己做」或「用買的」。模擬器只能模擬主配方，無法模擬中間材料的製作。

## 需求

1. 自動遞迴展開所有可製作材料，直到全部是原始素材
2. 使用者可以「收合」某個可製作節點（= 改為用買的），預設全部展開（= 自己做）
3. 可製作材料可加入模擬佇列，在模擬器頁面切換模擬不同配方

## 設計

### 1. API 層：查詢材料是否可製作

XIVAPI `recipe_table` 端點支援用名稱搜尋。用精確名稱搜尋（不加 `%`）可以找到物品的配方。一個物品可能有多個職業的配方（例如黑鐵錠有鍛造和甲冑兩種）。

新增函式：

```ts
// api/xivapi.ts
export async function findRecipesByItemName(
  itemName: string
): Promise<RecipeSearchResult[]>
```

- 用 `recipe_table?page_id=0&search_name=<itemName>` 查詢
- 回傳 0~N 筆結果（0 = 不可製作）
- 用 `item_id` 做二次過濾確保精確匹配（避免「黑鐵錠」匹配到「黑鐵錠鑄塊」）

### 2. 資料結構擴充

```ts
// stores/recipe.ts - Ingredient 新增欄位
interface Ingredient {
  itemId: number
  name: string
  icon: string
  amount: number
  recipeId?: number    // 新增：此材料的配方 ID（如果可製作）
  recipeJob?: string   // 新增：對應的製作職業
}
```

```ts
// services/bom-calculator.ts - MaterialNode 行為變更
interface MaterialNode {
  itemId: number
  name: string
  icon: string
  amount: number
  recipeId?: number
  children?: MaterialNode[]
  collapsed?: boolean  // 新增：true = 使用者選擇用買的
}
```

### 3. BOM Calculator 遞迴展開

```ts
// services/bom-calculator.ts
async function buildMaterialTree(targets): Promise<MaterialNode[]> {
  // 對每個 target：
  //   1. getRecipe(target.recipeId) 取得材料
  //   2. 對每個材料用 findRecipesByItemName(name) 查詢是否可製作
  //   3. 如果可製作，取第一個配方的 recipeId，遞迴呼叫自己
  //   4. 迴圈偵測：維護 visitedItemIds Set，避免 A→B→A
  //   5. 遞迴深度上限：10 層（安全閥）
}
```

### 4. flattenMaterialTree 更新

```ts
function flattenMaterialTree(nodes): FlatMaterial[] {
  // 遍歷樹：
  //   - 如果節點 collapsed=true 或 沒有 children → 視為需購買的素材
  //   - 如果節點有 children 且未 collapsed → 視為中間產物（自己做的）
  //   - 只收集葉節點（或 collapsed 節點）作為「需要的素材」
}
```

### 5. UI — 材料樹互動

`BomMaterialTree.vue`：
- 可製作節點（有 `recipeId`）：
  - 預設展開，顯示子材料
  - 提供「改為購買」按鈕 → 設 `collapsed=true`，重新計算 flattenMaterialTree
  - 提供「加入模擬佇列」按鈕
- collapsed 的節點：
  - 顯示為單一項目（像原始素材）
  - 提供「改為製作」按鈕 → 設 `collapsed=false`

`BomSummary.vue`：
- 原始素材表：顯示所有葉節點 + collapsed 節點
- 中間產物表：顯示所有展開的可製作節點
- 每次 collapsed 狀態變更時重新計算

### 6. 模擬佇列

```ts
// stores/recipe.ts 新增
const simulationQueue = ref<Recipe[]>([])

function addToQueue(recipe: Recipe) { ... }
function removeFromQueue(index: number) { ... }
function clearQueue() { ... }
```

`SimulatorView.vue`：
- 新增佇列選擇器（el-select 或 tabs）
- 選擇佇列中的配方 → 載入該配方的 recipeLevelTable 到模擬器
- 主配方始終在佇列第一位
- 佇列項目可移除

### 7. 效能考量

- 遞迴查詢配方可能產生大量 API 呼叫（每個材料一次 `recipe_table` + 可能的 `getRecipe`）
- 快取策略：以 `itemName` 為 key 快取 `findRecipesByItemName` 結果（Map）
- 以 `recipeId` 為 key 快取 `getRecipe` 結果
- 顯示 loading 進度（「正在展開子配方... 3/8」）

### 8. 迴圈偵測

某些配方理論上可能互相引用（雖然在 FFXIV 中不太可能）。用 `Set<number>` 追蹤目前遞迴路徑上的 itemId，遇到重複的就停止展開並標記為原始素材。

## 技術細節

- `recipe_table` 端點用精確名稱可以查到配方，原始素材回傳空陣列
- 一個物品可能有多個職業的配方，預設取第一個（可讓使用者選擇）
- `item_info` 端點不包含 recipe_id，無法直接判斷是否可製作
- 遞迴展開需要 N 次 API 呼叫，需做好快取和 loading 狀態
