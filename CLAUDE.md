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
- **Rebuild 後必須 bump `SOLVER_CACHE_EPOCH`**（`src/solver/pool-config.ts`）：solve-result cache 以此常數區分 solver 版本，忘記 bump 會讓使用者拿到舊 WASM 算出的快取解。格式 `<upstream rev>-<local increment>`。
- WASM 檔案放在 `public/solver-wasm/`（不是 `src/`）

## Dev Benchmarks

- `npm run bench:solver` — 跑 `scripts/dev/datasets/dataset-3.json` 過 `raphael-cli`，輸出 wall-time CSV 到 `.tmp/bench/`
- 用途：upstream bump 行為對拍、`--threads` 限縮行為驗證、native vs WASM timing 對照
- **重要**：CLI native 比 WASM 快 ~2-3×、沒 worker pool contention，**絕對數字不可當效能目標**，只能比對「相對行為」
- 不進 CI、不進 `npm test`、不做 action-sequence snapshot
- 首次執行 `cargo build --release` 約 2-5 分鐘
- In-app BenchPanel：`npm run dev` 後到 `/#/batch?bench=1`，按「Run dataset-N」跑真實 worker pool benchmark，輸出 wall-clock + wasmDur（PR E 之後）CSV。
  - 用途：跨 PR perf 對比；比 raphael-cli native bench 多了 worker pool contention
  - 不會出現在 production build（route query gating 但不擋頁面，建議 staging 也別開）

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

## Agent skills

### Issue tracker

Issues 開在 GitHub Issues（`andycom12000/ff14-craft-helper`），透過 `gh` CLI 操作。詳見 `docs/agents/issue-tracker.md`。

### Triage labels

5 個 canonical role 全部沿用預設字串（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）。詳見 `docs/agents/triage-labels.md`。

### Domain docs

Single-context — 一份 `CONTEXT.md` + `docs/adr/` 在 repo root。詳見 `docs/agents/domain.md`。
