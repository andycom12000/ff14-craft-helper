# 批量製作 - 計算設定手機版重設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把批量製作頁的「計算設定」區塊在 ≤640px 手機版改用扁平 cell + 模擬器風 accordion，露出常用設定、進階設定收合，食物/藥水格式統一。

**Architecture:** 在 `BatchSettings.vue` 內用 `useIsMobile()` 切兩條 template 分支 — 桌面分支保持不動（沿用既有 `el-card` + `settings-row`）、新增 mobile 分支實作新設計。所有改動限於 `BatchSettings.vue` 一個檔案，不動 store、不動 props/events。

**Tech Stack:** Vue 3 `<script setup lang="ts">`, Element Plus（`el-switch` / `el-segmented` / `el-select` / `el-input-number`），`@/composables/useMediaQuery`，scoped CSS，CSS vars（`--app-border` / `--app-text-muted` / `--app-craft` / `--app-text` / `--app-fill-light`）。

**Verification:** 此專案目前不對 view component 寫單元測試。驗證採用 `npx vue-tsc --noEmit` 型別檢查 + 開發伺服器在 375px viewport 下肉眼比對 spec mockup（用 Chrome DevTools MCP 自動截圖）。

---

## File Structure

**Modify:**
- `src/components/batch/BatchSettings.vue` — 主要改動：加 mobile 分支、新增 ref / computed、新增 scoped CSS

**Read-only references（用來抄樣式 / pattern）：**
- `src/views/SimulatorView.vue` 990-1130 行 — `.m-setup-row` / `.m-setup-body` / `.m-setup-group` / `.m-chev` / `.m-rs-dot` 樣式
- `src/views/GearsetView.vue` — `useIsMobile()` 切分支寫法
- `src/composables/useMediaQuery.ts` — `useIsMobile` 匯出位置
- `src/stores/batch.ts` 126-129 行 — `foodId / foodIsHq / medicineId / medicineIsHq` 結構

**Out of scope:**
- `src/views/BatchView.vue` 中為 BatchSettings 設計的 mobile flatten CSS（`.batch-section :deep(.el-card)` 等）— 在 Task 5 確認新版面後決定是否需要清理

---

## Task 1: Scaffolding — mobile/desktop 分支與共用狀態

**Files:**
- Modify: `src/components/batch/BatchSettings.vue`

把現有 template 整段放進 `v-if="!isMobile"` 桌面分支，並建立空的 `v-else` mobile 分支骨架。同時新增本 task 後續會用到的 `ref` 與 `computed`。

- [ ] **Step 1: 引入 `useIsMobile` 與宣告 `advancedOpen`**

修改 `BatchSettings.vue` 的 `<script setup>` 區塊，在 import 區塊加入：

```ts
import { ref, computed } from 'vue'
import { useIsMobile } from '@/composables/useMediaQuery'
```

並在現有的 `const settings = useSettingsStore()` 與 `const batch = useBatchStore()` 之後加入：

```ts
const isMobile = useIsMobile()

// Advanced section accordion state (mobile-only, not persisted across mounts)
const advancedOpen = ref(false)
```

- [ ] **Step 2: 新增 mobile 摘要文字 computed**

在 `advancedOpen` 之後加入用於 accordion 收合時顯示摘要的 computed：

```ts
import { COMMON_FOODS, COMMON_MEDICINES } from '@/engine/food-medicine'

// 進階設定的食藥摘要：依目前 foodId / medicineId 決定文字內容
const buffSummary = computed(() => {
  const foodName = batch.foodId
    ? COMMON_FOODS.find(f => f.id === batch.foodId)?.name.replace(' HQ', '') ?? null
    : null
  const medName = batch.medicineId
    ? COMMON_MEDICINES.find(m => m.id === batch.medicineId)?.name.replace(' HQ', '') ?? null
    : null
  if (!foodName && !medName) return { text: '未設定', muted: true }
  if (foodName && medName) return { text: '已設定', muted: false }
  return { text: foodName ?? medName ?? '已設定', muted: false }
})
```

> 註：`COMMON_FOODS` / `COMMON_MEDICINES` 已經在原檔 import；如果你看到原檔 import line 已經存在，**不要重複 import**，只是把 `computed` 加上。

- [ ] **Step 3: 包整段現有 template 為桌面分支**

打開 `BatchSettings.vue` template 區塊，把現有的 `<el-card shadow="never" class="settings-card">` 整段（含 `<template #header>` 與 `<div class="settings-stack">`）外面包一層 `<template v-if="!isMobile">`，並在 `</el-card>` 之後加 `</template>` 結束。

範例（注意只是包外層，內部一個字都不動）：

```vue
<template>
  <template v-if="!isMobile">
    <el-card shadow="never" class="settings-card">
      <!-- 既有內容原封不動 -->
    </el-card>
  </template>
  <template v-else>
    <!-- mobile 版面 — Task 2/3/4 會逐步填入 -->
  </template>
</template>
```

- [ ] **Step 4: 跑型別檢查**

Run: `npx vue-tsc --noEmit`
Expected: 無錯誤（如果原本就有不相關的型別錯誤，列出但不要修；只要這次新加的程式碼沒新增錯誤即可）。

- [ ] **Step 5: Commit**

```bash
git add src/components/batch/BatchSettings.vue
git commit -m "refactor(batch/settings): scaffold mobile/desktop branches"
```

---

## Task 2: Mobile 露出區 — 模式 chip + 3 個雙行 cell

**Files:**
- Modify: `src/components/batch/BatchSettings.vue`

在 mobile 分支裡放入：(1) 既有的 `ModeChip`，(2) 三個 cell（遞迴查價 / 跨服採購 / 例外策略）。

- [ ] **Step 1: 把 mobile 版面樣板填入 cell**

把 Task 1 留空的 `<template v-else>` 裡填入：

```vue
<template v-else>
  <div class="m-settings">
    <div class="m-mode-row">
      <ModeChip :model-value="batch.calcMode" @change="batch.setCalcMode" />
      <p class="m-mode-hint">
        {{ batch.calcMode === 'macro' ? '會計算巨集與 HQ 需求' : '直接列出採購清單，不跑巨集' }}
      </p>
    </div>

    <div class="m-cell">
      <span class="m-cell-icon" aria-hidden="true">🔄</span>
      <div class="m-cell-body">
        <div class="m-cell-title">遞迴查價</div>
        <div class="m-cell-sub">把素材的素材也納入採購</div>
      </div>
      <el-switch v-model="settings.recursivePricing" size="default" />
    </div>

    <div class="m-cell">
      <span class="m-cell-icon" aria-hidden="true">🌐</span>
      <div class="m-cell-body">
        <div class="m-cell-title">跨服採購</div>
        <div class="m-cell-sub">{{ settings.dataCenter }} 全跨服比價</div>
      </div>
      <el-switch v-model="settings.crossServer" size="default" />
    </div>

    <div class="m-cell m-cell--last">
      <span class="m-cell-icon" aria-hidden="true">⚠️</span>
      <div class="m-cell-body">
        <div class="m-cell-title">例外策略</div>
        <div class="m-cell-sub">等級不足/無法雙滿時</div>
      </div>
      <el-segmented
        v-model="settings.exceptionStrategy"
        :options="[
          { label: '跳過', value: 'skip' },
          { label: '購買', value: 'buy' },
        ]"
        size="small"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 2: 加入 mobile cell 的 scoped CSS**

把以下 CSS 區塊加到既有 `<style scoped>` 區塊**最末尾**（不要刪除任何既有 CSS）：

```css
/* === Mobile (≤640px) === */
.m-settings {
  display: flex;
  flex-direction: column;
}

.m-mode-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 0 14px;
}

.m-mode-hint {
  margin: 0;
  font-size: 12px;
  color: var(--app-text-muted);
}

.m-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--app-border);
}

.m-cell--last {
  border-bottom: none;
}

.m-cell-icon {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.m-cell-body {
  flex: 1;
  min-width: 0;
}

.m-cell-title {
  font-size: 13.5px;
  color: var(--app-text);
}

.m-cell-sub {
  font-size: 11px;
  color: var(--app-text-muted);
  margin-top: 2px;
}
```

- [ ] **Step 3: 啟動 dev server 並用 Chrome DevTools MCP 確認 mobile 版面**

Run: `npm run dev`（背景執行）

開瀏覽器到 `http://localhost:5173/batch`、resize 至 375×800、檢查：

- 模式 chip 顯示在最上方、下方有 hint 文字
- 三個 cell 由上至下：🔄 遞迴查價 / 🌐 跨服採購 / ⚠️ 例外策略
- 每個 cell 雙行（標題 + 副說明）、右側為 switch 或 segmented
- 跨服採購副說明顯示 `{currentDataCenter} 全跨服比價`
- 最後一個 cell（例外策略）下方無底線

如果項目看起來和 spec mockup 一致，繼續；如果有偏差，先修 CSS。

- [ ] **Step 4: Commit**

```bash
git add src/components/batch/BatchSettings.vue
git commit -m "feat(batch/settings): add mobile top-level cells (recursive/cross-server/exception)"
```

---

## Task 3: Mobile 進階設定 accordion button row

**Files:**
- Modify: `src/components/batch/BatchSettings.vue`

加入「進階設定」收合 button row（仿模擬器 `.m-setup-row` 樣式）。本 task 只做 button row 與展開狀態切換，accordion 內容（form-rows）放到 Task 4。

- [ ] **Step 1: 在 mobile template 末尾加入 accordion button**

在 Task 2 加入的 `</div>`（關閉 `.m-settings` 那個）**之前**，加上 accordion 的 button row 與空 body 容器：

```vue
    <button
      type="button"
      class="m-adv-row"
      :aria-expanded="advancedOpen"
      @click="advancedOpen = !advancedOpen"
    >
      <span class="m-adv-summary">
        進階設定
        <span class="m-adv-dot">·</span>
        遞迴 <b>{{ settings.maxRecursionDepth }}</b> 次
        <span class="m-adv-dot">·</span>
        食藥 <span :class="{ muted: buffSummary.muted }">{{ buffSummary.text }}</span>
      </span>
      <span class="m-adv-chev" :class="{ 'is-open': advancedOpen }" aria-hidden="true">▾</span>
    </button>

    <div v-if="advancedOpen" class="m-adv-body">
      <!-- Task 4 會填入 form-rows -->
    </div>
```

- [ ] **Step 2: 在 scoped CSS 末尾加入 accordion 樣式**

接續 Task 2 的 mobile CSS 區塊，加上：

```css
.m-adv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 2px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  font: inherit;
  cursor: pointer;
  text-align: left;
}

.m-adv-summary {
  font-size: 13px;
  color: var(--app-text-muted);
}

.m-adv-summary b {
  color: var(--app-text);
  font-weight: 600;
}

.m-adv-summary .muted {
  color: var(--app-text-muted);
  opacity: 0.7;
}

.m-adv-dot {
  color: var(--app-text-muted);
  opacity: 0.5;
  margin: 0 5px;
}

.m-adv-chev {
  color: var(--app-text-muted);
  font-size: 12px;
  transition: transform 0.18s var(--ease-out-quart, ease-out);
}

.m-adv-chev.is-open {
  transform: rotate(180deg);
  color: var(--app-craft);
}

.m-adv-body {
  padding: 8px 2px 16px;
  border-bottom: 1px solid var(--app-border);
}
```

- [ ] **Step 3: 在瀏覽器驗證 button row 行為**

resize 至 375×800：

- 在三個 cell 下方應出現一條 button：`進階設定 · 遞迴 3 次 · 食藥 未設定 ▾`
- 數字 / 「已設定」應該以稍亮色顯示（`<b>`）、「未設定」應為 muted
- 點擊 button 後 chevron 應旋轉 180°（顏色變 `--app-craft`）
- 再次點擊收合
- 切到桌面寬度（≥641px）應該完全看不到 mobile 樣式

- [ ] **Step 4: Commit**

```bash
git add src/components/batch/BatchSettings.vue
git commit -m "feat(batch/settings): add mobile advanced accordion button row"
```

---

## Task 4: Mobile 進階設定內容 — 遞迴次數 / 自動評估食藥 / 食物 / 藥水

**Files:**
- Modify: `src/components/batch/BatchSettings.vue`

把進階設定內容填入 Task 3 留空的 `.m-adv-body`：兩個 sub-group（遞迴設定 / 食藥），中間虛線分隔。

- [ ] **Step 1: 在 `.m-adv-body` 內加入兩個 sub-group**

把 Task 3 的 `<div v-if="advancedOpen" class="m-adv-body">` 內容改寫為：

```vue
<div v-if="advancedOpen" class="m-adv-body">
  <div class="m-adv-group">
    <h4 class="m-adv-group-title">遞迴設定</h4>
    <div class="m-form-row">
      <span class="m-form-label">遞迴次數</span>
      <el-input-number
        v-model="settings.maxRecursionDepth"
        :min="1"
        :max="10"
        size="small"
        :disabled="!settings.recursivePricing"
        aria-label="遞迴查價最大深度"
      />
    </div>
  </div>

  <div class="m-adv-group">
    <h4 class="m-adv-group-title">食藥</h4>
    <div class="m-form-row">
      <span class="m-form-label">自動評估食藥</span>
      <el-switch
        v-model="batch.autoEvaluateBuffs"
        size="default"
        aria-label="自動評估食藥"
      />
    </div>
    <div class="m-form-row">
      <span class="m-form-label">食物</span>
      <div class="m-form-control">
        <el-select
          v-model="batch.foodId"
          placeholder="未選擇"
          clearable
          size="small"
          class="m-buff-select"
        >
          <el-option
            v-for="food in COMMON_FOODS"
            :key="food.id"
            :label="food.name.replace(' HQ', '')"
            :value="food.id"
          />
        </el-select>
        <el-segmented
          v-model="batch.foodIsHq"
          :options="[
            { label: 'HQ', value: true },
            { label: 'NQ', value: false },
          ]"
          :disabled="!batch.foodId"
          size="small"
          class="m-hq-seg"
        />
      </div>
    </div>
    <div class="m-form-row">
      <span class="m-form-label">藥水</span>
      <div class="m-form-control">
        <el-select
          v-model="batch.medicineId"
          placeholder="未選擇"
          clearable
          size="small"
          class="m-buff-select"
        >
          <el-option
            v-for="med in COMMON_MEDICINES"
            :key="med.id"
            :label="med.name.replace(' HQ', '')"
            :value="med.id"
          />
        </el-select>
        <el-segmented
          v-model="batch.medicineIsHq"
          :options="[
            { label: 'HQ', value: true },
            { label: 'NQ', value: false },
          ]"
          :disabled="!batch.medicineId"
          size="small"
          class="m-hq-seg"
        />
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 在 scoped CSS 末尾加入 sub-group 與 form-row 樣式**

```css
.m-adv-group + .m-adv-group {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px dashed var(--app-border);
}

.m-adv-group-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text);
}

.m-form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 0;
}

.m-form-row + .m-form-row {
  border-top: 1px solid var(--app-border);
}

.m-form-label {
  font-size: 12.5px;
  color: var(--app-text);
  flex-shrink: 0;
}

.m-form-control {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.m-buff-select {
  width: 150px;
}

.m-hq-seg {
  flex-shrink: 0;
}

/* el-segmented disabled 視覺：保留位置但變灰 */
.m-hq-seg.is-disabled {
  opacity: 0.45;
  pointer-events: none;
}
```

> 註：Element Plus 的 `el-segmented` 在 `:disabled="true"` 時會自動加 `is-disabled` class，上面 CSS 加強視覺。如果 EP 版本沒有自動加，把 selector 改成 `.m-hq-seg[aria-disabled="true"]` 或在 template 加 `:class="{ 'is-disabled': !batch.foodId }"`。

- [ ] **Step 3: 在瀏覽器驗證展開後內容**

dev server 仍在跑、resize 375×800、點擊「進階設定」展開：

- 出現「遞迴設定」標題、其下「遞迴次數」row 含 stepper（−數字+）
  - 當「遞迴查價」開關關閉時，stepper 應為 disabled
- 虛線分隔
- 「食藥」標題、其下三個 row：
  - 自動評估食藥（switch）
  - 食物（select 寬 150px + HQ/NQ segmented）
  - 藥水（select 寬 150px + HQ/NQ segmented）
- 食物未選時，HQ/NQ segmented 顯示為灰階；選了之後變正常
- 藥水同上
- 食物、藥水兩 row 結構完全對齊

- [ ] **Step 4: Commit**

```bash
git add src/components/batch/BatchSettings.vue
git commit -m "feat(batch/settings): mobile advanced body — recursion + food/medicine"
```

---

## Task 5: 清理與整合驗收

**Files:**
- Modify: `src/components/batch/BatchSettings.vue`（如需）
- Read: `src/views/BatchView.vue`（檢查是否需要清掉舊的 mobile flatten CSS）

- [ ] **Step 1: 跑型別檢查**

Run: `npx vue-tsc --noEmit`
Expected: 無新錯誤。

- [ ] **Step 2: 檢查 BatchView 的 mobile flatten CSS 是否還有作用**

`src/views/BatchView.vue` 的 580-609 行有針對 `.batch-section :deep(.el-card)` 的扁平化 CSS（背景透明、無邊線、padding 0）。新 mobile 分支不再渲染 `el-card`，這些 selector 在 BatchSettings 上已無作用。

- 若這些 selector **僅**為 BatchSettings 設計：刪除以保持乾淨
- 若還有其他 batch 子元件用到 `el-card`（例如 BatchList）：保留

執行確認：

Run: `Grep "el-card" src/components/batch/`

如果只有 BatchSettings 用到（且現在已經改掉），把 BatchView.vue 580-609 行那組 `.batch-section :deep(.el-card)` 規則刪掉；否則保留。

- [ ] **Step 3: 完整 mobile 流程肉眼驗收**

dev server `http://localhost:5173/batch`、375×800：

- 模式 chip 切換正常
- 三個 cell 行為：
  - 遞迴查價：開關正常、與進階區的「遞迴次數」disabled 連動正確
  - 跨服採購：開關正常、副說明顯示目前 DC
  - 例外策略：[跳過|購買] 切換正常
- 進階設定收合：摘要文字隨 maxRecursionDepth 與 foodId/medicineId 正確更新
- 進階設定展開：兩個 sub-group、虛線分隔、所有控件功能正常
- 食物 / 藥水 select 開啟、選擇、清除（clearable）正常
- HQ/NQ segmented 在無選擇時 disabled、有選擇時可切換
- 切到 ≥641px 桌面寬度，UI 應該完全恢復為原本 `el-card` 樣式（沒有殘留 mobile 樣式洩漏）

- [ ] **Step 4: 截圖留底（給 spec/changelog 用）**

用 Chrome DevTools MCP 在 375×800 viewport 截圖兩張：

- 收合狀態（advancedOpen=false）
- 展開狀態（advancedOpen=true，foodId 有值）

存到 `.superpowers/brainstorm/356421-1777113822/content/` 內或 commit message 引用即可（不需要提交到 repo）。

- [ ] **Step 5: Final commit（如有 BatchView.vue 清理）**

```bash
git add src/components/batch/BatchSettings.vue src/views/BatchView.vue
git commit -m "refactor(batch): drop unused mobile el-card flatten rules in BatchView"
```

如果 Task 5 沒做任何修改（沒清理 BatchView），略過此 commit。

---

## Self-Review

### Spec coverage
- ✅ 整體結構（模式 chip + 3 cell + advanced accordion）→ Task 2/3
- ✅ 露出區 cell 樣式（icon + 雙行 + 右控件）→ Task 2 step 1/2
- ✅ 跨服採購副說明動態顯示 DC → Task 2 step 1（spec 兩種選項中採用「動態 DC」版本）
- ✅ 進階設定 accordion 仿模擬器樣式 → Task 3 步驟 2 CSS 對應 SimulatorView 990-1130 行
- ✅ 摘要顯示「進階設定 · 遞迴 N 次 · 食藥 已設定/未設定」→ Task 1 step 2 + Task 3 step 1
- ✅ 遞迴設定 / 食藥 兩個 sub-group + 虛線分隔 → Task 4 step 1/2
- ✅ 食物、藥水 row 完全對齊（select 150px + HQ/NQ segmented）→ Task 4 step 1/2
- ✅ HQ/NQ 未選時 disabled 灰階 → Task 4 step 2 CSS
- ✅ 桌面版完全不動 → Task 1 step 3 把整段 wrap 在 `v-if="!isMobile"`
- ✅ 範圍限於 BatchSettings.vue → 所有 task 都只動這個檔（Task 5 step 5 是 optional 清理）
- ✅ 不持久化 advancedOpen → Task 1 step 1 用 `ref` + comment 標明

### Placeholder scan
- 沒有 TBD / TODO / 「實作後續細節」
- 所有 step 都有實際程式碼或實際指令
- Task 5 step 5 是 conditional commit，已標明條件

### Type consistency
- `buffSummary` returns `{ text, muted }`、Task 3 step 1 中 `buffSummary.muted` / `buffSummary.text` 一致
- `advancedOpen: ref<boolean>`、所有引用一致
- `el-segmented` 的 v-model 對 `foodIsHq`/`medicineIsHq` 是 `boolean`，options 用 `value: true/false`，型別一致
- `settings.exceptionStrategy` 在桌面分支用 `el-radio-group`（既有），mobile 改用 `el-segmented` — 兩者 v-model 都接 `string`，無 schema 變更
