# 吐司工坊（FF14 Craft Helper）- Project Instructions

## Git Workflow

### Tagging Rules
- 建立 tag 時，務必先用 `git tag --sort=-v:refname | head -1` 查詢目前最大版本號
- 新 tag 必須基於最大版本遞增（例如最大版本為 v1.3.0，則下一個 patch 為 v1.3.1）
- 絕對不要自行猜測版本號
- **打 tag 前必須先將該版本的 changelog 寫入 `src/views/ChangelogView.vue` 並 commit**
  - PreToolUse hook（`.claude/scripts/check-changelog.sh`）會自動檢查
  - 若 ChangelogView.vue 中找不到該版本號，`git tag` 指令會被攔截

### Commit Convention
- 使用 conventional commits 格式（feat/fix/refactor/docs/chore）
- Commit message 用英文
- 明確要求commit前不要commit

## WASM Build
- wasm-pack 路徑：需加 `/c/Users/andyc/.cargo/bin` 到 PATH
- 建置指令：`cd raphael-wasm-wrapper && RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir ../public/solver-wasm`
- 建置完務必跑一次 `npm run patch-wasm`：修掉 `wasm-bindgen-rayon` 1.3.0 在 `workerHelpers.no-bundler.js` 用 positional 參數呼叫 `pkg.default()` 的 deprecation warning（每個 rayon worker 各噴一次）。腳本 idempotent，重跑無害。
- WASM 檔案放在 `public/solver-wasm/`（不是 `src/`）

## Tech Stack
- Vue 3 + Pinia + Element Plus + Vite + TypeScript
- Raphael-rs WASM solver（多執行緒，需 SharedArrayBuffer / COOP+COEP）

## OCR (Tesseract.js)
- Tesseract worker 走 `public/tesseract-shim/shim.js`：先過濾 LSTM-only build 的 `Parameter not found` 噪音，再 importScripts upstream worker
- `public/tesseract-shim/worker.min.js` 是從 `node_modules/tesseract.js/dist/` 同步過來的，已 gitignore；npm 的 `predev` / `prebuild` hook 會自動執行 `node scripts/sync-tesseract-worker.mjs`
- 想手動觸發：`npm run sync-tesseract`

## Temp Files & Scratch Artifacts
任何「驗證截圖、暫時 mockup、比對 before/after、benchmark output」等**不該被 commit** 的檔案，一律放進 `.tmp/`，依用途分子目錄：

- `.tmp/screenshots/` — Chrome DevTools / 視覺驗證截圖（檔名建議 `<task>-<n>.png`）
- `.tmp/compare/<task>/{before,after}/` — UI 改版前後比對
- `.tmp/scratch/` — 其他臨時檔（OCR 樣本、HTML mockup、log dump…）

整個 `.tmp/` 已在 `.gitignore`，要清空時：
```bash
rm -rf .tmp/
```

**不要**把暫存檔散在 project root（`.tmp-*.png`、`tmp-compare/`、`audit-*.png`、`ui-verify-*.png` 都是過去的反例）。Chrome DevTools MCP 的 `take_screenshot` 也要把 `filePath` 指到 `.tmp/screenshots/...`。

## Brand & Design Context
- 主品牌名：**吐司工坊（Toast Workshop）**；副線：**FFXIV 製作助手**（用於 logo 旁與 SEO meta）
- 主打功能：批量製作（Batch Crafting）— 視覺與 sidebar 已將其置於 Tier 1
- 視覺基調：light theme · 奶油白主背景 · 多色烘焙語意（吐司金 / 可可 / 草莓醬 / 抹茶 / 藍莓）
- Brand & 設計細節請參考 `PRODUCT.md`
- Rebrand spec：`docs/superpowers/specs/2026-04-26-toast-workshop-rebrand-design.md`
