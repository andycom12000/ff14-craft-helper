# 吐司工坊 · FFXIV 製作助手

> *Toast Workshop — a web-based crafting assistant for Final Fantasy XIV.*

提供製作模擬與最佳手法求解、材料清單規劃、批量製作最佳化、採集計時，以及跨伺服器市場比價。

亮色設計、多色烘焙語意、批量製作為主打功能。前身為 *FF14 Craft Helper*；2026 年 4 月起改名為「吐司工坊」並重新設計視覺。

**Live:** https://andycom12000.github.io/ff14-craft-helper/

## Features

### Batch Crafting · 批量製作（主打）
規劃多配方批量生產：購物清單自動生成、跨伺服器比價、自製 vs 採購建議、料理／藥水推薦，並支援從遊戲截圖 OCR 匯入。

### Craft Simulator · 製作模擬
逐步模擬製作 rotation，即時追蹤品質／作業進度／耐久，整合 [Raphael-rs](https://github.com/KonaeAkira/raphael-rs) 最佳手法求解（多執行緒 WASM）、料理／藥水 buff 最佳化，以及遊戲內 macro 匯出。

### Bill of Materials · 材料清單
將配方展開為完整材料樹，透過 Universalis API 查詢跨伺服器市場價，比較自製與採購成本。

### Gathering Timer · 採集計時
追蹤限時採集點，提供 Eorzean 時間倒數、提示音、互動 minimap，以及市場價格整合。

### Market Price Check · 市場比價 &nbsp;🚧 _重構中_
獨立的跨伺服器比價頁面暫時關閉重構中，市場比價功能仍保留於批量製作與材料清單頁中。

### Gearset Management · 配裝管理
設定 8 種生產職的等級／作業精度／加工精度／製作力（CP），多份配裝可保留以對應不同情境。

## Tech Stack

- **Frontend:** Vue 3 + TypeScript + Pinia + Element Plus
- **Build:** Vite 6
- **Solver:** [Raphael-rs](https://github.com/KonaeAkira/raphael-rs) WASM (multi-threaded via wasm-bindgen-rayon)
- **APIs:** [XIVAPI](https://beta.xivapi.com) (icons), [Universalis](https://universalis.app) (market prices), [Garland Tools](https://garlandtools.org) (gathering nodes)
- **Game Data:** Build-time ETL from public datamining repositories (see below)
- **OCR:** Tesseract.js
- **Deploy:** GitHub Pages (CI/CD via GitHub Actions)

## Development

```bash
# Install dependencies
npm install

# Start dev server (with COOP/COEP headers for SharedArrayBuffer)
npm run dev

# Type check & build
npm run build

# Run tests
npm run test
```

### WASM Solver Build

Requires nightly Rust toolchain with `wasm32-unknown-unknown` target.

```bash
cd raphael-wasm-wrapper
RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir ../public/solver-wasm
```

WASM output goes to `public/solver-wasm/` (not `src/`) to avoid Vite's module transform breaking rayon sub-workers.

## Project Structure

```
src/
├── App.vue         # Root component (sidebar layout)
├── main.ts         # App entry
├── router/         # vue-router routes
├── views/          # Page components (one per route)
├── components/     # Reusable UI components
├── stores/         # Pinia state management
├── api/            # External API integrations
├── services/       # Business logic (batch optimizer, BOM calculator, etc.)
├── solver/         # WASM solver integration (Web Worker)
├── engine/         # Craft simulation engine
├── composables/    # Vue composables
├── utils/          # Utilities and constants
├── assets/         # Static assets (images, icons)
└── __tests__/      # Vitest test suites

raphael-wasm-wrapper/   # Rust WASM wrapper for raphael-rs
public/solver-wasm/     # Compiled WASM files
public/data/            # Game data JSON (items, recipes, recipe-level tables)
```

## Supported Languages

Recipe and item names are available in four languages:

- 繁體中文（zh-TW） — default
- 简体中文（zh-CN）
- English（en）
- 日本語（ja）

The UI itself stays in 繁體中文 for now. Language preference is remembered in `localStorage`. Switch languages in Settings. When a new game patch hasn't reached a given client yet, missing item names fall back to 繁體中文.

## Data Sources

Game data (items, recipes, recipe-level tables) is extracted at build time from public community datamining repositories:

- [**harukaxxxx/ffxiv-datamining-tw**](https://github.com/harukaxxxx/ffxiv-datamining-tw) — 繁體中文 client dump
- [**thewakingsands/ffxiv-datamining-cn**](https://github.com/thewakingsands/ffxiv-datamining-cn) — 简体中文 client dump
- [**xivapi/ffxiv-datamining**](https://github.com/xivapi/ffxiv-datamining) — English / Japanese client dump, recipe structures

The extracted JSON lives in `public/data/` and is committed to this repo so normal builds don't need to clone gigabyte-scale datamining repos.

Huge thanks to these maintainers — this project would not exist without them.

## Data Update

The `update-game-data` GitHub Actions workflow regenerates `public/data/` every Sunday (UTC 02:00) and on manual dispatch (useful right after a patch day). When the data diff is non-empty, the workflow runs tests and a production build against the new data, then opens a pull request for review.

To regenerate locally:

```bash
npm run build-game-data
```

This clones the three datamining repos into `.data-cache/` (not committed) and writes `public/data/*.json`.

## Copyright

*Final Fantasy XIV* © SQUARE ENIX CO., LTD. All rights reserved.

This is a non-commercial fan project. Not affiliated with or endorsed by Square Enix. No game assets (textures, audio, models) are redistributed — only publicly available structured data necessary for gameplay-assist features.

## License

This project is licensed under the [MIT License](LICENSE) — © 2026 Andy Liu.

### Third-Party Notices

This project incorporates the following open-source software. Their licenses apply to their respective code:

- **[Raphael-rs](https://github.com/KonaeAkira/raphael-rs)** by Konae Akira — Apache License 2.0.
  The crafting rotation solver is built on `raphael-sim` and `raphael-solver`; see `raphael-wasm-wrapper/Cargo.toml`. Redistributions must retain Raphael-rs's copyright notice under the Apache 2.0 terms.
- Other npm and Cargo dependencies retain their original licenses; see `package.json` and `raphael-wasm-wrapper/Cargo.toml`.

The MIT license covers only the source code authored in this repository. It does **not** grant any rights over Final Fantasy XIV game data, assets, or trademarks — see the Copyright section above.
