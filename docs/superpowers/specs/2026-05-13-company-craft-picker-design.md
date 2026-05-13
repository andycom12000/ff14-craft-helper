# 部隊工坊（Workshop Project Tracker）設計 spec

**Date**: 2026-05-13
**Status**: Draft → Pending implementation plan
**Branch**: `feat/submarine-recipes-in-shopping-list`
**Related**: `src/views/BomView.vue`, `src/stores/bom.ts`, `scripts/build-game-data.mjs`

## 1. 動機

FFXIV 玩家經營 FC 工坊時，潛水艇/飛空艇零件與工坊建材都屬於 `CompanyCraftSequence` 體系——不是 `Recipe.csv` 裡的個人 DoH 配方。目前的痛點有兩層：

1. **算素材**：本 app 無法處理 CompanyCraft，使用者要手動加總每個零件的素材
2. **追進度**：遊戲內每個 phase 要繳特定數量的素材，使用者要在遊戲與網頁/筆記之間來回切換才能對清「下一步要做什麼」

本 spec 把全部 CompanyCraft 物件接入工具流：開一個獨立的「部隊工坊」**專案追蹤頁面**，使用者可以建立「整艘潛水艇」或單一建材的專案，逐 phase 紀錄 supplyItem 繳交進度，剩餘素材自動回流 BOM 採購。從「一次性 picker」進化為「長期追蹤工作台」。

## 2. 範圍

**包含**：
- Submersible / Airship / Workshop fixtures 全 CompanyCraft 範疇
- **整艘潛水艇/飛空艇**作為單一專案（4 個零件 bundle）
- 工坊建材作為單一專案（1 個 sequence）
- **Phase 級進度追蹤**：每個 phase 內每個 supplyItem 都有「已繳 / 應繳」counter
- 剩餘素材即時聚合 → BOM 採購視角
- 專案 CRUD + localStorage 持久化

**不包含**：
- 跨設備同步（YAGNI；localStorage 即可，未來如要 cloud sync 另議）
- 自動讀取遊戲內進度（無 API，玩家手動更新）
- Macro / solver / HQ — CompanyCraft 沒 craft loop，不適用
- 「目前 phase 進行中 60%」之類的非整數小數位（per-supplyItem count 已足夠）

## 3. 為什麼砍掉「build-time 素材聚合」

舊草案在 build 時把每個 sequence 的全部 phase 素材加總寫進 `totalMaterials` 欄位。新草案**移除**它，理由：

| 議題 | Build-time 聚合 | 客戶端動態聚合 |
|---|---|---|
| 「剩餘素材」 | 算不出來（不知 phase 進度） | 自然 |
| 「總素材」 | 直接讀 | `phases.flatMap(p => p.supplyItems)` O(2000) sub-ms |
| 資料同步性 | 兩份資料有不同步風險 | 單一 source of truth |
| JSON 大小 | +~30% | 較小 |

**結論**：JSON 只存 phases，總量與剩餘量都在 client 算。

## 4. 架構

### 4.1 資料層

**Build script 擴充（`scripts/build-game-data.mjs`）**

讀入 4 張 CSV（既有 sparse-checkout 內）：
- `CompanyCraftSequence.csv`
- `CompanyCraftPart.csv`
- `CompanyCraftProcess.csv`
- `CompanyCraftType.csv`

**輸出檔 `public/data/company-craft.json`**

```ts
{
  schemaVersion: 1,
  sequences: [
    {
      id: number,               // CompanyCraftSequence rowId
      resultItemId: number,     // name 透過既有 items map
      category: 'submersible' | 'airship' | 'workshop',
      partSlot?: 'bow' | 'stern' | 'hull' | 'bridge' | null,
        // 給 sub/airship 用，建材為 null
      phases: Array<{
        partIndex: number,
        processIndex: number,
        jobAbbr: string,        // 'CRP' | 'BSM' | ...
        level: number,
        supplyItems: Array<{ itemId: number, amount: number }>,
      }>,
    },
  ]
}
```

`category` + `partSlot` 推斷規則：build-time 用 hardcoded ItemUICategory → category 表 + ResultItem name pattern match 出 partSlot（FF14 命名通常為「Bow / Stern / Hull / Bridge」結尾）。推斷失敗則 partSlot = null，但 category 必填。

**Local data source API（`src/services/local-data-source.ts`）**

```ts
export async function loadCompanyCraft(): Promise<CompanyCraftSequence[]>
export function getCompanyCraftSequence(id: number): CompanyCraftSequence | null
export function listCompanyCraftByCategory(
  category: 'submersible' | 'airship' | 'workshop',
  partSlot?: 'bow' | 'stern' | 'hull' | 'bridge',
): CompanyCraftSequence[]
```

### 4.2 Project state model

**新 Pinia store `src/stores/workshop-projects.ts`**

```ts
export interface PhaseProgressKey {
  sequenceId: number      // 哪個 sequence
  partIndex: number       // 哪個 Part
  processIndex: number    // 哪個 Phase
}

export interface WorkshopProject {
  id: string                                          // uuid
  name: string                                        // 「Tatanora 號」「我的小花園」
  category: 'submersible' | 'airship' | 'workshop'
  createdAt: number
  completedAt?: number                                // 全 phase 完成時填
  sequences: Array<{
    sequenceId: number
    quantity: number                                  // 通常 1，建材偶爾批量
  }>
  // phase key → supplyItem index → delivered count
  phaseProgress: Record<
    string,                                           // serialize(PhaseProgressKey)
    Record<number, number>                            // supplyItemIndex → delivered
  >
}
```

**Persistence**

- localStorage key `toast-workshop:workshop-projects` (對應既有 `toast-workshop:` 命名空間)
- 寫入 debounced 500ms（同 BOM route session pattern）
- Schema version 1，未來 migration 用 `_schemaVersion` 欄位（首版可省略）

**Selectors**

```ts
// 已繳數量
getDelivered(project, phaseKey, supplyItemIndex): number

// 此 phase 是否全繳清
isPhaseComplete(project, phaseKey): boolean

// 專案整體完成度（0–1）
getProjectProgress(project): number

// 剩餘素材聚合（itemId → amount）
getRemainingMaterials(project): Map<number, number>

// 全素材總量（itemId → amount）— 預估採購用
getTotalMaterials(project): Map<number, number>
```

`getRemainingMaterials` 邏輯：for each sequence × quantity，for each phase，for each supplyItem，加上 `(amount - delivered)` 到 itemId 累計值；若已 ≥ amount 則跳過。

### 4.3 BOM 整合

**BomTarget 新增 kind**

```ts
interface CompanyCraftProjectBomTarget extends BaseBomTarget {
  kind: 'company-craft-project'
  projectId: string
}

export type BomTarget =
  | RecipeBomTarget
  | CompanyCraftProjectBomTarget
  | NoRecipeBomTarget
```

舊草案的 `kind: 'company-craft'`（單 sequence）不再需要 — project 模型統一處理。

**localStorage migration（同舊草案，extended）**

```ts
function migrateLegacyTarget(t: any): BomTarget {
  if (t.kind) return t
  if (t.recipeId == null) return { ...t, kind: 'no-recipe' }
  return { ...t, kind: 'recipe', recipeId: t.recipeId }
}
```

**`bom-calculator.buildMaterialTree` 加分支**

```ts
if (target.kind === 'company-craft-project') {
  const project = workshopProjectsStore.getProject(target.projectId)
  if (!project) return fallbackLeaf(target)

  const remaining = getRemainingMaterials(project)
  const ancestorIds = new Set<number>()
  const children = await Promise.all(
    [...remaining.entries()].map(([itemId, amount]) =>
      expandNode(itemId, '', '', amount, 1, maxDepth, ancestorIds),
    ),
  )

  return {
    itemId: -1 * stringHash(target.projectId),  // synthetic itemId（無 result item id 對應）
    name: target.name, icon: target.icon,
    amount: 1,
    workshopProjectId: target.projectId,
    children,
  } as MaterialNode
}
```

**Sync 方向：單向（Tracker → BOM）**

Tracker 與 BOM 是兩個獨立事件域，**不做雙向同步**：

| 事件 | 發生地 | 狀態存哪 |
|---|---|---|
| 「我**取得了**新鮮雲杉木 × 12」 | 市場板 / 採集點 | BOM route planner 的 `checked` |
| 「我**繳交了**新鮮雲杉木 × 8 給 Phase 3」 | FC workshop NPC | Tracker phase counter |

實務上至少 5 種場景會讓「買到」≠「繳交」：

1. **Phase cooldown**：phase 推進後遊戲內 cd（數小時～半天），素材齊了仍只能等
2. **職等不足**：Phase 4 要 LTW 70；目前 LTW 60 → 買齊也不能繳
3. **FC 成員協作**：該 phase 的職人沒上線
4. **Buffer 採購**：怕製作失敗多買 6 個，實際只該繳 24，buffer 在背包不該算入「已繳」
5. **跨專案調度**：一筆採買要分給 Tatanora + Whisperwood 兩艘船 — 雙向同步無法判斷該分到哪
6. **部分繳交**：phase 要 12，先繳 5 等回購補貨
7. **排名點數操作**：FC 為控制工坊排名週期刻意延遲繳交

雙向同步在這 7 個場景中有 5 個會出錯（自動推進 phase counter，但實際遊戲內未繳）。語意上：
- **BOM 的勾 = 「我從外部取得了素材」**（買 / 採 / 自製到）
- **Tracker 的 counter = 「我繳給 FC workshop 了」**

兩者獨立，Tracker counter ≤ BOM checked 是不變式但無強制關聯。

**Reactive 連動（單向 Tracker → BOM）**

當使用者在 tracker 頁更新 phase progress：
1. `workshopProjectsStore` mutate
2. 既有 BOM target 中 `kind === 'company-craft-project'` 的 root 變 stale
3. 透過 Pinia watcher 觸發 `BomView.handleCalculate` 重算（或更精細：只重算對應 root）

UI 反饋：「素材清單已更新」soft toast；BOM 中那 row 的素材數字過渡動畫 200ms。

BOM 內的操作（acquisition mode 切換、route checked、價格刷新）**不會**回寫 Tracker — Tracker 完全不訂閱 BOM 變動。

**「同步購物清單」按鈕 label 隨狀態變**

| 狀態 | label | 行為 |
|---|---|---|
| 此 project 尚未在 BOM 中 | 「加入購物清單」 | 建立 BOM target + 路由 push 到 `/bom` |
| 此 project 已有對應 BOM target | 「前往購物清單 →」 | 路由 push（reactive watcher 已在同步，不需另外觸發） |

按鈕本身只負責「建立關聯 + 導航」，**素材數字同步由 reactive watcher 處理**（按一次以後就自動跟著 phase counter 走）。

**「送進 Batch」按鈕**

CompanyCraft 不適用 Batch。`handleSendToBatch` filter 改為 `t.kind === 'recipe'`。

### 4.4 部隊工坊頁面 UX

#### 路由 + sidebar

- 路由 `/company-craft`，name `companyCraft`，title「部隊工坊」
- Sidebar 加入新項，置於「購物清單」之後
- icon：使用 craft 系列、或 emoji 🛠

#### 主視角：My Projects

**Empty state（首次進入）**

複用 Editorial Hero pattern：

```
工坊圖紙 · BLUEPRINTS               ← eyebrow toast-gold glow
部隊工坊                            ← Noto Serif TC 28-36 700
『今天工坊裡，動到哪一步了？』       ← Cormorant italic tagline
─────── (chalk rule)

      ┌─────────────────────┐
      │   還沒有開工的專案   │
      │                     │
      │   〔+ 新增專案〕     │  ← toast-gold CTA
      └─────────────────────┘
```

**Active projects（有專案時）**

```
工坊圖紙 · BLUEPRINTS
部隊工坊
『今天工坊裡，動到哪一步了？』
───────

〔+ 新增專案〕                                       2 個進行中

┌─ Tatanora 號 ─────────────────────────────── 🛰 ─┐
│ 潛水艇 · 4 零件 · 7/20 階段完成 (35%)            │
│ ████████░░░░░░░░░░░░                            │
│ 剩餘素材 18 種 · 估價 1,240,000 gil             │
│                          [展開] [→ 同步購物清單] │
└──────────────────────────────────────────────────┘

┌─ 一樓陽台花園 ──────────────────────────────── 🌿─┐
│ 工坊建材 · 1 件 · 0/5 階段                       │
│ ░░░░░░░░░░░░░░░░░░░░                            │
│ 剩餘素材 8 種 · 估價 89,000 gil                  │
│                          [展開] [→ 同步購物清單] │
└──────────────────────────────────────────────────┘
```

點 [展開] inline 顯示 phase board。

#### Phase Board（展開後）

```
┌─ Tatanora 號 ─ 展開中 ─────────────────────────┐
│                                                 │
│  [船首 Tatanora]  [船尾 Tatanora]               │
│  [船身 Tatanora]  [船底 Whisperwood]   ← 4 零件 │
│                                                 │
│  ▼ 船首 Tatanora                                │
│   ✓ Phase 1  LTW 70                            │
│   ✓ Phase 2  GSM 75                            │
│   ▶ Phase 3  BSM 80    進行中 8/12             │
│      新鮮雲杉木   [−] 8/12 [+]                 │
│      樹脂        [−] 6/8  [+]                  │
│      鐵錠        [−] 4/12 [+]                  │
│      ━━━━━━━━━━━━━━━━━━━━━━ 60%               │
│      [全部繳清] [標記下一階段]                  │
│   ○ Phase 4  CRP 70                            │
│   ○ Phase 5  CRP 70                            │
│  ▶ 船尾 Tatanora      0/5 階段                 │
│  ▶ 船身 Tatanora      0/5 階段                 │
│  ▶ 船底 Whisperwood   0/4 階段                 │
└──────────────────────────────────────────────────┘
```

- 預設只展開「進行中」phase；其他 collapsed
- ✓ 完成、▶ 進行中、○ 未開工 三色：success / cocoa / ink-muted
- supplyItem counter：`[−]` `8/12` `[+]`；點數字可直接打字輸入
- Quick actions：「全部繳清」一鍵把所有 supplyItem 設 max；「標記下一階段」把當前 phase 全繳清並推進下一 phase 為進行中

#### 新增專案對話框

`el-dialog` 全螢幕（mobile）/ 大 modal（desktop），3 步：

**Step 1: 選類型**

```
┌─ 新增專案 ────────────────────────── ✕ ─┐
│                                          │
│  做什麼？                                │
│                                          │
│  ┌───────────┐  ┌───────────┐           │
│  │   🛰      │  │   ✈      │           │
│  │  潛水艇   │  │  飛空艇   │           │
│  │  (4 零件) │  │  (4 零件) │           │
│  └───────────┘  └───────────┘           │
│  ┌───────────┐                          │
│  │   🛠      │                          │
│  │ 工坊建材  │                          │
│  │  (單件)   │                          │
│  └───────────┘                          │
│                                          │
└──────────────────────────────────────────┘
```

**Step 2: 配置內容**

For 潛水艇/飛空艇：4 個 slot picker，每個 slot 列出該類別可用 sequence（dropdown 或可搜尋的 cascade selector）。slot 可留空（表示之後再決定 / 替換零件不全做）。

```
┌─ 配置潛水艇 ──────────────────── 上一步 ─┐
│                                          │
│  船首  [Tatanora              ▾]        │
│  船尾  [Tatanora              ▾]        │
│  船身  [Whisperwood           ▾]        │
│  船底  [— 選擇 —              ▾]        │
│                                          │
│  總素材預估：18 種，估價 1,240,000 gil  │
│                                          │
│                     [下一步：命名 →]    │
└──────────────────────────────────────────┘
```

For 工坊建材：單一搜尋框 + ledger list（同舊草案的 picker UI），選 1 項。

**Step 3: 命名 + 確認**

```
┌─ 命名專案 ─────────────────── 上一步 ─┐
│                                        │
│  專案名稱  [Tatanora 號          ]    │
│           ↑ 自動填入，可改             │
│                                        │
│  ──────────────────────────────────   │
│  總素材預估：18 種，1,240,000 gil     │
│  Phase 總數：20                       │
│  ──────────────────────────────────   │
│                                        │
│              [取消] [建立並開始 →]    │
└────────────────────────────────────────┘
```

建立後對話框關閉，新專案出現在 My Projects 最上方，自動展開到第一個 phase。

#### 與 BOM 的關聯（單向，見 §4.3）

專案卡片右上有一個按鈕，**label 隨狀態變**：

| 狀態 | label | 行為 |
|---|---|---|
| 尚未關聯 BOM | 「加入購物清單」 | 建立 BOM target + 路由 push `/bom` |
| 已關聯 BOM | 「前往購物清單 →」 | 純導航；素材已由 reactive watcher 同步 |

按鈕只負責**建立關聯 + 導航**。第一次按以後，素材數字會跟著 phase counter 自動更新；BOM 內任何操作（採購模式切換、route 勾選、價格刷新）**不會**回寫 Tracker。

**為什麼單向**：BOM 勾 = 「我取得了素材」；Tracker counter = 「我繳交給 workshop 了」。實務上至少 7 種場景（phase cd、職等不足、buffer 採購、跨專案調度…）會讓兩者錯開，雙向同步會誤報 phase 完成。詳見 §4.3。

#### 互動細節

| 動作 | 結果 |
|---|---|
| supplyItem `+`/`−` | mutate `phaseProgress`，触發 BOM reactive 更新 |
| supplyItem 數字直接編輯 | 同上，clamp 在 [0, max] |
| 「全部繳清」此 phase | 此 phase 所有 supplyItem 設為 max |
| 「標記下一階段」 | 推進到下一個未完成 phase；UI 自動 scroll + 展開 |
| Phase collapse/expand | 純 UI 狀態，不入 store |
| 專案完成（最後 phase ✓） | 顯示祝賀 toast；專案進入「已完成」狀態，可保留作為紀錄或刪除 |
| 刪除專案 | 確認後移除；對應 BOM target 也清除 |
| 編輯專案（換零件） | 從 detail 頁有「更換零件」入口，重開 Step 2 對話框；保留同 slot 已繳 phase 不影響 |

#### 狀態列表

| 狀態 | 視覺 |
|---|---|
| Empty | 「還沒有開工的專案」+ 大 CTA |
| Loading data | 「圖紙抽屜整理中…」skeleton ×4 |
| Active projects | Editorial hero + project cards |
| Project expanded | Phase board inline，當前 phase auto-expanded |
| Phase delivery 中 | supplyItem progress bar 動畫過渡 |
| Phase complete | ✓ icon (success)，phase header 變淡綠 wash |
| 專案完成 | 整張卡 cream-surface-2 底 + 「✓ 完成於 YYYY-MM-DD」chip |
| 對話框 step 切換 | left/right slide transition 220ms |
| Data fetch fail | 「圖紙抽屜卡住了」+ 重試 |
| Mobile (≤640) | 對話框全螢幕；phase board 寬度自適應；counter 變大 touch target |
| Dark mode | 既有 token 自動接 |

#### 色彩運用

- page-accent = cocoa（同 BOM/Crafting 域）
- 進行中 phase / 主 CTA：toast-gold
- 完成狀態：success（綠）
- 未開工：ink-muted
- 重要警示（刪除）：danger

#### Analytics

- `workshop_project_create`（category, sequenceCount, hasAllParts）
- `workshop_project_phase_delivered`（projectId, phaseProgress = %）
- `workshop_project_phase_completed`（projectId, phaseIndex）
- `workshop_project_completed`（projectId, daysToComplete）
- `workshop_project_delete`
- `workshop_project_sync_to_bom`

## 5. 非目標 / 顯式擱置

- **跨設備同步**：localStorage 已夠用；cloud sync 未來再議
- **遊戲內 API 讀進度**：FF14 沒有官方 API，玩家手動更新是唯一可行路徑
- **多帳號 / 多 FC 分組**：所有專案在同一 list，未來如需要再加 tag
- **歷史紀錄 / 統計**：完成的專案保留可看，但不做花俏的「本月完成 5 艘船」報表
- **預估完工時間**：FC workshop 每 phase 有遊戲 cd，但與多 FC 成員、製作速度有關，難準確預估，不做
- **Phase 內小數位（60%）**：per-supplyItem count 已是粒度上限

## 6. 風險與緩解

| 風險 | 緩解 |
|---|---|
| 使用者誤刪專案，phase progress 丟失 | 刪除 confirm dialog；保留 7 天 trash（localStorage 內 deletedProjects 陣列，再覆寫前可復原） |
| localStorage quota 爆掉 | 單專案 < 2KB，100 個專案才 200KB；quota 5MB 內無壓力 |
| Phase progress 數字與遊戲不一致（使用者忘記更新） | UI 顯示「上次更新 N 小時前」hint；同步 BOM 時提醒「請確認是否最新」 |
| CompanyCraftSequence.csv schema 變動 | build-game-data 加 schema sanity 檢查 |
| 推斷 partSlot 失敗 | fallback null；UI 用 sequence 名稱本身作 slot label |
| 4-slot 配置中只填 2-3 個 | 視為合法（替換零件場景），剩餘 slot 標記「空缺」，不阻擋建立專案 |
| BOM target 與 project 同步失準 | 用 single source of truth：BOM 只讀取 project 計算的 remaining，不本地 cache；project 更新立即觸發 BOM 重算 |

## 7. 測試策略

- **build-game-data unit**：fixture 包含小樣本 sub/airship/workshop sequence，測 parsing + partSlot 推斷 + category 推斷
- **workshop-projects store unit**：
  - 建立專案、加 sequence、初始 phaseProgress 全 0
  - `getRemainingMaterials` 在各種進度下的正確性（全 0 / 部分 / 全滿）
  - `getProjectProgress` 計算
  - localStorage round-trip（序列化/反序列化）
- **bom-calculator unit**：`kind: 'company-craft-project'` target 在 phase progress 變動下的展開結果
- **CompanyCraftView smoke**：
  - 空狀態 → 開新增專案 → 完成建立
  - 專案展開 → counter `+`/`−` → 同 phase 完成 → 自動推進
  - 同步到 BOM → BOM 出現對應 target
- **a11y**：counter 鍵盤可用、phase 展開 `aria-expanded`、新增專案 dialog focus trap

## 8. 實作順序建議（給 writing-plans）

### 階段 A · 資料層
1. Build script 加 4 張 sheet parsing；partSlot 推斷
2. `company-craft.json` schema + sanity checks（**無 totalMaterials**）
3. local-data-source 新 loader + category/partSlot 查詢 API
4. Unit tests

### 階段 B · Project state model
5. `workshop-projects.ts` store：interfaces + CRUD + selectors（`getRemainingMaterials` 等）
6. localStorage persistence（debounced write、migration 預留欄位）
7. Unit tests

### 階段 C · BOM 整合
8. BomTarget 新 union `company-craft-project`
9. bom-calculator 加 branch
10. Reactive sync：project mutate → BOM 重算
11. `handleSendToBatch` filter 升級
12. Unit tests

### 階段 D · 部隊工坊頁面 — 主視角
13. Route + sidebar entry
14. Editorial hero
15. My Projects list（empty state + project cards + progress bar）
16. 同步到 BOM 按鈕

### 階段 E · 部隊工坊頁面 — Phase board
17. 專案展開（inline accordion）
18. Phase rows（✓/▶/○ states）
19. SupplyItem counter（`+`/`−` + 直接輸入）
20. 「全部繳清」「標記下一階段」quick actions

### 階段 F · 新增專案 dialog
21. 三步驟對話框 shell（step transition）
22. Step 1 類型選擇
23. Step 2a 潛水艇/飛空艇 4-slot picker
24. Step 2b 工坊建材搜尋列表
25. Step 3 命名 + 預估 + 確認

### 階段 G · Polish
26. Empty / loading / error states
27. Mobile 適配
28. Analytics events
29. Smoke / a11y tests
30. 更新 ChangelogView

## 9. Open questions

1. **Eyebrow 文案**：「工坊圖紙 · BLUEPRINTS」vs「建造目錄 · CATALOG」— 採前者
2. **專案命名 default**：「Tatanora 號」（自動讀第一個 part name + 「號」）vs「我的潛水艇 #3」— 採前者
3. **同步 BOM 後是否自動跳頁面**：採「第一次同步跳頁面，之後不跳，只 toast 提示 BOM 已更新」
4. **編輯零件後已繳 phase 處理**：採「保留同 slot 的 phase progress；換到不同 sequence 時保留會錯誤匹配，故換 sequence 觸發確認 dialog」
5. **完成專案後是否自動刪除 BOM target**：採「不自動刪除，使用者自行清理 BOM」

---

**Approval**：spec 確認後，交由 writing-plans skill 產出階段 A-G 實作計畫。
