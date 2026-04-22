# FF14 Craft Helper

A web-based crafting assistant for Final Fantasy XIV. Provides craft simulation with an optimal rotation solver, material planning, batch production optimization, gathering timers, and cross-server market price comparison.

**Live:** https://andycom12000.github.io/ff14-craft-helper/

## Features

### Craft Simulator
Simulate crafting rotations step-by-step with real-time quality/progress/durability tracking. Includes an optimal rotation solver powered by [Raphael-rs](https://github.com/KonaeAkira/raphael-rs) (multi-threaded WASM), food/medicine buff optimization, and in-game macro export.

### Bill of Materials (BOM)
Expand recipes into full material trees. Lookup market prices via Universalis API with cross-server comparison and craft-vs-buy cost analysis.

### Batch Crafting
Plan multi-recipe production runs with shopping list generation, cross-server price comparison, food/medicine recommendations, and OCR import from in-game screenshots.

### Gathering Timer
Track timed gathering nodes with Eorzean time countdown, alarm notifications, interactive minimap, and market price integration.

### Market Price Check
Compare item prices across servers within a data center, showing the cheapest listings.

### Gearset Management
Configure crafting stats (level, craftsmanship, control, CP) for all crafting jobs.

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
├── views/          # Page components
├── components/     # Reusable UI components
├── stores/         # Pinia state management
├── api/            # External API integrations
├── services/       # Business logic (batch optimizer, BOM calculator, etc.)
├── solver/         # WASM solver integration (Web Worker)
├── engine/         # Craft simulation engine
├── composables/    # Vue composables
└── utils/          # Utilities and constants

raphael-wasm-wrapper/   # Rust WASM wrapper for raphael-rs
public/solver-wasm/     # Compiled WASM files
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

MIT
