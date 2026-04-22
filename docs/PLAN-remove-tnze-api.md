# Plan: 移除 tnze API + 本地靜態資料 + 4 語言 i18n（Parallel Execution 版）

## Context

`ff14-craft-helper` 需拿掉 `tnze.yyyy.games`（未公開授權的私人後端），改為 build-time 從三個公開 datamining repo 產生本地 JSON，並順帶支援 4 語言遊戲資料（繁中、簡中、英、日）。UI 字串本次不翻譯。

本 plan **為 parallel subagent 執行設計**：先建立所有 interface contract 與 stub（Phase 0，serial），之後數條 parallel track 可同時進行（Phase P），最後 serial 整合（Phase I）與驗證（Phase V）。

合併原 `docs/PLAN-remove-tnze-api.md` 與前一輪 brainstorm 補遺。實作時由本 plan 取代原文件。

---

## Decision Log（已定案）

| # | 議題 | 決策 |
|---|---|---|
| D1 | BOM / Recipe 快取 invalidation | 快取只存 id，name 在元件端用 computed 即時查表 |
| D2 | `items-{locale}.json` 序列化 | Array of tuples `[id, name, level, canBeHq, iconId]` |
| D3 | ETL 某語言失敗 | All-or-nothing，整個 workflow fail |
| D4 | Recipe / RLT 來源 | `xivapi/ffxiv-datamining` (en) |
| D5 | Recipe 搜尋 UX | Debounce 200ms + cap 50 + 起始匹配優先 + NFKC 正規化 |
| D6 | CraftType 常數位置 | `src/utils/jobs.ts` 加常數；build script 手抄 8 行 |
| D7 | auto-PR 無 CI 問題 | update-game-data workflow 內先跑 test+build |
| D8 | 測試 fixture | `src/__tests__/fixtures/` + `load.ts` helper |
| D9 | 首次載入 loading UI | Element Plus `v-loading` + skeleton |
| D10 | 多語言記憶體 | 累積快取，不清除（最壞 ~1MB） |
| D11 | Icon URL | 新建 `src/utils/icon-url.ts` pure helper；刪除 `fetchIcons` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  scripts/build-game-data.mjs  (Node, offline)           │
│    → clones 3 datamining repos → writes public/data/*   │
└─────────────────────────────────────────────────────────┘
                           │ (file artifacts)
                           ▼
┌─────────────────────────────────────────────────────────┐
│  public/data/                                           │
│    ├─ manifest.json     (schemaVersion, locales, ...)   │
│    ├─ recipes.json      (language-agnostic)             │
│    ├─ rlt.json          (language-agnostic)             │
│    └─ items/{zh-TW,zh-CN,en,ja}.json  (tuples)          │
└─────────────────────────────────────────────────────────┘
                           │ fetch on demand
                           ▼
┌─────────────────────────────────────────────────────────┐
│  src/services/local-data-source.ts                      │
│    memoized loaders, Map<id, ItemRecord>, fallback      │
└─────────────────────────────────────────────────────────┘
          ▲                           ▲
          │                           │
┌─────────────────┐         ┌─────────────────────┐
│ src/api/*.ts    │         │ composables/        │
│  (delegates)    │         │  useItemName.ts     │
└─────────────────┘         └─────────────────────┘
          ▲                           ▲
          └──────────┬────────────────┘
                     │
          ┌──────────┴─────────┐
          │  components /views │
          └────────────────────┘
          ▲
          │ locale drives reactivity
          │
┌─────────────────┐
│ src/stores/     │
│   locale.ts     │  ← localStorage
└─────────────────┘
```

---

## Phase 0：Contracts & Stubs（**SERIAL，必須先完成**）

目的：讓後續 parallel track 各自能獨立編譯/測試。一位 agent 執行，其他 agent 等這段 commit 後再分派。

### 0.1 建立型別與 interface

**檔案**：`src/services/local-data-source.types.ts`（新檔，僅型別）

```typescript
export type Locale = 'zh-TW' | 'zh-CN' | 'en' | 'ja'
export const LOCALES: readonly Locale[] = ['zh-TW', 'zh-CN', 'en', 'ja'] as const
export const DEFAULT_LOCALE: Locale = 'zh-TW'

export interface ItemRecord {
  name: string
  level: number
  canBeHq: boolean
  iconId: number
}

export interface RecipeRecord {
  id: number
  itemResult: number
  amountResult: number
  craftType: number          // 0..7
  rlv: number
  canHq: boolean
  materialQualityFactor: number
  difficultyFactor: number
  qualityFactor: number
  durabilityFactor: number
  ingredients: Array<[itemId: number, amount: number]>
}

export interface RltRecord {
  classJobLevel: number
  difficulty: number
  quality: number
  durability: number
  suggestedCraftsmanship: number
  progressDivider: number
  qualityDivider: number
  progressModifier: number
  qualityModifier: number
  conditionsFlag: number
}

export interface Manifest {
  schemaVersion: 1
  buildTime: string
  locales: Locale[]
  defaultLocale: Locale
  sources: Record<Locale, { repo: string; commit: string }>
}

// on-disk tuple format
export type ItemTuple = [id: number, name: string, level: number, canBeHq: 0 | 1, iconId: number]
export interface ItemsFile { schemaVersion: 1; items: ItemTuple[] }

// search result contract（與既有 xivapi.ts signature 對齊）
export interface RecipeSearchResult {
  id: number
  itemId: number
  name: string
  job: string              // 'CRP' | 'BSM' | ... (from JOB_NAMES keys)
  rlv: number
  canHq: boolean
  materialQualityFactor: number
}
```

### 0.2 建立 local-data-source.ts stub

**檔案**：`src/services/local-data-source.ts`（stub）

每個 export 先實作為 `throw new Error('stub')`；讓 import 可過 type check：

```typescript
import type { Locale, ItemRecord, RecipeRecord, RltRecord, Manifest, RecipeSearchResult } from './local-data-source.types'
export * from './local-data-source.types'

export function getLocale(): Locale { throw new Error('stub') }
export async function setLocale(_: Locale): Promise<void> { throw new Error('stub') }
export function onLocaleChange(_: (l: Locale) => void): () => void { throw new Error('stub') }
export async function loadRecipes(): Promise<RecipeRecord[]> { throw new Error('stub') }
export async function loadItems(_?: Locale): Promise<Map<number, ItemRecord>> { throw new Error('stub') }
export async function loadRlt(): Promise<Map<number, RltRecord>> { throw new Error('stub') }
export async function loadManifest(): Promise<Manifest> { throw new Error('stub') }
export async function getItem(_: number, __?: Locale): Promise<ItemRecord | undefined> { throw new Error('stub') }
export function getItemSync(_: number, __?: Locale): ItemRecord | undefined { throw new Error('stub') }
export async function getRecipe(_: number): Promise<RecipeRecord | undefined> { throw new Error('stub') }
export async function getRlt(_: number): Promise<RltRecord | undefined> { throw new Error('stub') }
export async function searchRecipesByName(_: string, __?: Locale): Promise<RecipeSearchResult[]> { throw new Error('stub') }
// loading state (reactive refs defined in implementation track)
export const loadingState: Record<Locale, { recipes: boolean; items: boolean; rlt: boolean }> = {} as any
```

### 0.3 建立 locale store stub

**檔案**：`src/stores/locale.ts`（stub）

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Locale } from '@/services/local-data-source.types'
import { DEFAULT_LOCALE } from '@/services/local-data-source.types'

export const useLocaleStore = defineStore('locale', () => {
  const current = ref<Locale>(DEFAULT_LOCALE)
  async function setLocale(_: Locale): Promise<void> { throw new Error('stub') }
  return { current, setLocale }
})
```

### 0.4 建立 icon-url stub + jobs.ts 常數

**檔案**：`src/utils/icon-url.ts`（stub）

```typescript
export function getIconUrl(iconId: number): string { throw new Error('stub') }
```

**檔案**：`src/utils/jobs.ts`（append only）

```typescript
export const CRAFT_TYPE_TO_JOB: Record<number, keyof typeof JOB_NAMES> = {
  0: 'CRP', 1: 'BSM', 2: 'ARM', 3: 'GSM',
  4: 'LTW', 5: 'WVR', 6: 'ALC', 7: 'CUL',
}
```

### 0.5 建立 composable stub

**檔案**：`src/composables/useItemName.ts`（stub）

```typescript
import { computed, type ComputedRef, type MaybeRefOrGetter } from 'vue'
export function useItemName(_: MaybeRefOrGetter<number>): ComputedRef<string> {
  return computed(() => 'stub')
}
```

### 0.6 `.gitignore` + `package.json`

- 加 `.data-cache/` 到 `.gitignore`
- 加 `"build-game-data": "node scripts/build-game-data.mjs"` 到 scripts
- 加 devDep：`csv-parse`（不執行 `npm install`，待 Track A 接手）

### 0.7 DoD for Phase 0

- `npm run build` 能通過（stub 僅讓 type check 過，runtime 尚不能用）
- Commit：`chore(api-refactor): scaffold local-data-source contracts and stubs`

---

## Phase P：Parallel Tracks（**P0 完成後同時啟動**）

**Dispatch 原則**：每條 track 獨立檔案 / 獨立 test；不互相 import（除了 Phase 0 建立的 types）。每位 agent 讀 0.1 contracts 後即可實作自己的 scope。

### Track A ─ ETL Script + 首批資料

**Owner files**（獨佔）：
- `scripts/build-game-data.mjs`（新）
- `public/data/recipes.json`（新，產物）
- `public/data/rlt.json`（新，產物）
- `public/data/manifest.json`（新，產物）
- `public/data/items/{zh-TW,zh-CN,en,ja}.json`（新，產物）

**Spec**：
1. 接受 CLI flags：`--no-clone`（本地 debug）、`--verbose`
2. Clone / pull 到 `.data-cache/`：
   - `harukaxxxx/ffxiv-datamining-tw`（只需 `rawexd/Item.csv`，sparse checkout）
   - `thewakingsands/ffxiv-datamining-cn`（只需 `Item.csv`）
   - `xivapi/ffxiv-datamining`（只需 `csv/en/Item.csv`、`csv/ja/Item.csv`、`csv/en/Recipe.csv`、`csv/en/RecipeLevelTable.csv`）
3. CSV parser：`parseCsv(path, format: 'saintcoinach' | 'oxidizer')` → `{ headers, rows }`。欄位一律**依名取值**。用 `csv-parse` 搭配 `relax_column_count: true`。
4. **Recipe / RLT 抽取（en only）** → 輸出 `recipes.json`、`rlt.json`（符合 `RecipeRecord`、`RltRecord` schema）
5. **Items 抽取（4 語言）**：先掃 Recipe 收集白名單（~12k itemIds including ingredients + results），各語言依白名單輸出 tuple 陣列（符合 `ItemsFile`）
6. **Manifest 輸出**：含 `schemaVersion: 1`、各 locale 的 repo commit hash
7. **Sanity checks**（任一 fail 則 exit != 0）：
   - 每語言 items 數量差距 > 10% → fail
   - 每語言必含 item 5057 (Iron Ingot) → fail
   - 每 recipe 的 ingredient + result itemId 都能在 **en** items 中找到 → fail
   - TW items 若缺部分 → warning only
8. **D3**: 任何一步失敗整體 fail，不寫出 partial file（先寫到 tmp dir，全部成功才 move 到 `public/data/`）
9. CraftType mapping 用手抄 8 行（D6）

**Out**：`public/data/**` 完整產出，git commit。

**Test**：`scripts/build-game-data.test.mjs`（smoke：parser 能處理兩種格式的 fixture）。不 commit 實際資料到此 test（用小 fixture）。

---

### Track B ─ local-data-source 實作

**Owner files**（獨佔）：
- `src/services/local-data-source.ts`（替換 stub）
- `src/services/__tests__/local-data-source.test.ts`（新）

**Spec**：
1. 實作所有 Phase 0.2 的 stub（按 types 契約）
2. 每個 loader 為 module-level memoized Promise；items 依 locale 分 key：`Map<Locale, Promise<Map<number, ItemRecord>>>`
3. `loadItems(locale)`：fetch `/data/items/{locale}.json`，parse tuple → build `Map<number, ItemRecord>`
4. `getLocale()` / `setLocale()` / `onLocaleChange()`：實作簡易 pub-sub；`setLocale` 寫 localStorage + 觸發 listener
5. `getItem(id, locale?)`：active locale 找不到則 fallback `zh-TW`；仍無回 undefined
6. `getItemSync(id, locale?)`：若該 locale Map 尚未載入回 undefined（element 端顯示 placeholder）
7. `searchRecipesByName(query, locale?)`（D5）：
   - `query.normalize('NFKC').toLowerCase().trim()`；空字串回 `[]`
   - 掃 items：`startsWith` 優先、其次 `includes`
   - join recipes（`recipes.filter(r => r.itemResult === itemId)`）
   - Cap 50 回傳 `RecipeSearchResult[]`；多 recipe 者各別列項
8. `loadingState` 用 `reactive()`（from vue）供元件 watch
9. Manifest `schemaVersion !== 1` → throw

**Test**（D8 fixtures 尚未生，Track B 自製本 track 專用 mock）：
- Loader memoize：同一 locale 多次呼叫只 fetch 一次
- Locale 切換後 `getItem` 回對應語言
- Fallback：某 locale 缺 item 時回退 zh-TW
- `searchRecipesByName` 各 locale 正確命中；`startsWith` 排序驗證
- Manifest schemaVersion mismatch 直接 throw

---

### Track C ─ Locale Store + UI Switcher

**Owner files**（獨佔）：
- `src/stores/locale.ts`（替換 stub）
- `src/stores/__tests__/locale.test.ts`（新）
- `src/components/LocaleSwitcher.vue`（新）
- `src/views/SettingsView.vue`（插入 switcher）
- `src/main.ts`（初始化時序）

**Spec**：
1. `locale.ts`：
   - `current = ref<Locale>(initial)`，initial 從 localStorage `ffxiv-craft-helper:locale` 讀，無則 `DEFAULT_LOCALE`
   - `setLocale(locale)`：update ref → 寫 localStorage → 呼叫 `localDataSource.setLocale(locale)`（讓 data source listener 同步）
2. `main.ts`：Pinia register 後、`app.mount()` **之前** `useLocaleStore()` 完成同步初始化
3. `LocaleSwitcher.vue`：
   - Element Plus `el-select`，4 選項顯示各語言自稱：`繁體中文`、`简体中文`、`English`、`日本語`
   - 綁 `localeStore.current`，`@change` 呼 `localeStore.setLocale`
4. `SettingsView.vue`：找合適段落（例如 About 或設定頂部）插入 switcher

**Test**：
- localStorage 讀寫、預設值、反應式
- `setLocale` 呼叫後 localStorage 值正確

---

### Track D ─ 純工具 helper

**Owner files**（獨佔）：
- `src/utils/icon-url.ts`（替換 stub）
- `src/utils/__tests__/icon-url.test.ts`（新，smoke）
- `src/composables/useItemName.ts`（替換 stub）
- `src/composables/__tests__/useItemName.test.ts`（新）

**Spec**：
1. `icon-url.ts`：`getIconUrl(iconId)` 組 `https://xivapi-v2.xivcdn.com/i/{folder}/{iconId}_hr1.png`。先試 `hr1.png` 格式；如驗證失敗改用 xivapi v1 格式作為 fallback（實作者驗證 CDN 回傳後選一個 lock）
2. `useItemName.ts`：
   ```typescript
   export function useItemName(itemId: MaybeRefOrGetter<number>) {
     const locale = useLocaleStore()
     return computed(() => {
       locale.current  // tracked dep
       return getItemSync(toValue(itemId))?.name ?? `#${toValue(itemId)}`
     })
   }
   ```

**Test**：
- `getIconUrl(123)` 格式符合預期 pattern
- `useItemName` 切 locale 時 computed 重算（用 mock localDataSource）

---

### Track E ─ 測試 Fixtures

**Owner files**（獨佔）：
- `src/__tests__/fixtures/recipes-min.json`
- `src/__tests__/fixtures/items-zh-TW-min.json`
- `src/__tests__/fixtures/items-en-min.json`
- `src/__tests__/fixtures/items-zh-CN-min.json`
- `src/__tests__/fixtures/items-ja-min.json`
- `src/__tests__/fixtures/rlt-min.json`
- `src/__tests__/fixtures/manifest-min.json`
- `src/__tests__/fixtures/load.ts`

**Spec**：
1. Fixtures 含 3 筆 recipe（至少一個有嵌套 ingredient，一個不能 HQ，一個高 ilevel）；對應 ~10 個 item id
2. 4 語言 items 都含這 ~10 個 id，name 用該語言真實譯名（硬編即可，不 auto-generate）
3. Manifest `schemaVersion: 1`、固定 buildTime、sources fake hash
4. `load.ts`：export `setupLocalDataMocks(overrides?)` → 透過 `vi.mocked(globalThis.fetch).mockImplementation` 根據 URL path 回對應 fixture；export `resetLocalDataMocks()`
5. `load.ts` **不 import** production code，避免 cycle

**Test**：
- `load.ts` 自身 smoke test：`fetch('/data/recipes.json')` 回 fixture 內容

---

### Track F ─ CI / Workflows

**Owner files**（獨佔）：
- `.github/workflows/ci.yml`（改）
- `.github/workflows/update-game-data.yml`（新）

**Spec**：
1. `ci.yml`：test job 保留；新增 build job（parallel）：`npm ci` → `npm run build`。兩 job 均 `on: [push (main), pull_request]`
2. `update-game-data.yml`（D7）：
   - Trigger：`schedule` (cron 週日 UTC 02:00) + `workflow_dispatch`
   - Permissions: `contents: write`, `pull-requests: write`
   - Concurrency group `update-game-data`, `cancel-in-progress: false`
   - Steps：checkout → setup-node → npm ci → actions/cache restore `.data-cache` → `npm run build-game-data` → diff check → **if changed: `npm run test` + `npm run build`** → `peter-evans/create-pull-request@v7` 開 PR 到 `chore/update-game-data`，PR body 含 data sources 清單
   - PR body 備註：「Tests & build verified in workflow」
3. `deploy.yml`：不動

**Test**：無 unit test；在 verification phase 手動 dispatch 確認

---

### Track G ─ README / docs

**Owner files**（獨佔）：
- `README.md`

**Spec**：
- 移除「APIs」段落中 `tnze.yyyy.games`
- 新增「Data Sources」致謝三個 datamining repo（harukaxxxx、thewakingsands、xivapi）
- 新增「Supported Languages」：遊戲資料支援 zh-TW / zh-CN / en / ja；UI 維持繁中
- 新增「Data Update」：每週自動更新 + 手動 dispatch
- 新增版權聲明：`Final Fantasy XIV © SQUARE ENIX CO., LTD.`、`Non-commercial fan project. Not affiliated with or endorsed by Square Enix.`

---

## Phase I：Integration（**P 全部完成後 serial**）

**Dispatch 原則**：按順序一個接一個；每個 integration step 完成後 run `npm run test` 確保不破既有功能。

### I-1 ─ API 層改寫

**Depends on**：Track B 完成並 commit

**Files**：
- `src/api/xivapi.ts`（大幅改）：
  - 刪除 `API_BASE = 'https://tnze.yyyy.games/...'`
  - `searchRecipes(query)` → `localDataSource.searchRecipesByName(query, localeStore.current)`
  - `findRecipesByItemName(itemName, itemId)` → 用 `loadRecipes()` filter + `loadItems()` name match
  - `getRecipe(id)` → `loadRecipes() + loadRlt() + loadItems()` join 成舊 `Recipe` shape
  - **刪除** `fetchIcons`；callers 改用 `getIconUrl(iconId)`（Track D）
  - 保留 `XIVAPI_SHEET_BASE`、`fetchSheetFields`（給 garland.ts 用）
- `src/api/garland.ts`：
  - 刪除 `TNZE_BASE`
  - `resolveNodeDetails` 改從 `localDataSource.getItem(id, 'zh-TW')` 拿 name
  - `s2t` 對地名仍保留
- 保留既有 public signature，不 break call sites

**Verify**：`grep -r "tnze.yyyy.games\|yyyy.games" src/` 無結果

---

### I-2 ─ Store 與 Service refactor（快取去 name）

**Depends on**：I-1 + Track D（useItemName）

**Files**：
- `src/services/bom-calculator.ts`：`MaterialNode`、`FlatMaterial` 型別 `name` 欄位改 optional 並註 deprecated；`recipeCache`、`recipeByItemCache` 維持但 recipe 物件內 name 改讀時動態（或保留 name 欄位但 consumer 不用）
- `src/stores/bom.ts`：tree node 型別移除 `name`；若 persist 到 localStorage，需 migration（加 version 鍵）
- `src/stores/recipe.ts`：`Recipe` type 保留 name（API 回傳值，不直接渲染）；`Ingredient` 同
- `src/stores/batch.ts`：若有 cache recipe/item name，一併改 id-only

**Verify**：store unit test 全過；`searchRecipes → addTarget → expand BOM` 流程 manually（串接 dev server）正常

---

### I-3 ─ Component 綁 useItemName + v-loading

**Depends on**：I-2 + Track D（useItemName）+ Track B（loadingState）

**Files**：
- `src/components/recipe/RecipeSearch.vue`：
  - Input `@input` debounce 200ms（D5）
  - 結果 skeleton（D9）用 `el-skeleton`
  - 每列 name 用 `useItemName(result.itemId)`
- `src/components/recipe/RecipeDetail.vue`：name 全走 `useItemName`；外層 `v-loading="isRecipesLoading"`
- `src/components/batch/BatchRecipeCard.vue`：`target.recipe.name` → `useItemName(target.recipe.itemResult).value`
- `src/views/RecipeView.vue` / `BomView.vue` / `TimerView.vue`：主區 `v-loading`
- 其他 consume item/recipe name 的元件（由 agent 搜 `.name` 一一檢視）

**Verify**：手動切 locale，所有 item name 即時更新；首次載入 skeleton 出現

---

### I-4 ─ 既有測試遷移

**Depends on**：I-1、I-2、I-3、Track E

**Files**：
- `src/__tests__/api/xivapi-findRecipes.test.ts`：刪 tnze URL mock，改 `setupLocalDataMocks()` beforeEach
- `src/__tests__/api/garland.test.ts`：同上
- `src/__tests__/setup.ts`：若 global fetch mock 與 `setupLocalDataMocks` 衝突，調整優先級（fixture helper 覆蓋 global）
- `src/stores/__tests__/bom.test.ts`、`batch.test.ts` 等：若 assert item name，改 assert id 或用 fixture resolve

**Verify**：`npm run test` 全過

---

### I-5 ─ 首次資料 bootstrap

**Depends on**：Track A 已產 data；I-1 ~ I-4 完成

**Steps**：
1. 本地 `npm run build-game-data`（需網路）
2. `git add public/data/` 並 commit
3. `npm run build` 驗證可用 committed data 出 bundle
4. `npm run dev`，跑完 verification 清單（Phase V）

---

## Phase V：Verification（Definition of Done）

按序執行，全過才算完成：

1. `grep -r "tnze.yyyy.games\|yyyy.games\|fetchIcons" src/ scripts/` 無結果
2. `npm run build-game-data` 成功，產出 `manifest.json`、`recipes.json`、`rlt.json`、`items/{4}.json`；manifest `schemaVersion === 1`
3. `npm run build` 成功（純 committed data，**無需網路**）
4. `npm run test` 全過
5. `items/*.json` 單檔 raw < 2 MB；brotli 後 < 300 KB（用 `brotli -9` 測）
6. DevTools Network 只看到 `universalis.app`、`xivapi-v2.xivcdn.com`、`beta.xivapi.com`、`garlandtools.org`、自家 static
7. **搜尋**：輸入「鐵錠」/「Iron」/「アイアン」/「铁锭」各自 locale 下都命中 Iron Ingot (#5057)；結果 cap 50；起始匹配在前
8. **切語言**：4 語言輪切，BOM 樹展開後 name 即時更新（不 refetch；cache 用 id）
9. **refresh**：切 ja、reload，仍為 ja（localStorage 保留）
10. **回歸**：搜尋、配方詳情、BOM 展開、求解器、市場比價均與 tnze 版本行為對等
11. **Workflow**：push branch、手動 dispatch `update-game-data`；若無 diff 不開 PR；模擬 diff 時 test+build 通過、PR 開立
12. **Icon**：3 個不同 iconId 的 item CDN 回 200
13. **README**：Data Sources + 版權 + 語言說明齊備

---

## 檔案異動清單（對 subagent 分派用）

### 新建
```
scripts/build-game-data.mjs                              [Track A]
public/data/recipes.json                                 [Track A]
public/data/rlt.json                                     [Track A]
public/data/manifest.json                                [Track A]
public/data/items/{zh-TW,zh-CN,en,ja}.json               [Track A]
src/services/local-data-source.types.ts                  [Phase 0]
src/services/local-data-source.ts                        [P0 stub → Track B]
src/services/__tests__/local-data-source.test.ts         [Track B]
src/stores/locale.ts                                     [P0 stub → Track C]
src/stores/__tests__/locale.test.ts                      [Track C]
src/components/LocaleSwitcher.vue                        [Track C]
src/utils/icon-url.ts                                    [P0 stub → Track D]
src/utils/__tests__/icon-url.test.ts                     [Track D]
src/composables/useItemName.ts                           [P0 stub → Track D]
src/composables/__tests__/useItemName.test.ts            [Track D]
src/__tests__/fixtures/*.json                            [Track E]
src/__tests__/fixtures/load.ts                           [Track E]
.github/workflows/update-game-data.yml                   [Track F]
```

### 改寫（對應 integration phase）
```
src/utils/jobs.ts                                        [Phase 0 append]
src/api/xivapi.ts                                        [I-1]
src/api/garland.ts                                       [I-1]
src/services/bom-calculator.ts                           [I-2]
src/stores/{bom,recipe,batch}.ts                         [I-2]
src/components/recipe/{RecipeSearch,RecipeDetail}.vue    [I-3]
src/components/batch/BatchRecipeCard.vue                 [I-3]
src/views/{Recipe,Bom,Timer,Settings}View.vue            [I-3 / Track C]
src/main.ts                                              [Track C]
src/__tests__/api/{xivapi-findRecipes,garland}.test.ts   [I-4]
src/__tests__/setup.ts                                   [I-4, 若需要]
.github/workflows/ci.yml                                 [Track F]
package.json                                             [Phase 0]
.gitignore                                               [Phase 0]
README.md                                                [Track G]
```

### 不動
- `.github/workflows/deploy.yml`
- `src/utils/s2t.ts`
- solver / WASM 相關

---

## Parallel Execution 指南（for orchestrator）

**階段 dispatch**：

1. **Serial**：Phase 0 — 一位 agent 建 contracts/stubs → commit → push
2. **Parallel wave**：Track A、B、C、D、E、F、G 同時 dispatch（7 條 track 各自獨立檔案）
3. **Serial integration**：I-1 → I-2 → I-3 → I-4 → I-5
4. **Verification**：Phase V（人工為主，部分可 scripted）

**Dispatch 給 subagent 的必附資訊**：
- 本 plan 全文或對應 Track 段落
- Phase 0 的 contract 檔（types）
- 檔案 owner 清單（禁止跨 track 改檔）
- Branch 策略：共用 `feat/api_refactor`，每 track 在 feature sub-branch 完成後 rebase/merge；或各 track push commit 到同 branch（檔案不重疊故無 conflict）

**避免衝突**：
- Track 間**不 import** 對方未完成的實作；只 import Phase 0 types
- Integration phase 由單一 owner 做 serial 改，減少 merge 衝突

**Rollback**：每 track commit 獨立；若某 track fail，revert 該 commit 不影響其他

---

## 風險清單

| # | 風險 | 緩解 |
|---|---|---|
| R1 | Tuple schema 後續加欄位 breaking | `schemaVersion` + Manifest 驗證 throw |
| R2 | `xivapi-v2.xivcdn.com` icon URL 格式猜錯 | Track D 實作時先驗證第一張 icon |
| R3 | Recipe 來源改 en，TW 專屬修正遺失 | FFXIV Recipe 無在地化，風險 ≈ 0 |
| R4 | `useItemName` 在 virtual list mass 用有 overhead | 實測；必要時改一次性查詢 + locale watch |
| R5 | ETL CN 資料落後 patch | D3 all-or-nothing 反而會 block；若成實務問題再切回 partial |
| R6 | GitHub Actions workflow permissions 未設 | 部署前 owner 先到 Settings → Actions 開啟 write + PR 權限 |
| R7 | Pinia store rehydration 邏輯影響 persist | I-2 改 store 時若用 pinia-plugin-persistedstate 要加 version 鍵 migration |
| R8 | localStorage locale 讀取時序造成 first-render 閃爍 | Track C main.ts 同步初始化 locale store 在 mount 之前 |

---

## 關鍵檔案 reference（對既有 codebase）

讀取這些檔案了解 API signature / 既有 pattern：
- `src/api/xivapi.ts`（目前 tnze endpoint 呼叫、Recipe shape）
- `src/api/garland.ts`（node resolveNodeDetails、s2t 用法）
- `src/services/bom-calculator.ts`（recipeCache/recipeByItemCache）
- `src/stores/bom.ts` / `src/stores/recipe.ts` / `src/stores/batch.ts`
- `src/__tests__/setup.ts`（既有 global fetch mock）
- `src/__tests__/api/xivapi-findRecipes.test.ts`（既有 mock 策略）
- `src/utils/jobs.ts`（JOB_NAMES、API_JOB_NAMES 既有）
- `.github/workflows/ci.yml`、`deploy.yml`（既有 CI/CD）
