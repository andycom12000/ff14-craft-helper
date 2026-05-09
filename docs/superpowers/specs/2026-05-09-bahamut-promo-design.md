---
name: 巴哈推廣文設計 — 一鍵搞定整批製作
description: 為「吐司工坊·FFXIV 製作助手」撰寫巴哈姆特 FF14 哈拉版推廣文的設計規格；主張為一鍵整合批量製作流程，目標讀者為每天準備籌備任務的玩家與想要更方便模擬器的玩家。
status: spec
---

# 巴哈姆特 FFXIV 哈拉版推廣文 — 設計

## 1. 目標與讀者

**目的**：在巴哈 FF14 哈拉版發布一篇推廣文，把吐司工坊推進每天有製作需求的玩家視野，引導點擊主站。

**主要讀者**：
- 每天準備籌備任務（cooking buff、potion、消耗品）的生產職玩家
- 想要更方便、流程更短的模擬器使用者

**次要讀者**：仍在用舊式工具但被「跨多分頁」流程拖累的工匠。

## 2. 主張（umbrella claim）

「**一鍵搞定整批製作**」— 把規劃 + 跨伺服比價 + 採購建議 + 料理藥水 buff 推薦 + 最佳手法求解 + macro 匯出**串成一個流程**，使用者不用跳第二個分頁。

「一鍵」是 umbrella claim：從遊戲截圖 OCR 匯入 → macro 拿走，全程在批量製作頁面內完成。

## 3. 文章結構（線性故事弧）

採「線性故事弧」開場 — 不數列「你是不是」、不點名競品、用敘事描述拉人。中等篇幅，目標 ~1000 字、含 4 張截圖。

### §0 頂部 CTA（1 行 + 1 句）
品牌連結 + 一句話主張，就走。

### §1 開場痛點（~120 字 / 3-4 句）
中性描述場景：打開製作清單、開瀏覽器查價、開模擬器跑 macro、回遊戲對 NPC、發現少算了一個 buff。**不直接點名其他工具**，只描述「跨多分頁」這個共通痛點。最後一句轉折：「這套流程其實可以一次做完。」

### §2 揭曉（~150 字）
一段話定義吐司工坊的批量製作頁能做什麼：規劃 + 比價 + 採購建議 + 料理推薦 + macro 一次串完。明確告訴讀者「一鍵」的範圍是從 OCR 匯入到 macro 拿走。

### §3 四步 walkthrough（4 張圖 × 各 ~150 字）
按使用者操作順序：

1. **OCR 匯入**（圖 1）：把遊戲內籌備清單截圖貼進來 → 自動讀出要做什麼、要做幾個。
2. **跨伺服比價 / 採購建議**（圖 2）：自動跑「自製還是買划算」、「哪個伺服器便宜」。
3. **最佳手法 / Macro 匯出**（圖 3）：每個配方都自動算 rotation，整批 macro 一次帶走。
4. **批量主畫面**（圖 4）：上手後的全貌 — 清單 + 採購 + 料理推薦 + macro 同一頁。

### §4 結尾收束（~80 字）
一句烘焙比喻收（品牌語言頭尾點綴規則），低調點一下「個人專案、免費、開放原始碼」。

### §5 致謝 + repo + 底部 CTA（~80 字）
主站 / GitHub / 依賴致謝三行（Raphael-rs、XIVAPI、Universalis、Garland Tools、社群 datamining 維護者）。

## 4. 標題、頭部與底部 CTA

### 4.1 標題
```
《工具》一鍵搞定整批製作｜吐司工坊 FFXIV 製作助手
```

### 4.2 頂部 CTA
```
[url=https://andycom12000.github.io/ff14-craft-helper/][b]吐司工坊·FFXIV 製作助手[/b][/url]
一頁搞定批量製作、材料清單、跨伺服比價與 macro 匯出。
```

### 4.3 底部 CTA
```
主站：https://andycom12000.github.io/ff14-craft-helper/
GitHub：https://github.com/andycom12000/ff14-craft-helper

依賴這些計畫才能走到這一步：Raphael-rs (solver 核心)、XIVAPI (物品圖示)、Universalis (市場價)、Garland Tools (採集)、社群 datamining 維護者。
```

## 5. 截圖計畫

**來源**：本機 dev server（`npm run dev`）。

**示範資料**：使用者會提供一張遊戲內籌備清單截圖，作為 OCR 起點，後續流程從這張截圖延伸出整輪 walkthrough（同一份清單貫穿 4 張圖，讀者能感受到「同一個資料一路被處理到 macro」的連貫性）。

**4 張圖（按 §3 的順序）**：

| # | 畫面 | 路由 / 狀態 | 重點構圖 |
|---|------|------------|----------|
| 1 | OCR 匯入完成 | 批量製作頁，OCR dialog 剛關掉、清單載入完 | 顯示「我從截圖讀出來這幾個配方 × 幾個」的瞬間 |
| 2 | 跨伺服比價 / 採購建議 | 批量製作頁，採購建議區展開 | 顯示「自製 vs 採購」、「跨伺服比價」表格 |
| 3 | Macro 匯出 | 批量製作頁，某個配方的 macro 區展開（或整批 macro 介面） | 顯示 rotation 結果 + 一鍵複製 macro 區塊 |
| 4 | 批量主畫面全貌 | 批量製作頁，scroll 到適合截全的位置 | 一張包含清單 + 採購 + 料理推薦 + macro 的全景 |

**Viewport**：1440×900（Dashboard / 批量頁設計鎖定的 wide 解析度）。

**檔案存放**：`.tmp/screenshots/promo/promo-1-ocr.png`、`promo-2-market.png`、`promo-3-macro.png`、`promo-4-overview.png`。BBCode 中以 `[img]` 引用使用者最終上傳到巴哈圖床後的網址（先以 `{{IMG_OCR}}` 等 placeholder 寫，最後一步替換）。

## 6. 品牌語言調校

依 PRODUCT.md「溫暖 / 親切 / 輕鬆 + 手藝人自豪」與 DESIGN.md「The Morning Bakery」北極星，但**頭尾點綴、中段守實用**：

- 頂部 CTA、§4 結尾可以出現一次烘焙比喻（如「想烤一爐料理就來吐司工坊看看」）
- §1–§3 中段全部用實用語言，不出現吐司、麵包、果醬罐
- 不歪詞、不誇飾、不行銷套語（「最強 / 唯一 / 革命性」一律不出現）

## 7. 三條不要

1. **不點名競品**：tnze、beherw 都不出現。共通痛點以「跨多分頁、手動算量、查市場」描述即可。
2. **不數列式勾選**：不寫「你是不是也曾經...」清單，採敘事描述。
3. **不釣魚**：不誇大、不裝謙、不結尾求按讚分享。一句邀請就收。

## 8. 工作流程

1. 使用者提供遊戲內籌備清單截圖
2. 開 dev server（`npm run dev`）
3. 用 Chrome DevTools MCP 走完整流程（OCR 匯入 → 比價 → macro → 全景），按 §5 表格在 4 個關鍵節點截圖
4. 撰寫 BBCode 正文到 `docs/promo/2026-05-09-bahamut-promo.bbcode`，圖片位置先放 placeholder
5. 使用者把截圖上傳到巴哈圖床、把 placeholder 替換為實際 URL
6. 使用者實際在巴哈版貼文發布

## 9. 輸出

- **設計文件**：本檔
- **BBCode 正文**：`docs/promo/2026-05-09-bahamut-promo.bbcode`
- **截圖**：`.tmp/screenshots/promo/*.png`（不進 git）

## 10. BBCode Styling 系統

DESIGN.md 的 OKLCH token 在 BBCode 環境必須轉成 hex。此處的 hex 只用於 Bahamut 貼文，**不進 source CSS**（DESIGN.md 的「No-Hex Rule」只規範前端原始碼）。

### 10.1 顏色 token（hex 對照）

| 用途 | DESIGN.md token | OKLCH | BBCode hex |
|------|----------------|-------|-----------|
| 段落小標、品牌強調、頂部 CTA 主連結 | toast-gold | `oklch(0.65 0.18 65)` | `#b8762a` |
| 低強度文字（致謝、image caption、引述） | ink-muted | `oklch(0.50 0.03 60)` | `#7a6651` |

**只用這兩色**。其他 jam-jar 色（cocoa / strawberry / matcha）在「適中型 styling」下不出現，避免推廣文視覺超載。

### 10.2 文字 hierarchy

| 元素 | BBCode |
|------|--------|
| 段落小標（Step 1、Step 2…） | `[size=4][b][color=#b8762a]Step 1．標題文字[/b][/color][/size]` |
| 副小標（§ 揭曉、§ 結尾） | `[size=4][b]標題文字[/b][/size]`（不上色） |
| 正文 | 預設（不動） |
| 正文重點詞 | `[b]關鍵字[/b]`（粗體，不上色） |
| 低強度文字 | `[size=2][color=#7a6651]...[/color][/size]` |

**禁止**：`[size=5]` 以上、`[size=1]`、自定字體 `[font=...]`、`[i]` 全文使用、底線（會跟連結混淆）、純 `[color=#000]`/`[color=#fff]`、漸層或 outline。

### 10.3 連結 styling

- **頂部 CTA 主連結**：品牌名包在 `[b]` 內，由 `[url]` 自帶連結色與底線
  ```
  [url=https://...][b]吐司工坊·FFXIV 製作助手[/b][/url]
  ```
- **底部 URL**：純 URL，巴哈會自動轉連結（不另加 `[url]`）
- **內文順帶連結**（致謝那行的 Raphael-rs 等）：`[url=...]Raphael-rs[/url]`，不加粗、不上色

### 10.4 圖片 styling

- 全部包 `[center][img]...[/img][/center]`，配合巴哈內文寬度置中
- 每張圖**下面緊跟一行 caption**（`[size=2][color=#7a6651]圖說文字[/color][/size]`），協助讀者對應段落內容
- 圖片之間**保留一個空行**，文字段落之間維持自然行距，**不**插入 `[hr]` 或裝飾線

### 10.5 段落間距與排版

- 段落間用一個空行分隔（不要兩個以上 — 巴哈會讀成多空行造成段落散）
- 段落小標與其下方第一段正文之間：一個空行
- §3 walkthrough 的四段之間：一個空行 + 段落小標即可，不另加分隔線
- 全文**不使用** `[center]` 包正文（只用於圖片），保留巴哈左對齊閱讀體驗

### 10.6 Quick reference template（每個 walkthrough 段落）

```bbcode
[size=4][b][color=#b8762a]Step N．段落小標[/b][/color][/size]

正文兩到三句，[b]關鍵詞[/b]用粗體，但不上色。最後一句最好是動詞（「點下匯入」「往下捲」），讓讀者感覺自然往下讀。

[center][img]{{IMG_PLACEHOLDER}}[/img]
[size=2][color=#7a6651]圖說一句話：這張圖在示範什麼[/color][/size][/center]
```
