---
title: Toast Workshop Rebrand
date: 2026-04-26
status: approved
---

# 吐司工坊 Rebrand · Design Spec

## Goal

將 FF14 Craft Helper 重塑為「吐司工坊（Toast Workshop）」品牌：

- 用情緒性品牌名取代純功能描述名
- 從 dark navy/purple 轉向 light + 多色烘焙感的活潑氛圍
- 與 anti-references（tnze、FFXIV_Market 皆為 dark）建立明確視覺差異化

## Why

- 現有名稱純功能描述，無記憶點與情緒
- 既有 `PRODUCT.md` 的 brand personality（溫暖／親切／輕鬆）在 dark theme 下被冷色相弱化
- Light + 活潑 直接對應目標 personality，並與同類工具明顯區隔

## Brand Structure

主副品牌並陳：

```
吐司工坊
FFXIV 製作助手
```

- **主名「吐司工坊」**：Noto Serif TC 900，1.5px letter-spacing
- **副線「FFXIV 製作助手」**：Noto Sans TC 500，10px，全大寫間距感
- 副線**永遠**出現於 logo 旁與 SEO meta（`<title>`、OG、Schema.org），確保 FFXIV 玩家搜尋時仍能命中

### Tagline 候選

`今天想烤點什麼？` — onboarding 與 hero 用，Cormorant italic。每次造訪可隨機輪替。

## Theme & Color Strategy

**Light theme · Full Palette · Lively**

物理場景：早晨剛開門的麵包店——陽光從窗戶灑進來、烘焙紙、托盤、玻璃罐裡的果醬、人氣與活力。

色彩策略採 **Full Palette**：多個飽滿色相各司其職，像麵包店櫃台一排玻璃罐裡的果醬。

### Color Tokens（OKLCH，混合 S2 主體 + S1 sidebar/text）

| Token | 值 | 用途 |
|---|---|---|
| `--app-bg` | `oklch(0.965 0.022 90)` | 奶油白主背景 |
| `--app-sidebar` | `oklch(0.93 0.025 80)` | 側欄（暖一階 cream，與主區建立層次） |
| `--app-surface` | `oklch(0.99 0.01 90)` | 卡片（幾近純白，帶極淺暖意） |
| `--app-surface-2` | `oklch(0.93 0.04 80)` | 強調區（hero / banner） |
| `--app-border` | `oklch(0.84 0.04 70)` | 邊框 |
| `--app-text` | `oklch(0.28 0.04 55)` | 正文（深暖棕，非黑） |
| `--app-text-muted` | `oklch(0.50 0.03 60)` | 次要文字 |
| `--app-accent` | `oklch(0.65 0.18 65)` | **吐司金**（主品牌色） |
| `--app-accent-light` | `oklch(0.78 0.15 75)` | accent hover/secondary |
| `--app-accent-glow` | `oklch(0.65 0.18 65 / 0.18)` | active 區域底色 |

### 功能區語意色（果醬罐排隊）

| Token | 值 | 對應功能 | 隱喻 |
|---|---|---|---|
| `--app-craft` | `oklch(0.50 0.16 40)` | 製作（配裝 / 模擬 / 批量 / BOM） | 可可棕 cocoa |
| `--app-market` | `oklch(0.58 0.20 15)` | 市場 | 草莓醬 strawberry |
| `--app-gather` | `oklch(0.62 0.17 135)` | 採集計時器 | 抹茶綠 matcha |
| `--app-highlight` | `oklch(0.55 0.18 245)` | 副情境 / 提示 | 藍莓 blueberry |

每個功能區色都備有 `-dim` 版（`/ 0.10` alpha）作 badge / pill 背景。

### Element Plus 對映

`--el-color-primary` → 吐司金；light/dark 階梯重新依 OKLCH 推算（淺值用 0.78–0.92 區間，深值用 0.55–0.45）。所有 `el-bg-color` / `el-fill-color-*` / `el-border-color-*` / `el-text-color-*` 全面翻成 light theme 對應。

## Typography

| 角色 | 字體 |
|---|---|
| Wordmark「吐司工坊」 | **Noto Serif TC 900**，letter-spacing 1.5–2px |
| 區塊標題 / 大標 | Noto Serif TC 600/700 |
| 介面正文 | Noto Sans TC 400/500 |
| 小型副線 / overline | Noto Sans TC 500，全大寫，1.5–2px letter-spacing |
| 引言 / 招呼 / 黑板字 | Cormorant Garamond italic 500/600 |
| 程式碼 / macro / 數字 | Fira Code 700 |

字體已全數 import 於 `index.html`，不需新增 request。

## Lively Elements

「活潑」靠這些元件層級的細節支撐——**不是靠傾斜**：

| 項目 | 採用 | 規格 |
|---|---|---|
| Hover 微抬升 | ✅ | `translateY(-2px)` + shadow ramp（無旋轉） |
| 紙感背景 | ✅ | SVG noise / radial dots，~10% opacity，僅用於 hero、onboarding、empty states |
| Cormorant italic 引言 | ✅ | 首頁 hero、onboarding 各放一句；可隨機輪替 |
| 慷慨圓角 | ✅ | 卡片 12–14px、按鈕 10px |
| Sticker badges 傾斜 | ❌ | **不傾斜**——badges 全部水平、邊框 1.5–2px |
| 版本徽章傾斜 | ❌ | 同上水平 |

## Out of Scope

明確不在這次 rebrand 處理：

- GitHub repo rename（保留 `ff14-craft-helper`，避免破壞 GitHub Pages URL 與外部連結）
- API endpoints、資料 shape、引擎邏輯
- 介面文案大改（除 onboarding hero 與 sidebar logo 外保持既有）
- i18n / OCR / s2t 工具邏輯
- `prefers-color-scheme` dark mode 支援（未來 issue）
- 既有 emoji 使用（保留 `🔮`、`💡` 等個別元素，但 sidebar logo 替換為 SVG 吐司）

## SEO 守則

- `<title>` / OG title / Schema.org `name` → 「吐司工坊」
- `alternateName` → `["FF14 Craft Helper", "FFXIV Craft Helper", "FF14 製作模擬器"]`
- `keywords` / description → **保留** FF14 / FFXIV / Final Fantasy XIV / 製作模擬器
- canonical URL **不變**

## Phased PR Plan

所有 sub-PR base = `rebrand/toast-workshop`，head = `feat/*` sub-branch。整體驗收完才 fast-forward 至 `main`。

| PR | head branch | 內容 | 風險 |
|---|---|---|---|
| 1 | `feat/rename-textual` | 純文字命名置換 + SEO meta + sidebar logo wordmark | 低 |
| 2 | `feat/color-tokens` | `:root` 色票翻 light + Element Plus override | 中（會看見視覺斷層） |
| 3 | `feat/logo-favicon` | 吐司 SVG logo + favicon 替換 | 低 |
| 4a | `feat/atmosphere-playground` | `/playground/atmosphere` 路由展示紙感／引言／hover 等元素的多種搭配 | 低 |
| 4b | `feat/atmosphere-apply` | 套用 4a 選定組合於 hero、onboarding、empty states | 中 |
| 5 | `docs/rebrand-update` | README、CLAUDE.md、過時 docs 更新 | 無風險 |

每 PR 結束在瀏覽器驗收 + sign-off 才合併。

## Risks

- **Element Plus light theme 客製工作量**：原本是 dark override，翻 light 需要重寫所有 token 對映。預估比 token 替換多 50% 工作量。
- **SEO 過渡期排名波動**：`alternateName` 與保留的 keywords 是緩衝，但短期可能影響 GSC 點擊。
- **既有使用者 dark theme 偏好**：部分硬核玩家深夜使用，light theme 對眼可能不適。`prefers-color-scheme` 列為未來 issue，這次 spec 不處理。

## References

- 視覺鎖定版預覽：`public/color-preview.html`（dev 路由：`/color-preview.html`）
- Brand 上下文：`PRODUCT.md`
- 現有色票出處：`src/App.vue` `:root` 區塊
