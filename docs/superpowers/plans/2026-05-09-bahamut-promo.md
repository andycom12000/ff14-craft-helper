# 巴哈推廣文 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 製作一篇可直接貼上巴哈姆特 FF14 哈拉版的 BBCode 推廣文，主打「一鍵搞定整批製作」流程，含 4 張本機 dev server 截圖。

**Architecture:** 線性故事弧（痛點 → 揭曉 → 4 步 walkthrough → 結尾 → 致謝），中等篇幅 ~1000 字，BBCode 適中型 styling（吐司金 `#b8762a` + 墨棕 `#7a6651` 兩色，size=4 段落小標）。截圖透過 Chrome DevTools MCP 從本機 dev server 抓，使用者提供一張遊戲內籌備清單截圖作為 OCR 起點，整輪 walkthrough 由同一份資料貫穿。

**Tech Stack:** BBCode（純文字輸出）/ Vite dev server / Chrome DevTools MCP / 既有批量製作頁（`/batch` route）/ 既有 OCR pipeline。

**Spec:** `docs/superpowers/specs/2026-05-09-bahamut-promo-design.md`

---

## 檔案結構

| 路徑 | 用途 |
|------|------|
| `docs/promo/2026-05-09-bahamut-promo.bbcode` | 最終 BBCode 正文（**會 commit**） |
| `.tmp/screenshots/promo/source-game-screenshot.png` | 使用者提供的遊戲內籌備清單原圖（不進 git） |
| `.tmp/screenshots/promo/promo-1-ocr.png` | OCR 匯入完成後的批量頁 |
| `.tmp/screenshots/promo/promo-2-market.png` | 採購建議 / 跨伺服比價區 |
| `.tmp/screenshots/promo/promo-3-macro.png` | Macro 匯出區 |
| `.tmp/screenshots/promo/promo-4-overview.png` | 批量主畫面全貌 |

**規範**：所有 `.tmp/` 檔案不進 git；BBCode 正文中圖片以 `{{IMG_OCR}}` / `{{IMG_MARKET}}` / `{{IMG_MACRO}}` / `{{IMG_OVERVIEW}}` 占位，由使用者上傳到巴哈圖床後手動替換為實際 URL。

---

## Task 1: 環境準備

**Files:**
- Create: `docs/promo/` (directory)
- Create: `.tmp/screenshots/promo/` (directory)

- [ ] **Step 1: 建立輸出資料夾**

```bash
mkdir -p docs/promo .tmp/screenshots/promo
```

- [ ] **Step 2: 確認 dev server 可啟動**

```bash
npm run dev
```

預期：terminal 印出 `Local: http://localhost:5173/ff14-craft-helper/`（或自動分配的 port），無編譯錯誤。打開 `http://localhost:5173/ff14-craft-helper/batch` 應顯示批量製作頁的空狀態（清單尚未載入）。

啟動後**保持 dev server 在背景執行**直到 Task 5 結束。

- [ ] **Step 3: 暫停，等待使用者提供遊戲截圖**

請使用者：
1. 在遊戲內截一張籌備清單畫面（例如製作手帳的「籌備中項目」、料理藥水清單、或工作組需求清單）
2. 把檔案放到 `.tmp/screenshots/promo/source-game-screenshot.png`
3. 在 chat 回覆「截圖好了」

**這一步是阻塞步驟，不要繼續往下跑**。沒有遊戲截圖就跑不出 OCR 流程的真實 demo。

---

## Task 2: 拍 promo-1-ocr.png（OCR 匯入完成）

**Files:**
- Capture: `.tmp/screenshots/promo/promo-1-ocr.png`

- [ ] **Step 1: 用 Chrome DevTools MCP 開啟批量頁**

導航到 `http://localhost:5173/ff14-craft-helper/batch`，viewport 設 1440×900：

```
mcp__chrome-devtools-mcp__resize_page (width: 1440, height: 900)
mcp__chrome-devtools-mcp__navigate_page (url: http://localhost:5173/ff14-craft-helper/batch)
mcp__chrome-devtools-mcp__wait_for (text: "批量製作")
```

- [ ] **Step 2: 觸發 OCR 匯入流程**

在批量頁找「OCR 匯入」按鈕（依設計可能標示為「從截圖匯入」、「OCR」、相機 icon 等），點下打開 dialog，把 `.tmp/screenshots/promo/source-game-screenshot.png` 上傳進去：

```
mcp__chrome-devtools-mcp__take_snapshot   # 找 OCR 按鈕的 uid
mcp__chrome-devtools-mcp__click (uid: ...)
mcp__chrome-devtools-mcp__take_snapshot   # 找上傳元件的 uid
mcp__chrome-devtools-mcp__upload_file (uid: ..., filePath: <絕對路徑> .tmp/screenshots/promo/source-game-screenshot.png)
```

等 OCR 跑完（Tesseract 在前端跑、可能要幾秒），dialog 顯示讀出的配方名稱與數量。確認 / 套用 / 關閉 dialog 讓清單載入到批量頁。

- [ ] **Step 3: 截圖**

dialog 關掉後，等清單渲染完，截整個 viewport：

```
mcp__chrome-devtools-mcp__take_screenshot (filePath: .tmp/screenshots/promo/promo-1-ocr.png, fullPage: false)
```

**驗收**：圖中要看見批量頁的清單區，至少一個由 OCR 讀出的配方項目顯示在清單中。如果 OCR 讀出來名稱有誤，這代表 OCR 對使用者那張截圖識別不佳 — 仍以結果為主截圖（推廣文也要誠實），不要手動修配方名稱。

---

## Task 3: 拍 promo-2-market.png（採購建議 / 跨伺服比價）

**Files:**
- Capture: `.tmp/screenshots/promo/promo-2-market.png`

- [ ] **Step 1: 確保比價資料已載入**

承接 Task 2 的 dev server 狀態（批量頁、清單已載入）。批量頁應自動觸發 Universalis 跨伺服比價（如果伺服器設定為空，可能要在 settings 裡先選一個 World，然後回到批量頁等資料拉完）。

如果 settings 還沒設 World：
```
mcp__chrome-devtools-mcp__navigate_page (url: http://localhost:5173/ff14-craft-helper/settings)
# 找 server / world selector，選一個有資料的伺服器（建議：Tonberry / Anima / Carbuncle 任一個 JP 伺服器資料量大）
mcp__chrome-devtools-mcp__navigate_page (url: http://localhost:5173/ff14-craft-helper/batch)
mcp__chrome-devtools-mcp__wait_for (text: "採購")  # 或畫面上顯示比價的關鍵字
```

- [ ] **Step 2: 捲到採購建議區**

```
mcp__chrome-devtools-mcp__evaluate_script (function: "() => { document.querySelector('[data-testid=\"procurement\"], .procurement-section, .market-comparison')?.scrollIntoView({block: 'start'}); }")
```

如果上面 selector 沒中（沒有 data-testid），改用 `take_snapshot` 找到採購區的 element，再 scroll into view。

- [ ] **Step 3: 截圖**

```
mcp__chrome-devtools-mcp__take_screenshot (filePath: .tmp/screenshots/promo/promo-2-market.png, fullPage: false)
```

**驗收**：圖中要清楚看見「自製 vs 採購」決策、跨伺服價格欄位、與至少一個材料的價格資訊。

---

## Task 4: 拍 promo-3-macro.png（Macro 匯出）

**Files:**
- Capture: `.tmp/screenshots/promo/promo-3-macro.png`

- [ ] **Step 1: 觸發某個配方的 macro 求解**

承接同一頁。批量頁可能有兩種 macro 介面：
- (A) 每個配方旁有「求解」按鈕，點下後跳出 macro 文字
- (B) 整批一起在同一個 macro 區塊顯示

先用 `take_snapshot` 找出實際 UI 架構：

```
mcp__chrome-devtools-mcp__take_snapshot
```

找到 macro / 求解 / rotation 相關的 button uid，點下：
```
mcp__chrome-devtools-mcp__click (uid: ...)
mcp__chrome-devtools-mcp__wait_for (text: "/ac" 或 "macro")  # solver 跑完通常會顯示 /ac 開頭的指令
```

Solver 第一次跑會花 5-30 秒（多執行緒 WASM）。耐心等。

- [ ] **Step 2: 把 macro 區捲到視窗中央**

```
mcp__chrome-devtools-mcp__evaluate_script (function: "() => { document.querySelector('.macro-output, [data-testid=\"macro\"], pre')?.scrollIntoView({block: 'center'}); }")
```

- [ ] **Step 3: 截圖**

```
mcp__chrome-devtools-mcp__take_screenshot (filePath: .tmp/screenshots/promo/promo-3-macro.png, fullPage: false)
```

**驗收**：圖中要看見以 `/ac` 開頭的 macro 指令文字，且最好有「複製」或「匯出」按鈕在旁邊（佐證「一鍵帶走」的賣點）。

---

## Task 5: 拍 promo-4-overview.png（批量主畫面全貌）

**Files:**
- Capture: `.tmp/screenshots/promo/promo-4-overview.png`

- [ ] **Step 1: 捲到能看到清單 + 採購 + macro 的位置**

理想構圖是一張圖能帶到三個區塊。如果整頁太長無法塞進 1440×900，採 `fullPage: true` 截整頁。

先 take_snapshot 看頁面總高度：
```
mcp__chrome-devtools-mcp__take_snapshot
mcp__chrome-devtools-mcp__evaluate_script (function: "() => document.documentElement.scrollHeight")
```

- [ ] **Step 2: 視情況選 viewport 截或 fullPage 截**

如果 scrollHeight ≤ 1800：捲到 top，take_screenshot fullPage=false 抓 1440×900 看頭半段；
如果 scrollHeight > 1800：take_screenshot fullPage=true 抓整頁，貼文時讓巴哈讀者用滑鼠滾。

```
mcp__chrome-devtools-mcp__evaluate_script (function: "() => window.scrollTo(0, 0)")
mcp__chrome-devtools-mcp__take_screenshot (filePath: .tmp/screenshots/promo/promo-4-overview.png, fullPage: true)
```

**驗收**：圖中至少要包含「清單區 + 採購區 + macro 區」其中兩個 + 批量頁的 H1 / 主要操作區，給讀者「全貌」感受。

- [ ] **Step 3: 停掉 dev server**

回到啟動 dev server 的 terminal，按 Ctrl+C 結束。

---

## Task 6: 撰寫 BBCode 正文

**Files:**
- Create: `docs/promo/2026-05-09-bahamut-promo.bbcode`

- [ ] **Step 1: 寫整篇 BBCode 到指定檔案**

寫入以下完整內容到 `docs/promo/2026-05-09-bahamut-promo.bbcode`（**完整 BBCode、不縮減、不省略**）：

```bbcode
[url=https://andycom12000.github.io/ff14-craft-helper/][b]吐司工坊·FFXIV 製作助手[/b][/url]
一頁搞定批量製作、材料清單、跨伺服比價與 macro 匯出。


打開製作手帳抄下今天要交的籌備清單，再開瀏覽器查料理 buff 哪個划算、再開模擬器一個一個跑 macro，最後切回遊戲對著 NPC 才發現少算了一個藥水。生產職的一輪 routine，常常不是輸在手速，而是輸在跨來跨去的分頁。

這套流程其實可以一次做完。


[size=4][b]從一張遊戲截圖到一整套 macro[/b][/size]

吐司工坊主打的「批量製作」頁面，把規劃、跨伺服比價、自製 vs 採購建議、料理藥水推薦、最佳手法求解、macro 匯出，整合在同一個畫面上。一次給它一張籌備清單，它一次把要做什麼、買什麼、用什麼 buff、按什麼鍵全部排好。

接下來四步示範完整流程：


[size=4][b][color=#b8762a]Step 1．丟一張遊戲截圖進來[/color][/b][/size]

打開批量製作頁面，點「OCR 匯入」，把你在製作手帳或籌備任務面板看到的清單[b]整張截圖直接貼進來[/b]。系統會自動讀出每個配方的名字與數量，省去手動一個一個搜尋的時間。

[center][img]{{IMG_OCR}}[/img]
[size=2][color=#7a6651]OCR 匯入：截圖丟進來，配方名稱與數量自動帶入清單[/color][/size][/center]


[size=4][b][color=#b8762a]Step 2．自製還是採購，一眼看出來[/color][/b][/size]

清單載入後，批量製作頁會自動到 [b]Universalis[/b] 拉每個材料的跨伺服市場價，跟 NPC 商店價比較，告訴你這個材料自製比較划算還是直接買划算，以及如果要買、哪個伺服器最便宜。整理 shopping list 不用再開 Excel 或第三方比價站。

[center][img]{{IMG_MARKET}}[/img]
[size=2][color=#7a6651]每個材料都附「自製 / 採購」建議與跨伺服比價[/color][/size][/center]


[size=4][b][color=#b8762a]Step 3．每個配方的 macro 一次帶走[/color][/b][/size]

清單上每個配方都會自動跑 [b]Raphael-rs solver[/b]（多執行緒 WASM）算出最佳手法 rotation，並產出可以直接貼進遊戲的 macro 文字。整批配方的 macro 一次複製、貼好幾段宏，然後就能進遊戲開做了。不用再為了一個配方開模擬器跑半天。

[center][img]{{IMG_MACRO}}[/img]
[size=2][color=#7a6651]每個配方一個 macro 區塊，按一下複製就能貼進遊戲[/color][/size][/center]


[size=4][b][color=#b8762a]Step 4．清單、採購、buff、macro，同一頁[/color][/b][/size]

走完前三步，整個批量製作頁就是你今天的工作中心：上方是配方清單與料理藥水推薦，中間是材料表與採購建議，下方是 macro 區。從打開到開做，[b]不必再切換分頁[/b]，所有資訊就在同一畫面。

[center][img]{{IMG_OVERVIEW}}[/img]
[size=2][color=#7a6651]上手後的批量製作頁全貌：規劃、採購、buff、macro 同一頁[/color][/size][/center]


如果你也每天在跑籌備、覺得跨多分頁是個煩人的成本，歡迎來吐司工坊烤一爐看看。個人專案、免費、原始碼開放，有問題或建議都歡迎到 GitHub 提 issue。


主站：https://andycom12000.github.io/ff14-craft-helper/
GitHub：https://github.com/andycom12000/ff14-craft-helper

[size=2][color=#7a6651]依賴這些計畫才能走到這一步：[url=https://github.com/KonaeAkira/raphael-rs]Raphael-rs[/url] (solver 核心)、[url=https://beta.xivapi.com]XIVAPI[/url] (物品圖示)、[url=https://universalis.app]Universalis[/url] (市場價)、[url=https://garlandtools.org]Garland Tools[/url] (採集)、社群 datamining 維護者。[/color][/size]
```

寫入指令（用 Write tool）：路徑 `docs/promo/2026-05-09-bahamut-promo.bbcode`，content 為上面整段 BBCode（**含**前後沒有的 markdown code fence）。

- [ ] **Step 2: 字元數驗證**

```bash
wc -m docs/promo/2026-05-09-bahamut-promo.bbcode
```

預期：在 1500–2200 字元之間（含 BBCode tags + 中文）。**純文字內容（去掉所有 tags）目標 ~1000 字**。可選驗證：

```bash
sed -E 's/\[[^]]+\]//g' docs/promo/2026-05-09-bahamut-promo.bbcode | wc -m
```

預期：~900–1100 字元。如果遠低於 800 表示文案被吃掉某段；如果超過 1300 表示中段太囉嗦。

- [ ] **Step 3: 不要 commit，往下進 Task 7**

---

## Task 7: 自審 BBCode 正文

**Files:**
- Verify: `docs/promo/2026-05-09-bahamut-promo.bbcode`

- [ ] **Step 1: Tag balance 檢查**

```bash
grep -oE '\[/?[a-z]+(=[^]]+)?\]' docs/promo/2026-05-09-bahamut-promo.bbcode | sort | uniq -c
```

預期：每個 opening tag（`[b]`、`[size=4]`、`[color=#b8762a]`、`[center]`、`[url=...]`、`[img]`）數量 = 對應 closing tag（`[/b]`、`[/size]`、`[/color]`、`[/center]`、`[/url]`、`[/img]`）數量。如果不對等，往回找漏掉的 closing。

- [ ] **Step 2: Placeholder 確認**

```bash
grep -nE 'IMG_(OCR|MARKET|MACRO|OVERVIEW)' docs/promo/2026-05-09-bahamut-promo.bbcode
```

預期：剛好 4 個命中（每張圖各一個 `{{IMG_*}}` placeholder）。

- [ ] **Step 3: Spec § 7「三條不要」逐條核對**

逐條翻 spec §7：
1. 不點名競品 — `grep -i 'tnze\|beherw' docs/promo/2026-05-09-bahamut-promo.bbcode` 應為**空**
2. 不數列式勾選 — 不應出現「你是不是」、「☑」、「□」、條列符號 `•` `‧` 在 §1 開場
3. 不釣魚 — 不應出現「按讚」、「分享」、「留言」、「最強」、「唯一」、「革命性」、「神器」

如果有命中，回到 Task 6 修文案，再回來重跑 Task 7。

- [ ] **Step 4: Spec § 10 styling 規則核對**

`grep -nE 'size=[156789]|size=10' docs/promo/2026-05-09-bahamut-promo.bbcode` 應為**空**（spec 禁止 size=5+ 與 size=1）。
`grep -nE '\[i\]|\[font=' docs/promo/2026-05-09-bahamut-promo.bbcode` 應為**空**。
`grep -nE 'color=#[0-9a-f]+' docs/promo/2026-05-09-bahamut-promo.bbcode | grep -v 'b8762a\|7a6651'` 應為**空**（只允許 toast-gold 與 ink-muted 兩色）。

如果有命中，回 Task 6 修。

- [ ] **Step 5: 連結 sanity check**

```bash
grep -oE 'https?://[^[:space:]]+' docs/promo/2026-05-09-bahamut-promo.bbcode | sort -u
```

預期 URL（**全部都要在**）：
- `https://andycom12000.github.io/ff14-craft-helper/`（頂部 + 底部各一次，共兩次）
- `https://github.com/andycom12000/ff14-craft-helper`（底部一次）
- `https://github.com/KonaeAkira/raphael-rs`
- `https://beta.xivapi.com`
- `https://universalis.app`
- `https://garlandtools.org`

如果少了某個，回 Task 6 補。

---

## Task 8: Commit BBCode 正文

**Files:**
- Add: `docs/promo/2026-05-09-bahamut-promo.bbcode`

- [ ] **Step 1: 確認 git status**

```bash
git status
```

預期只有一個 untracked file：`docs/promo/2026-05-09-bahamut-promo.bbcode`。截圖在 `.tmp/` 不應出現在 status。

- [ ] **Step 2: Commit**

```bash
git add docs/promo/2026-05-09-bahamut-promo.bbcode
git commit -m "$(cat <<'EOF'
docs(promo): add bahamut FF14 promo article (BBCode draft)

Implements the design spec at docs/superpowers/specs/2026-05-09-bahamut-promo-design.md.
Image placeholders are kept as {{IMG_*}} tokens; user replaces them with
Bahamut image-host URLs at posting time.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: 確認 commit 完成**

```bash
git log -1 --stat
```

預期：HEAD 是新 commit、`docs/promo/2026-05-09-bahamut-promo.bbcode` 列在 stat 中。

---

## Task 9: 交付給使用者

不寫 code，只是 hand-off checklist。**不要自動執行任何 push / tag**（CLAUDE.md 禁止）。

- [ ] **Step 1: 列出產出**

回報以下清單給使用者：

1. BBCode 草稿：`docs/promo/2026-05-09-bahamut-promo.bbcode`
2. 4 張截圖：`.tmp/screenshots/promo/promo-{1..4}-*.png`
3. Source 截圖：`.tmp/screenshots/promo/source-game-screenshot.png`
4. Spec：`docs/superpowers/specs/2026-05-09-bahamut-promo-design.md`（已 commit）

- [ ] **Step 2: 提醒使用者剩餘步驟**

告訴使用者：
1. 開啟 4 張 promo 截圖預覽，自己過目一遍 — 有不滿意的可以回頭改文案或重拍
2. 把 4 張截圖上傳到巴哈圖床（或 imgur）
3. 用上傳後的 URL 取代 BBCode 中的 `{{IMG_OCR}}` / `{{IMG_MARKET}}` / `{{IMG_MACRO}}` / `{{IMG_OVERVIEW}}`
4. 巴哈姆特 FF14 哈拉版開新討論串、貼上 BBCode、預覽、發文

- [ ] **Step 3: 詢問是否需要其他協助**

例如：要不要也產一份**繁中精簡版**給 Discord / Twitter / 小屋？要不要加英文版？是否需要把 source-game-screenshot.png 模糊掉敏感資訊（角色名 / 伺服器名）？

---

## 自審 — Plan 對 Spec 的覆蓋

| Spec 段落 | 對應 Task |
|----------|----------|
| §1 目標與讀者 | Plan 整體目標已對齊 |
| §2 主張（umbrella claim） | Task 6 BBCode 內文 §2 揭曉段 |
| §3.0 頂部 CTA | Task 6 第一段 |
| §3.1 開場痛點 | Task 6 第二段 |
| §3.2 揭曉 | Task 6 「從一張遊戲截圖到一整套 macro」段 |
| §3.3 四步 walkthrough | Task 6 Step 1–4 段；截圖在 Task 2–5 |
| §3.4 結尾收束 | Task 6「如果你也每天在跑籌備…」段 |
| §3.5 致謝 + repo + 底部 CTA | Task 6 最末三行 + 致謝小字 |
| §4 標題（巴哈版發文標題）| **由使用者貼文時手動設定**（Task 9 Step 2 已提醒）|
| §4.2/4.3 頂部 / 底部 CTA | Task 6 first / last 段 |
| §5 截圖計畫 | Task 2–5 |
| §6 品牌語言調校 | Task 7 Step 3 自審；Task 6 文案已遵循 |
| §7 三條不要 | Task 7 Step 3 grep 驗證 |
| §8 工作流程 | Task 1–9 結構即此流程 |
| §9 輸出 | Task 6（BBCode）/ Task 2–5（截圖）/ Spec 已 commit |
| §10 BBCode styling | Task 7 Step 4 grep 驗證；Task 6 文案已套用 |

**沒有覆蓋的項目**：標題（《工具》一鍵搞定整批製作｜吐司工坊 FFXIV 製作助手）由使用者在巴哈發文時填入「主題」欄，不在 BBCode 內文。Task 9 Step 2 已提醒。
