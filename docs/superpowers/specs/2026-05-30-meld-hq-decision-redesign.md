# 鑲嵌 / HQ 決策區重構（Meld / HQ Decision Redesign）

- 日期：2026-05-30
- 合併取代：#111（HQ×鑲嵌收斂）、#112（套用改 override）、#114（simulator 卡能力導向 + 去殼）
- 相關：#113（batch 無效 CTA bug，維持獨立先 ship，slice A 不重做 showApply）
- 設計依據：`DESIGN.md`（吐司工坊設計系統）、`.impeccable/critique/2026-05-28...meldadvisorcard.md`

## 1. Feature Summary

simulator 求解後「怎麼達成 HQ」目前散成三個互不知道的並列 section（初期品質 / 最佳手法·HQ 推薦 / 鑲嵌建議），且共用的 `MeldAdvisorCard` 同時被 simulator（應為能力導向）與 batch（成本導向）使用、卻只有一套成本框架，並有巢狀卡 + 標題重複的視覺問題。本案把這三塊收斂成單一「如何保證 HQ」決策區，並把套用行為從「永久覆寫配裝」改為 session-only 暫時 override。

## 2. 核心模型：兩根槓桿的 cascade

品質與進度本質是同一件事 —— 都是「CP 與耐久度如何分配」的預算問題。因此「怎麼保證 HQ」不是兩個獨立缺口、也不是並列「擇一」，而是**有順序的兩根槓桿**：

1. **HQ 素材**（效能需求較小，優先評估）：補開場品質（`initialQuality`），減輕 rotation 需要生成的品質，等於騰出 CP/耐久預算。
2. **鑲嵌**（殘差槓桿）：只在「**補滿 HQ 素材後仍做不到**」時評估，補的是 max-HQ 之後的剩餘缺口。

### 引擎觸點（關鍵行為變更）

meld 建議的 baseline 必須改為「**max HQ 素材後的 `initialQuality`**」，而非目前畫面上的 `initialQuality`。亦即：先以「HQ 素材補到上限」推算 meld 殘差，使鑲嵌只負責 HQ 素材無法消化的部分。這是成本最小化的正確順序（先用零裝備成本的 HQ 素材槓桿，再動付費的鑲嵌槓桿）。

判定流程：
- 以 **max HQ 素材** 求解：能 double-max（progress + quality 雙保證）→ **HQ 素材即可達標，鑲嵌路徑隱藏**。
- 否則 → 計算「max HQ 素材之上」所需的鑲嵌殘差，顯示鑲嵌步驟。

## 3. Design Direction

- 色彩策略：Full palette（沿用站台）。meld/HQ 決策區屬 **Crafting zone → 強調色用 Cocoa（`oklch(0.50 0.16 40)`）**，非 Market 草莓醬。Toast Gold 僅用於主要 CTA / focus（≤10%）。成功狀態用 Verdant Success 綠。
- 字體：四軌分工；數字（gil、品質差）一律 Fira Code。
- 形狀：去殼 —— 遵守 `DESIGN.md`「Nested cards are always wrong / Don't stack identical cards in a grid」與 impeccable critique P1。flat-until-touched（唯讀區無 resting shadow）。
- 反禁區：不用 SaaS hero-metric 模板；中文不套 uppercase（impeccable P3）。

## 4. Slices

本案切成三條垂直切片，A 為地基，B/C 建在其上。

### Slice A — 卡片去殼 + `mode` 地基（keystone）

**行為**
- `MeldAdvisorCard` 移除自帶 header 與外框/背景/圓角，成為可內嵌段落；外層 section 提供單一框 + 單一標題。
- 新增 props：
  - `mode: 'ability' | 'cost'` — 決定框架（simulator 能力導向 / batch 成本導向）。
  - `showApply: boolean`（預設配合 mode；batch 關閉）— 控制「套用」CTA 是否渲染；關閉時不得有任何路徑 emit `apply`。
- simulator 傳 `mode='ability'`；batch 傳 `mode='cost'` + `showApply=false`。

**吸收 #113**：batch 不再顯示無效的「套用到配裝」CTA（由 `showApply=false` 達成）。若 #113 已先獨立 ship，slice A 沿用其 `showApply`、不重做。

**驗收**
- [ ] simulator / batch 的鑲嵌區皆為單一外框 + 單一標題，無 box-in-box、無重複「鑲嵌建議」標題。
- [ ] batch per-job 鑲嵌卡不渲染「套用到配裝」CTA，且不 emit `apply`。
- [ ] simulator 鑲嵌區仍可套用（行為由 Slice C 定義）。
- [ ] `npm test` 全綠。

### Slice B — 能力導向 + HQ 收斂（吸收 #111 + #114 文案）

**行為**
- 將「初期品質 / 最佳手法·HQ 推薦 / 鑲嵌建議」三個並列 section 收斂為**單一「如何保證 HQ」cascade section**（simulator 端；2-col 與 rail 版面皆套用）。
- **Step 1 — 備齊 HQ 素材**：原樣嵌入既有 `CraftRecommendation` 元件（保留其推薦明細與「套用到初期品質」動作），不重新設計。
- **Step 2 — 再補鑲嵌（僅在 max HQ 素材仍不足時顯示）**：
  - 能力句為主角（Cocoa 色、最大字重），**直接寫所需魔晶石**，例：「補 8 顆 加工魔晶石Ⅻ 即可保證 HQ」；需多種魔晶石時列多行（「補 8 顆 加工魔晶石Ⅻ、2 顆 CP魔晶石Ⅻ…」）。
  - **不顯示原始數值 delta（如 +389）**。
  - 成本為小字：「所需鑲嵌費用 約 X gil」（`X` 為達標所需的最省解費用；**不是**「你能省」框架）。
  - 動作只留「套用鑲嵌（模擬）」（**移除「複製清單」**）。
- **情境：HQ 素材即可達標** → 顯示成功提示（Verdant Success 綠）「只要備齊 HQ 素材即可保證 HQ，無需鑲嵌」，**鑲嵌段整個隱藏**（非淡化）。
- **移除 BiS / over-meld 上限參照**：因 `BIS_REFERENCE` gearset 無法維護（audit F5 / #102），ability 模式不再顯示「全 BiS pentameld」對照。

**內容/文案**
- 區標題：「如何保證 HQ」。
- 缺價 / 市場不可用 / canHq:false 等既有狀態沿用現行處理（不在本切片擴張）。

**驗收**
- [ ] simulator 端三個 HQ 相關區塊收斂為單一決策區，含 Step 1 / Step 2 的順序呈現。
- [ ] Step 1 嵌入既有 CraftRecommendation（含套用到初期品質）。
- [ ] Step 2 以魔晶石顆數陳述、無原始數值 delta、成本為「所需費用」小字、僅「套用鑲嵌（模擬）」一個動作。
- [ ] max HQ 素材即可達標時，鑲嵌段隱藏並顯示成功提示。
- [ ] 介面無任何 BiS / over-meld 上限參照。
- [ ] meld 殘差以 max-HQ baseline 計算（見 §2 引擎觸點）。

### Slice C — 套用改 session-only override（吸收 #112）

**行為**
- 「套用鑲嵌（模擬）」改為**寫入 session-only 的暫時鑲嵌 override（Δ 作業/加工/CP）**，**不**呼叫 `gearsetsStore.updateGearset`、不落地 localStorage。
- 疊加層順序：`裸裝(base) + 鑲嵌 override` → 食藥 buff% → 最終能力值。整合作法：把 base 解析上提到 `useSimulator`，`FoodMedicine` 改吃 `base` prop（成為純 buff 套用層），override 加在 base 之上、buff 之前。
- 食藥區「基礎能力值」上方顯示**可移除 chip**：「模擬鑲嵌：8 顆 加工魔晶石Ⅻ」（購物導向措辭，與卡片一致）；✕ 即移除；換配方 / reset 自動還原。
- **「存成配裝…」逆生門**：明確動作才永久寫入；按下後詢問範圍「只存此職業 / 套用到全部職業（共用 gear）」。

**驗收**
- [ ] 套用鑲嵌不再寫 gearsets store、不落地 localStorage；換配方 / reset 後還原。
- [ ] override 疊在裸裝與食藥 buff 之間，最終能力值正確（base+meld 後再套 buff%）。
- [ ] 食藥區出現可移除 chip，移除後能力值還原。
- [ ] 「存成配裝」提供「此職 / 全部職業」範圍選擇，確認後才永久寫入。
- [ ] `npm test` 全綠。

## 5. batch（框架不變）

batch 維持成本導向（`mode='cost'`），per-job 卡無「套用到單一配裝」語意（`showApply=false`）。本案不改 batch 的成本呈現。

## 6. Out of Scope

- 不擴張缺價 / 市場不可用 / canHq:false 等既有狀態的處理邏輯。
- 不做 Playwright e2e（#115，獨立）。
- 不動 batch 成本框架的內容。
- 不改求解器本身；§2 的 baseline 調整限於「meld 建議以 max-HQ initialQuality 推算」。

## 7. Open Questions（實作時解決）

- Step 2 多魔晶石的排序與截斷（顆數多時的呈現上限）。
- 「存成配裝」範圍選擇的 UI 形式（dialog vs inline 二選一）—— 依 `DESIGN.md`「Don't use modals as a first thought」優先 inline / 確認列。
- 移除 BiS 後，`meld-advisor` service 的 `bis` / `gapGil` 計算是否一併移除，或僅 UI 不顯示（傾向移除以去維護負債，實作時確認無其他消費者）。
