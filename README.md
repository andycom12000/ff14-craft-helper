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
- **APIs:** [XIVAPI](https://beta.xivapi.com) (recipes), [Universalis](https://universalis.app) (market prices), [Garland Tools](https://garlandtools.org) (gathering nodes)
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

## License

MIT
