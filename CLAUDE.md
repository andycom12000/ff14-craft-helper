# FF14 Craft Helper - Project Instructions

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

## WASM Build
- wasm-pack 路徑：需加 `/c/Users/andyc/.cargo/bin` 到 PATH
- 建置指令：`cd raphael-wasm-wrapper && RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir ../public/solver-wasm`
- WASM 檔案放在 `public/solver-wasm/`（不是 `src/`）

## Tech Stack
- Vue 3 + Pinia + Element Plus + Vite + TypeScript
- Raphael-rs WASM solver（多執行緒，需 SharedArrayBuffer / COOP+COEP）
