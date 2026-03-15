# FF14 Craft Helper - 批量製作最佳化需求文件 (v2)

> 基於原始需求文件改善，補充細節、邊界條件、UI 規格與演算法描述。

---

## 總覽

### 目標
將現有「逐一查配方 → 模擬 → 手動查價 → 採購 → 製作」的 O(m×n) 重複操作，
簡化為「加入批量清單 → 一鍵最佳化 → 照清單採購 → 照待辦製作」的線性流程。

### 三大模組

| Step | 模組 | 簡述 |
|------|------|------|
| 1 | HQ 最佳組合計算 | 自動找出最低成本的 HQ 素材組合 |
| 2 | 採購清單產生 | 水晶分離、跨服比價、按伺服器分組 |
| 3 | 一鍵批量模擬 | 整合 Step 1+2，批量處理 + 製作待辦清單 |

### 新增 UI 入口
- **方案 A：新增「批量製作」獨立 View**（側邊欄新增項目）
- 配方搜尋頁新增「加入批量」按鈕

---

## Step 1 - 最佳 HQ 計算

### 問題
模擬後若最佳解無法達成雙滿（進度滿 + 品質滿），使用者需手動調整 HQ 素材數量。
目前 `CraftRecommendation.vue` 已有推薦功能，但缺少遞迴查價和自動化整合。

### 現有可複用邏輯

| 功能 | 檔案 | 函式 |
|------|------|------|
| HQ 組合列舉 + 成本排序 | `src/services/hq-optimizer.ts` | `findOptimalHqCombinations()` |
| 初始品質計算 | `src/engine/quality.ts` | `calculateInitialQuality()` |
| BOM 遞迴展開 | `src/services/bom-calculator.ts` | `buildMaterialTree()` |
| 購買 vs 自製成本 | `src/services/bom-calculator.ts` | `computeOptimalCosts()` |
| 批量查價 | `src/api/universalis.ts` | `getAggregatedPrices()` |

### 需求

1. **自動計算 HQ 組合**
   - 執行 Solver（initial_quality=0）取得品質結果
   - 若已雙滿 → 跳過 HQ 計算，直接進入查價
   - 若品質不足 → 計算 quality deficit = maxQuality - achievedQuality
   - 列舉所有 HQ 素材組合，篩選 initial_quality ≥ deficit 者

2. **整合查價，避免重複**
   - 先收集所有有效組合涉及的物料 ID（去重）
   - 一次性批量查價（Universalis API 支援單次最多 100 items）
   - 再回填各組合的總成本

3. **推薦最低價組合**
   - 依總成本升序排列，推薦 Top 5
   - 自動套用最便宜的組合（或讓使用者選擇）

4. **遞迴查價（可選）**
   - 設定項：`啟用遞迴查價` (boolean) + `最大遞迴深度` (number, default: 3)
   - 對每個可製作的素材，比較三種成本：
     - 買 NQ 市場價
     - 買 HQ 市場價
     - 自製成本（= 遞迴展開子配方的素材成本總和）
   - 取三者最低作為該素材的成本
   - 若選擇「自製」，該素材會進入製作待辦清單

5. **輸出格式**
   - 僅列出最佳組合的物料清單及價格
   - **排除水晶**（itemId < 20）
   - 標示每個素材是「買 NQ」「買 HQ」或「自製」

### 邊界條件

| 情境 | 處理方式 |
|------|----------|
| 市場無上架（0 listings） | 標示「無市場資料」，預設為自製 |
| HQ 無上架但 NQ 有 | 僅比較 NQ 價 vs 自製成本 |
| 所有組合都無法達成雙滿 | 觸發例外 dialog（見 Step 3） |
| 素材為不可製作品（採集/掉落） | 僅查市場價，不走遞迴 |
| 遞迴偵測到循環 | 已有 cycle detection（ancestorIds），停止展開 |

### 初始品質計算公式
```
ratio = Σ(hqAmount_i × level_i) / Σ(totalAmount_i × level_i)
initial_quality = floor(maxQuality × materialQualityFactor / 100 × ratio)
```
> 引用自 `src/engine/quality.ts`，使用 FF14 官方公式。

---

## Step 2 - 採購清單

### 問題
現有 BOM View 顯示扁平化素材清單，但未區分水晶、不支援跨服比價。

### 需求

1. **水晶分離顯示**
   - 判斷條件：`itemId < 20`（現有邏輯）
   - 獨立區塊顯示水晶總量（如：火之水晶 ×30、風之水晶 ×20）
   - 不查價、不計入總成本

2. **跨服採購設定**
   - 新增 Settings 選項：`啟用跨服採購` (boolean)
   - 存入 `settings` store，持久化至 localStorage

3. **單伺服器模式**（跨服關閉時）
   - 查詢當前伺服器價格（現有行為）
   - 單一表格顯示所有素材

4. **跨服模式**（跨服開啟時）
   - 使用 Universalis DC-wide API 一次查詢整個 Data Center 的價格
   - 對每個素材，取所有伺服器中的最低價
   - **Grouping**：按「最便宜伺服器」分組，產生多張表格
   - 每張表格顯示：伺服器名稱、素材列表（名稱/數量/單價/小計）、該伺服器小計
   - 底部顯示 Grand Total

### 跨服 Grouping 演算法
```
for each material in material_list:
    prices = query_dc_wide(material.itemId)
    cheapest_server = min(prices, key=price)
    assign material to server_groups[cheapest_server]

display each server_group as separate table
```
> 簡單貪心法：每個素材獨立選最便宜的伺服器。
> 不做 NP-hard 的最小化伺服器數量最佳化（over-engineering）。

### 邊界條件

| 情境 | 處理方式 |
|------|----------|
| 某素材在 DC 內所有伺服器都無上架 | 標示「DC 內無上架」警告 |
| 查價 API 失敗/逾時 | 顯示錯誤提示，允許重試該素材 |
| 價格資料過舊（>24hr） | 顯示「最後更新：X小時前」提示 |
| 伺服器只有 1 個素材極便宜但量不足 | 顯示上架數量，讓使用者自行判斷 |

---

## Step 3 - 一鍵批量模擬

### 問題
n 個目標 × m 層遞迴 = O(m×n) 次手動操作。

### 需求

#### 3.1 批量清單管理

- **入口**：配方搜尋頁新增「加入批量」按鈕
- **批量 View** 頂部顯示批量清單表格：
  - 欄位：配方圖示、名稱、數量（可編輯）、職業、等級、操作（移除）
  - 數量變更後不需要重新計算（等使用者按「開始」）
- **持久化**：存入新的 `batch` Pinia store，持久化至 localStorage
- **設定區**：
  - 遞迴查價開關 + 最大深度
  - 跨服採購開關（連動 settings store）

#### 3.2 批量最佳化引擎

按下「開始最佳化」後的處理流程：

```python
async def batch_optimize(batch_list, settings):
    results = []
    exceptions = []

    for i, target in enumerate(batch_list):
        update_progress(i, len(batch_list), target.name)

        # Phase 1: 驗證
        gearset = get_gearset(target.recipe.job)
        if gearset.level < target.recipe.level:
            exceptions.append(LevelException(target))
            if settings.exception_strategy == 'buy':
                # 套用購買價：查成品市場價加入採購清單
                buy_results.append(BuyFinished(target))
            continue

        # Phase 2: 求解
        solver_result = await solve(target.recipe, gearset)

        # Phase 3: HQ 最佳化
        if is_double_max(solver_result):
            materials = collect_nq_materials(target)
        else:
            best_combo = find_cheapest_hq_combo(
                target, solver_result, settings.recursive, settings.max_depth
            )
            if best_combo is None:
                exceptions.append(QualityException(target))
                if settings.exception_strategy == 'buy':
                    buy_results.append(BuyFinished(target))
                continue
            materials = best_combo.materials

        results.append(BatchResult(target, solver_result, materials))

    # Phase 4: 彙整
    aggregated = aggregate_materials(results)  # 去重、合併數量
    crystals = separate_crystals(aggregated)

    # Phase 5: 查價 + 分組
    shopping_list = generate_shopping_list(
        aggregated, settings.cross_server
    )

    # Phase 6: 製作待辦
    todo_list = generate_todo_list(results)  # 拓撲排序

    return BatchOutput(shopping_list, crystals, todo_list, exceptions)
```

#### 3.3 進度條

- 顯示：`████████░░░░ 3/5 正在計算：白金錠`
- 包含：整體進度百分比、當前處理的配方名稱
- 提供「取消」按鈕（中止後保留已完成的部分結果）

#### 3.4 例外處理

**設定項：例外處理策略**（在計算設定區）
- **跳過**（預設）：遇到例外的配方自動跳過，不納入採購清單與待辦
- **套用購買價**：遇到例外時，改為查詢該成品的市場價格，直接加入採購清單

**等級不足：**
- 提示：「你的 [職業] 等級 [X] 不足以製作 [配方名]（需要等級 [Y]）」
- 跳過模式 → 排除此配方
- 購買模式 → 查詢成品市場價，加入採購清單

**無法達成雙滿：**
- 提示：「[配方名] 即使使用全部 HQ 素材仍無法達成品質上限（最佳可達品質 X / 上限 Y）」
- 跳過模式 → 排除此配方
- 購買模式 → 查詢成品市場價，加入採購清單

> 無論哪種策略，例外提示 Tab 都會列出所有遇到的例外及其處理方式，不中斷批量計算流程。

#### 3.5 製作待辦清單

- **排序邏輯**：拓撲排序（topological sort）
  - 先製作最底層的半成品
  - 再製作依賴它們的上層半成品
  - 最後製作目標成品
  - 已有 `getCraftingOrder()` 可複用
- **每個待辦項目包含**：
  - 勾選框（mark as done）
  - 序號
  - 製作品名稱 + 圖示
  - 數量
  - 所需職業
  - 「查看巨集」按鈕 → 展開/彈出該配方的巨集文字
- **巨集格式**：
  - 複用現有 SimulatorView 的巨集匯出邏輯
  - 顯示 FF14 巨集文字，可一鍵複製

#### 3.6 結果顯示

使用 Tabs 組織結果：

| Tab | 內容 |
|-----|------|
| 採購清單 | 水晶總量 + 素材表格（單/多伺服器） |
| 製作待辦 | 有序的製作清單 + 巨集 |
| 例外處理 | 需要使用者決定的項目（若無例外則隱藏） |

---

## 技術考量

### 效能

| 瓶頸 | 預估耗時 | 對策 |
|------|----------|------|
| WASM Solver（每配方） | 5-30 秒 | Web Worker 非同步，顯示進度 |
| Universalis API 查價 | 1-3 秒/批次 | 批量查詢（最多 100 items/次）、去重 |
| HQ 組合列舉 | <1 秒 | 搜索空間通常 < 1000（典型配方 3-6 材料） |
| 遞迴展開 | 依深度，每層 1-2 秒 | 限制最大深度、快取配方資料 |

### API Rate Limiting
- Universalis 建議間隔 100ms+ between requests
- 使用現有的 chunk 機制（100 items/batch），加上適當 delay

### 資料流

```
RecipeSearch → batch store (add target)
                    ↓
BatchView → batch-optimizer service (orchestrate)
                    ↓
            ┌── solver-worker (WASM solve per recipe)
            ├── hq-optimizer (find cheapest combo)
            ├── bom-calculator (recursive expand)
            └── universalis API (batch price query)
                    ↓
            batch store (results, shopping list, todo list)
                    ↓
            BatchView (display tabs)
```

### 新增/修改檔案預估

| 類型 | 檔案 | 說明 |
|------|------|------|
| 新增 Store | `src/stores/batch.ts` | 批量清單、結果、狀態 |
| 新增 Service | `src/services/batch-optimizer.ts` | 批量最佳化引擎 |
| 新增 View | `src/views/BatchView.vue` | 批量製作主頁面 |
| 新增 Components | `src/components/batch/*.vue` | 清單表格、進度條、結果 Tabs |
| 修改 | `src/views/RecipeView.vue` | 新增「加入批量」按鈕 |
| 修改 | `src/stores/settings.ts` | 新增跨服、遞迴設定 |
| 修改 | `src/router/index.ts` | 新增 `/batch` 路由 |
| 修改 | `src/App.vue` | 側邊欄新增「批量製作」項目 |

---

## 與原始需求差異對照

| 原始需求 | v2 補充 |
|----------|---------|
| 「遞迴計算半成品的HQ購買/自製成本」 | 明確定義三方比較：買NQ / 買HQ / 自製成本 |
| 「不包含所需之水晶」 | 水晶判斷條件：itemId < 20 |
| 「Grouping功能」 | 定義 Grouping 演算法（貪心法：每素材選最便宜伺服器） |
| 「職業等級不足」例外 | 新增設定：跳過（預設）或套用購買價 |
| 「無法求出雙滿組合」例外 | 新增設定：跳過（預設）或套用購買價 |
| 「todo list 包含巨集」 | 複用現有巨集匯出邏輯，支援一鍵複製 |
| 「進度條」 | 定義格式：百分比 + 當前配方名 + 取消按鈕 |
| — | 新增：API rate limiting 對策 |
| — | 新增：邊界條件完整列表 |
| — | 新增：持久化策略（localStorage） |
| — | 新增：效能預估與對策 |
| — | 新增：現有可複用邏輯對照表 |
