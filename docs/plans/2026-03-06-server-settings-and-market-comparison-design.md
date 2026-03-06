# 伺服器設定與跨服比價設計

日期：2026-03-06

## 背景

目前 settings store 硬編碼為日本伺服器（Tonberry / Elemental），沒有 UI 讓使用者選擇伺服器。價格只顯示 NQ 最低價，且無法跨伺服器比較。繁中服（台灣）的資料中心為「陸行鳥」，包含 8 個伺服器：伊弗利特、迦樓羅、利維坦、鳳凰、奧汀、巴哈姆特、拉姆、泰坦。

## 需求

1. 獨立設定頁面，讓使用者選擇所在伺服器
2. 材料清單內嵌跨服比價（同 DC 所有伺服器並排）
3. 獨立市場查價頁面
4. 預設使用繁中服伺服器
5. 價格偏好設定（NQ/HQ/取較低者）

## 設計

### 1. Settings Store 擴充

```ts
// stores/settings.ts
const server = ref('巴哈姆特')
const dataCenter = ref('陸行鳥')
const region = ref('繁中服')
const priceDisplayMode = ref<'nq' | 'hq' | 'minOf'>('nq')
```

所有值透過 pinia-plugin-persistedstate 存入 localStorage。

### 2. 設定頁面 (SettingsView.vue)

路由：`/settings`

內容：
- **伺服器選擇**：三層級聯選擇
  1. Region（繁中服 / 日本 / 北美 / 歐洲…）
  2. Data Center（繁中服只有「陸行鳥」）
  3. Server（8 個伺服器）
- **價格偏好**：Radio group
  - NQ 最低價（預設）
  - HQ 最低價
  - NQ/HQ 取較低者

資料來源：Universalis `GET /data-centers` + `GET /worlds` API，應用啟動時快取一次。

### 3. 材料清單內嵌比價 (BomSummary 擴充)

- 表格主列：根據 `priceDisplayMode` 顯示對應價格（而非固定 NQ）
- 每列新增展開功能（el-table expand row）
- 展開後顯示同 DC 下所有伺服器的價格比較子表格：

| 伺服器 | NQ 最低 | HQ 最低 | 更新時間 |
|--------|---------|---------|----------|
| 巴哈姆特 | 500 | 800 | 2 分鐘前 |
| 伊弗利特 | 450 | 750 | 5 分鐘前 |

- 使用者所在伺服器高亮，最便宜的伺服器標綠
- 展開時按需載入（lazy），呼叫 `GET /陸行鳥/{itemId}`
- Universalis 回傳的 listings 包含 `worldName`，前端按 world 分組

### 4. 獨立市場查價頁面 (MarketView.vue)

路由：`/market`

功能：
1. **物品搜尋** — 用現有 XIVAPI 搜尋物品
2. **跨服價格表** — 用 DC 名稱查詢 Universalis，顯示各伺服器 NQ/HQ 最低價、平均價，最便宜伺服器高亮
3. **當前掛牌列表** — 顯示 listings 明細（價格、數量、HQ/NQ、伺服器、上傳時間）

### 5. API 層擴充

```ts
// api/universalis.ts 新增
export function getMarketDataByDC(
  dcName: string,
  itemId: number
): Promise<MarketData>
```

### 6. 側邊欄導航更新

```
配裝管理
配方選擇
製作模擬
材料清單
市場查價  ← 新增
─────────
設定      ← 新增（底部，分隔線隔開）
```

### 7. 價格顯示邏輯

BomSummary 中的 `getUnitPrice` 根據 `priceDisplayMode` 切換：
- `nq`：`minPriceNQ`
- `hq`：`minPriceHQ`
- `minOf`：`Math.min(minPriceNQ, minPriceHQ)`（排除 0）

totalCost 計算同樣遵循此設定。

## 技術細節

- Universalis API 支援用 DC 名稱作為 server 參數查詢，回傳結果包含所有伺服器的 listings
- 繁中服 DC 名稱：`陸行鳥`，region：`繁中服`
- 繁中服 world IDs：4028-4035
- API rate limit：無官方限制，但應合理快取避免濫用
