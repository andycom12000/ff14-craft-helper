# Batch Performance — Sprint 0-3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 依 `docs/superpowers/specs/2026-05-12-batch-perf-next-sprints-design.md` 落實 Sprint 0-3，解 rayon contention 與 HQ-unachievable solver 浪費，並建立 per-solve timer 觀測能力。

**Architecture:** 五個獨立 PR：(A) raphael-cli dev harness 先行；(B) 升 raphael-rs upstream 重設 baseline；(C) wasm-bindgen-rayon thread limit；(D) wrapper 暴露 `allow_non_max_quality_solutions` 給 Phase 1 strict-mode probe；(E) solver-worker.ts 量真實 wasm solve duration 並透傳。每個 PR 跑完 3-dataset benchmark 才進下一個。

**Tech Stack:** Vue 3 / Pinia / TypeScript / Vite / Vitest（前端） · Rust nightly + wasm-pack + wasm-bindgen-rayon（WASM 端） · raphael-rs (upstream commit pin) · Node ≥ 18（dev scripts）

**Spec reference:** `docs/superpowers/specs/2026-05-12-batch-perf-next-sprints-design.md`（§5–§8 為四 Sprint 主體，§11 #5 為 raphael-cli harness）

---

## File Structure

新增：
- `scripts/dev/bench-solver.mjs` — raphael-cli wrapper，餵 dataset、量 wall time、輸出 CSV
- `scripts/dev/datasets/dataset-3.json` — 8-recipe mixed lv53-100 benchmark dataset
- `scripts/dev/datasets/dataset-1.json` — 6-recipe 軍需品 dataset（§7.5 PR F）
- `scripts/dev/datasets/dataset-2.json` — 7-recipe mixed lv94-100 dataset（§7.5 PR F）
- `src/components/batch/BenchPanel.vue` — `?bench=1` 才渲染的 in-app benchmark UI，跑 batch + 收 wall-clock/wasmDur + 輸出 CSV；§7.5 PR G 加 prefilter shadow 3 欄
- `src/solver/pool-config.ts` — `POOL_SIZE` 常數獨立檔，供 `worker.ts` + `solver-worker.ts` 共用

修改：
- `raphael-wasm-wrapper/Cargo.toml` — git dep pin `rev = "aafcbb0"`（Sprint 0）
- `raphael-wasm-wrapper/src/lib.rs` — `SolveConfig` 加 `allow_non_max_quality_solutions` field（Sprint 2，保留供 §7.5 PR H 用）
- `src/solver/raphael.ts` — `SolverConfig` 加 `strict_quality?: boolean`、`NO_SOLUTION_MESSAGE` const、`isNoSolutionError` helper（Sprint 2，保留）
- `src/solver/solver-worker.ts` — (1) `init_threads(hwc / POOL_SIZE)`（Sprint 1）；(2) 透傳 `strict_quality`（Sprint 2）；(3) 量 `wasmDur` 並 post 回主執行緒（Sprint 3）
- `src/solver/worker.ts` — import `POOL_SIZE`；`SolverResponse` 帶 `wasmDur`；`solveCraft` 解 promise 時轉手給 caller
- `src/services/batch-optimizer.ts` — Sprint 3 記 `wasmDur` log；§7.5 PR G 加 `[bperf-prefilter]` shadow log；§7.5 PR H 加 `canReachHQQualityStrict`-gated strict probe（Sprint 2 strict probe 已 revert）
- `src/services/feasibility-prefilter.ts` — §7.5 PR H 加 `canReachHQQualityStrict` 新 export（既有 `canReachHQQuality` 不動）
- `src/views/BatchView.vue` — `?bench=1` 時掛載 `BenchPanel`（Task 0.5）
- `CLAUDE.md` — 新增「Dev Benchmarks」小節，含 BenchPanel 用法
- `package.json` — 加 `bench:solver` script
- `public/solver-wasm/*` — WASM 產出（每個動到 Rust 的 PR 都會重 build，**不要手 edit**）

---

## PR 邊界與驗收

| PR | Task | 規模 | 退路 |
|---|---|---|---|
| **A** dev benchmark harness | T0, T0.5 | 2 tasks | 出問題就 revert，不影響任何 production code |
| **B** Sprint 0 — upgrade raphael-rs | T1, T2 | 2 tasks | `git checkout Cargo.toml Cargo.lock` + 重 build |
| **C** Sprint 1 — rayon thread limit | T3, T4 | 2 tasks | 改回 `init_threads(navigator.hardwareConcurrency \|\| 4)` 一行 |
| **D** Sprint 2 — strict-mode HQ feasibility | T5, T6, T7 | 3 tasks | wrapper field optional + JS 不傳即恢復舊行為 |
| **E** Sprint 3 — per-solve timer | T8, T9 | 2 tasks | 純觀測，無業務影響；解 message 改回不讀 `wasmDur` |
| **F** §7.5 fallback — datasets | T10 | 1 task | 刪 dataset-1.json + dataset-2.json |
| **G** §7.5 fallback — shadow log | T11 | 1 task | revert `[bperf-prefilter]` 兩行 console.debug |
| **H** §7.5 fallback — calibrate + enable | T12 | 1 task | revert 後 `optimizeRecipe` 回 single lenient call |

**每 PR 結束前 user 必跑的驗證**（subagent 不能代跑）：
1. **BenchPanel** 跑 3 個 dataset 拿 wall time CSV 對比上一 PR baseline（PR A T0.5 提供 UI，`npm run dev` → `/#/batch?bench=1`）
2. `npm run bench:solver`（PR A T0 提供）拿 native CSV 對拍 — 偵測上游 raphael 行為差異
3. PR D 額外加：`__bperfForceLenient` toggle 對拍 strict probe 收益（已 revert，不再需要）
4. PR G 額外加：BenchPanel CSV 多 3 欄（predicted / actual_reached / final_quality_over_max），user 跑完 3 dataset 上傳給 controller 校準

---

## Task 0 — raphael-cli Dev Harness (PR A)

**Files:**
- Create: `scripts/dev/bench-solver.mjs`
- Create: `scripts/dev/datasets/dataset-3.json`
- Modify: `package.json` — 加 `bench:solver` script
- Modify: `CLAUDE.md` — 新增「Dev Benchmarks」段落
- Modify: `.gitignore` — 確認 `.tmp/bench/` 已被 `.tmp/` 涵蓋（CLAUDE.md 已記載 `.tmp/` 整個 gitignored，無需動）

**Pre-flight context:**
- `raphael-cli` 在 pinned commit `47c4ea7` 已存在（v0.2.2）。子命令：`solve` 接 `--custom-recipe RLVL PROG QUAL DUR`、`--stats / -c -o -p`、`--threads N`、`--output-variables actions action_ids steps final_quality duration`、`--output-field-separator ","`
- **不印 wall time**，需 mjs wrapper 用 `performance.now()` 量 spawn duration
- **`allow_non_max_quality_solutions` 在 47c4ea7 hardcoded `true`** → 此 task 不嘗試驗 strict-mode，Sprint 2 走 wrapper unit test 路線
- 工具鏈：本機 PATH 含 `/c/Users/andyc/.cargo/bin`（CLAUDE.md 已記載）；首次 `cargo run` 會 build，預估 2-5 分鐘

- [ ] **Step 1: 建立 dataset-3.json**

`scripts/dev/datasets/dataset-3.json` 是 8-recipe mixed lv53-100 benchmark fixture（與 `.tmp/scratch/perf-benchmarks.md` 紀錄的 dataset 3 對齊）。每筆包含 recipe RLVL / progress / quality / durability / 4 個 stat。這個檔案 commit 進 repo（公開遊戲資料，無敏感性）。

> **資料來源**：subagent 從 `.tmp/scratch/perf-benchmarks.md` 或實際 batch input 截取 dataset 3 8 個 recipe。若 `.tmp/scratch/` 已被清空，subagent 應 BLOCKED 並向 controller 要原始資料。Schema（雙用：raphael-cli `--custom-recipe` 吃前段、Task 0.5 BenchPanel 吃 `recipeId`）：

```json
{
  "name": "dataset-3-mixed-lv53-100",
  "recipes": [
    {
      "label": "<recipe display name>",
      "recipeId": 12345,
      "quantity": 1,
      "rlvl": 535,
      "progress": 5060,
      "quality": 12628,
      "durability": 70,
      "craftsmanship": 5000,
      "control": 5000,
      "cp": 600,
      "level": 100,
      "manipulation": true
    }
  ]
}
```

> **雙欄位**：`recipeId` 給 in-app BenchPanel（透過 `getRecipe(id)` 查實際 Recipe）；`rlvl/progress/quality/durability` 給 raphael-cli `--custom-recipe`。實務上 `recipeId` 對應的 RECIPES table 數值會跟 `rlvl/progress/quality/durability` 一致 —— **subagent 抓資料時兩邊都填，不要算一邊推一邊**。

- [ ] **Step 2: 寫 bench-solver.mjs**

```js
#!/usr/bin/env node
// Run raphael-cli against a JSON dataset and emit wall-time CSV.
// Reference-only timing (native, no pool contention) — NOT a user-facing perf target.
// Sequential by design: each invocation saturates cores via rayon; running in
// parallel would oversubscribe and pollute timing.

import { spawn } from 'node:child_process'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WRAPPER_DIR = resolve(__dirname, '../../raphael-wasm-wrapper')
const TMP_DIR = resolve(__dirname, '../../.tmp/bench')
const TAG = '[bench]'

function parseArgs(argv) {
  const args = { dataset: 'dataset-3', threads: undefined, csv: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--dataset=')) args.dataset = a.slice(10)
    else if (a.startsWith('--threads=')) args.threads = Number(a.slice(10))
    else if (a === '--csv') args.csv = true
  }
  return args
}

function buildCliArgs(recipe, threads) {
  const out = [
    'run', '--release', '--bin', 'raphael-cli', '--',
    'solve',
    '--custom-recipe', String(recipe.rlvl), String(recipe.progress),
                       String(recipe.quality), String(recipe.durability),
    '-c', String(recipe.craftsmanship),
    '-o', String(recipe.control),
    '-p', String(recipe.cp),
    '-l', String(recipe.level),
    '--output-variables', 'steps', 'final_quality', 'duration', 'action_ids',
    '--output-field-separator', ',',
  ]
  if (recipe.manipulation) out.push('--manipulation')
  if (recipe.heart_and_soul) out.push('--heart-and-soul')
  if (recipe.quick_innovation) out.push('--quick-innovation')
  if (threads !== undefined) out.push('--threads', String(threads))
  return out
}

function runOne(recipe, threads) {
  return new Promise((res, rej) => {
    const start = performance.now()
    const proc = spawn('cargo', buildCliArgs(recipe, threads), {
      cwd: WRAPPER_DIR, shell: process.platform === 'win32',
    })
    let stdout = '', stderr = ''
    proc.stdout.on('data', d => { stdout += d })
    proc.stderr.on('data', d => { stderr += d })
    proc.on('close', code => {
      const wallMs = performance.now() - start
      if (code !== 0) return rej(new Error(`exit ${code}: ${stderr.trim()}`))
      res({ wallMs, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

async function main() {
  const args = parseArgs(process.argv)
  const dsPath = resolve(__dirname, 'datasets', `${args.dataset}.json`)
  const dataset = JSON.parse(await readFile(dsPath, 'utf8'))
  console.log(`${TAG} dataset: ${dataset.name} (${dataset.recipes.length} recipes)`)
  console.log(`${TAG} threads: ${args.threads ?? 'default'}`)
  console.log(`${TAG} note: native CLI timing — not comparable to WASM/browser numbers`)
  console.log()

  const rows = []
  for (const recipe of dataset.recipes) {
    process.stdout.write(`${TAG} ${recipe.label.padEnd(40)} `)
    try {
      const r = await runOne(recipe, args.threads)
      const [steps, finalQuality, duration] = r.stdout.split(',')
      console.log(`${(r.wallMs / 1000).toFixed(2)}s  steps=${steps} q=${finalQuality}`)
      rows.push({ label: recipe.label, wall_ms: Math.round(r.wallMs), steps, final_quality: finalQuality, duration })
    } catch (err) {
      console.log(`FAIL: ${err.message}`)
      rows.push({ label: recipe.label, wall_ms: -1, steps: 'ERR', final_quality: 'ERR', duration: 'ERR' })
    }
  }

  const total = rows.reduce((s, r) => s + Math.max(0, r.wall_ms), 0)
  console.log(`\n${TAG} total wall: ${(total / 1000).toFixed(2)}s`)

  if (args.csv) {
    await mkdir(TMP_DIR, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const csvPath = resolve(TMP_DIR, `solver-${stamp}.csv`)
    const header = 'label,wall_ms,steps,final_quality,duration'
    const body = rows.map(r => `${r.label},${r.wall_ms},${r.steps},${r.final_quality},${r.duration}`).join('\n')
    await writeFile(csvPath, `${header}\n${body}\n`)
    console.log(`${TAG} csv: ${csvPath}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: 加 package.json script**

在 `package.json` 的 `"scripts"` 區塊插入（位置：`"sync-tesseract"` 行之後）：

```json
"bench:solver": "node scripts/dev/bench-solver.mjs --dataset=dataset-3 --csv",
"bench:solver:single": "node scripts/dev/bench-solver.mjs --dataset=dataset-3 --threads=1"
```

- [ ] **Step 4: 更新 CLAUDE.md**

在「## WASM Build」段落之後插入：

```markdown
## Dev Benchmarks

- `npm run bench:solver` — 跑 `scripts/dev/datasets/dataset-3.json` 過 `raphael-cli`，輸出 wall-time CSV 到 `.tmp/bench/`
- 用途：upstream bump 行為對拍、`--threads` 限縮行為驗證、native vs WASM timing 對照
- **重要**：CLI native 比 WASM 快 ~2-3×、沒 worker pool contention，**絕對數字不可當效能目標**，只能比對「相對行為」
- 不進 CI、不進 `npm test`、不做 action-sequence snapshot
- 首次執行 `cargo build --release` 約 2-5 分鐘
```

- [ ] **Step 5: 跑 smoke test**

```bash
npm run bench:solver
```

預期：8 個 recipe 全部成功跑出，stdout 印 wall ms 與 steps；CSV 寫入 `.tmp/bench/solver-<ts>.csv`。

> 若 cargo 找不到 / wasm-pack PATH 不對，subagent 應 BLOCKED 並回報；不要嘗試 install Rust 或改 user 環境。

- [ ] **Step 6: Commit**

```bash
git add scripts/dev/bench-solver.mjs scripts/dev/datasets/dataset-3.json package.json CLAUDE.md
git commit -m "feat(dev): raphael-cli benchmark harness for solver perf work"
```

---

## Task 0.5 — In-App BenchPanel (PR A, part 2)

**Files:**
- Create: `src/components/batch/BenchPanel.vue`
- Modify: `src/views/BatchView.vue` — `?bench=1` 時掛 `BenchPanel` 到 view 頂部
- Modify: `CLAUDE.md` — Dev Benchmarks 段落補 BenchPanel 用法

**Pre-flight context:**
- `getRecipe(id: number)` 在 `@/api/xivapi`（轉接 `local-data-source.ts`）回 `Promise<Recipe | undefined>`
- `GearsetStats` interface 在 `src/stores/gearsets.ts:6`
- `optimizeRecipe(recipe, gearset, onProgress?, buffs?)` 在 `src/services/batch-optimizer.ts:36`，獨立可呼叫，不依賴 `runBatchOptimization` 整套流程
- POOL_SIZE=2 worker pool 由 `solveCraft` 走 `worker.ts`，並行 8 個 `optimizeRecipe(...)` 透過 `Promise.allSettled` 就會自動排隊到 2-slot pool（與 production batch flow 同一機制）
- **本 task 階段 PR E 尚未完成**，[bperf] wasmDur log 還不存在 —— BenchPanel 第一版只量 wall-clock，monkey-patch `console.debug` 抓 wasmDur 待 PR E 完成後**自動**生效（無需回頭改 BenchPanel）

- [ ] **Step 1: 建立 BenchPanel.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { getRecipe } from '@/api/xivapi'
import type { GearsetStats } from '@/stores/gearsets'
import { optimizeRecipe } from '@/services/batch-optimizer'

interface BenchRecipeEntry {
  label: string
  recipeId: number
  quantity: number
  craftsmanship: number
  control: number
  cp: number
  level: number
  manipulation?: boolean
}

interface BenchDataset {
  name: string
  recipes: BenchRecipeEntry[]
}

interface BenchRow {
  label: string
  wallMs: number
  wasmDurMs?: number
  steps?: number
  error?: string
}

const running = ref(false)
const currentDataset = ref('')
const rows = ref<BenchRow[]>([])
const totalMs = ref(0)

async function runDataset(name: string) {
  if (running.value) return
  running.value = true
  currentDataset.value = name
  rows.value = []
  totalMs.value = 0

  // Intercept [bperf] console.debug to capture wasmDur per recipe label.
  // Falls through to the real console.debug so DevTools still shows them.
  const wasmDurByLabel = new Map<string, { wasmDur: number; steps: number }>()
  const origDebug = console.debug
  console.debug = (...args: unknown[]) => {
    const msg = args.map(a => String(a)).join(' ')
    const m = /\[bperf\] solve (.+?) wasmDur=(\d+(?:\.\d+)?)ms steps=(\d+)/.exec(msg)
    if (m) wasmDurByLabel.set(m[1], { wasmDur: Number(m[2]), steps: Number(m[3]) })
    origDebug.apply(console, args as [])
  }

  try {
    const url = `${import.meta.env.BASE_URL}../scripts/dev/datasets/${name}.json`
    // Datasets ship via Vite's public asset pipeline in dev — for build-time
    // bundling we'd need a /public copy. Dev-only tool, so use fetch with a
    // relative path that works under `npm run dev` (vite serves project root).
    const res = await fetch(`/scripts/dev/datasets/${name}.json`)
    if (!res.ok) throw new Error(`fetch dataset failed: ${res.status}`)
    const dataset: BenchDataset = await res.json()

    const totalStart = performance.now()
    await Promise.allSettled(dataset.recipes.map(async (entry) => {
      const recipe = await getRecipe(entry.recipeId)
      if (!recipe) {
        rows.value.push({ label: entry.label, wallMs: -1, error: `recipe ${entry.recipeId} not found` })
        return
      }
      const gearset: GearsetStats = {
        level: entry.level,
        craftsmanship: entry.craftsmanship,
        control: entry.control,
        cp: entry.cp,
      }
      const start = performance.now()
      try {
        await optimizeRecipe(recipe, gearset)
        const wallMs = performance.now() - start
        const wasm = wasmDurByLabel.get(recipe.name)
        rows.value.push({ label: entry.label, wallMs, wasmDurMs: wasm?.wasmDur, steps: wasm?.steps })
      } catch (err) {
        rows.value.push({ label: entry.label, wallMs: performance.now() - start, error: String(err) })
      }
    }))
    totalMs.value = performance.now() - totalStart
  } finally {
    console.debug = origDebug
    running.value = false
  }
}

function toCsv(): string {
  const header = 'label,wall_ms,wasm_dur_ms,steps,error'
  const lines = rows.value.map(r =>
    `${r.label},${Math.round(r.wallMs)},${r.wasmDurMs !== undefined ? Math.round(r.wasmDurMs) : ''},${r.steps ?? ''},${r.error ?? ''}`
  )
  return [`# dataset: ${currentDataset.value}`, `# total_ms: ${Math.round(totalMs.value)}`, header, ...lines].join('\n')
}

async function copyCsv() {
  await navigator.clipboard.writeText(toCsv())
}
</script>

<template>
  <div class="bench-panel">
    <h3>Batch Perf BenchPanel</h3>
    <p>Dev-only · sources <code>scripts/dev/datasets/dataset-N.json</code></p>
    <div class="controls">
      <button :disabled="running" @click="runDataset('dataset-1')">Run dataset-1</button>
      <button :disabled="running" @click="runDataset('dataset-2')">Run dataset-2</button>
      <button :disabled="running" @click="runDataset('dataset-3')">Run dataset-3</button>
      <span v-if="running">Running {{ currentDataset }}…</span>
    </div>
    <div v-if="rows.length" class="results">
      <p>Total wall: {{ Math.round(totalMs) }} ms · {{ rows.length }} recipes</p>
      <table>
        <thead><tr><th>Recipe</th><th>Wall (ms)</th><th>WasmDur (ms)</th><th>Steps</th><th>Error</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.label">
            <td>{{ r.label }}</td>
            <td>{{ Math.round(r.wallMs) }}</td>
            <td>{{ r.wasmDurMs !== undefined ? Math.round(r.wasmDurMs) : '—' }}</td>
            <td>{{ r.steps ?? '—' }}</td>
            <td>{{ r.error ?? '' }}</td>
          </tr>
        </tbody>
      </table>
      <button @click="copyCsv">Copy CSV</button>
    </div>
  </div>
</template>

<style scoped>
.bench-panel { border: 1px dashed #999; padding: 12px; margin-bottom: 16px; font-family: monospace; }
.controls { display: flex; gap: 8px; margin: 8px 0; align-items: center; }
table { border-collapse: collapse; margin: 8px 0; font-size: 12px; }
th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: right; }
th:first-child, td:first-child, td:last-child { text-align: left; }
</style>
```

> **Dataset 抓檔位置**：Vite dev server 預設 serve project root，`fetch('/scripts/dev/datasets/dataset-3.json')` 在 `npm run dev` 下可直接讀。**Vercel deploy 端拿不到** —— 這是 dev-only 工具，PR description 註明僅在本機 dev 環境用即可。

- [ ] **Step 2: 改 BatchView.vue 條件掛載**

`src/views/BatchView.vue` 檔頭 `<script setup>` 區塊加：

```ts
import { useRoute } from 'vue-router'
import BenchPanel from '@/components/batch/BenchPanel.vue'

const route = useRoute()
const showBenchPanel = computed(() => route.query.bench === '1')
```

`<template>` 最外層第一個子節點插入：

```vue
<BenchPanel v-if="showBenchPanel" />
```

> 若既有 `<script setup>` 已 `import { useRoute }` 或 `computed`，重複 import 由 vue-tsc 提醒，subagent 直接合併不要新增第二行。

- [ ] **Step 3: 更新 CLAUDE.md**

在「Dev Benchmarks」段落最後追加：

```markdown
- In-app BenchPanel：`npm run dev` 後到 `/#/batch?bench=1`，按「Run dataset-N」跑真實 worker pool benchmark，輸出 wall-clock + wasmDur（PR E 之後）CSV。
  - 用途：跨 PR perf 對比；比 raphael-cli native bench 多了 worker pool contention
  - 不會出現在 production build（route query gating 但不擋頁面，建議 staging 也別開）
```

- [ ] **Step 4: Type-check + smoke**

```bash
npm run type-check
```

Expected: 無 error。

啟 dev server 手動驗（subagent 不要嘗試）：

> **subagent 不啟 dev server**。在 PR description 註明：「user 自驗：`npm run dev`，瀏覽 `/#/batch?bench=1`，看到 BenchPanel，按 Run dataset-3 預期 8 row 出現。」

- [ ] **Step 5: Commit**

```bash
git add src/components/batch/BenchPanel.vue src/views/BatchView.vue CLAUDE.md
git commit -m "feat(dev): in-app BenchPanel for batch perf regression checks

Gated behind ?bench=1 query param. Fetches scripts/dev/datasets/dataset-N.json,
runs optimizeRecipe per entry through the real worker pool, captures wall-clock
+ wasmDur (when PR E lands), emits copyable CSV. Used at each Sprint PR gate."
```

- [ ] **Step 6: PR A 合併 gate**

PR A 含 T0 (CLI harness) + T0.5 (BenchPanel)。回報模板：

```
PR A (dev benchmark harness) ready:
- npm run bench:solver: PASS (<貼 CSV summary>)
- npm run type-check: PASS
Awaiting user:
- `npm run dev` + visit /#/batch?bench=1, click Run dataset-3
- Confirm 8 rows render with wall_ms populated
- (wasmDur column will be '—' until PR E ships)
```

---

## Task 1 — Sprint 0 / Upgrade raphael-rs (PR B, part 1)

**Files:**
- Modify: `raphael-wasm-wrapper/Cargo.toml` — 兩個 git dep 加 `rev = "aafcbb0"`
- Modify: `raphael-wasm-wrapper/Cargo.lock` — 由 `cargo update` 自動產生
- Modify: `public/solver-wasm/*` — 由 wasm-pack 重 build

**Pre-flight context:**
- 當前 `47c4ea7` (2026-03-15) → target `aafcbb0` (2026-05-10)，15 commits ahead
- 直接相關 PR：#337 (skip StepLbSolver if quality unreachable)、#336 (bump allocator)、#334 (replay actions)、#339 (candidate state shrink)、#328 (FinishSolver fast path)、#346 (overflow panic fix)、`eb8d47a` (MuscleMemory in QualityUbSolver — **行為差異風險**)
- API 相容性已掃過：新 variant `SolverException::SearchQueueCapacityExceeded` 被 wrapper 的 `format!("{:?}", e)` 自動處理，其他 pub type 不變

- [ ] **Step 1: Pin Cargo.toml**

把 `raphael-wasm-wrapper/Cargo.toml` 第 10-11 行：

```toml
raphael-sim = { git = "https://github.com/KonaeAkira/raphael-rs", features = ["serde"] }
raphael-solver = { git = "https://github.com/KonaeAkira/raphael-rs", features = ["serde"] }
```

改為：

```toml
raphael-sim = { git = "https://github.com/KonaeAkira/raphael-rs", rev = "aafcbb0", features = ["serde"] }
raphael-solver = { git = "https://github.com/KonaeAkira/raphael-rs", rev = "aafcbb0", features = ["serde"] }
```

- [ ] **Step 2: Cargo update**

```bash
cd raphael-wasm-wrapper
cargo update -p raphael-sim -p raphael-solver
cd ..
```

Expected: `Cargo.lock` 更新；無 dep 衝突。

- [ ] **Step 3: 重 build WASM**

```bash
cd raphael-wasm-wrapper
RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir ../public/solver-wasm
cd ..
npm run patch-wasm
```

Expected: build 成功，`public/solver-wasm/raphael_wasm_wrapper_bg.wasm` 與 JS glue 更新。patch-wasm 為 idempotent。

- [ ] **Step 4: native ground truth 對拍**

```bash
npm run bench:solver
```

Expected: 跑得過。記錄 stdout 與 CSV 路徑作為 Sprint 0 native baseline，供 Sprint 1-3 比對「升級後 native 行為」。**單 recipe action 序列若與 PR A 跑的不同代表受 `eb8d47a` 影響，需在 commit message 註明**。

- [ ] **Step 5: Commit**

```bash
git add raphael-wasm-wrapper/Cargo.toml raphael-wasm-wrapper/Cargo.lock public/solver-wasm/
git commit -m "chore(wasm): bump raphael-rs to aafcbb0 (Sprint 0)"
```

---

## Task 2 — Sprint 0 / Validation (PR B, part 2)

**Files:** 無 code 改動，純驗證 + commit gate

- [ ] **Step 1: 單元測試**

```bash
npm test
```

Expected: 397 tests 全綠。若有 fail，**先看是不是行為差異** —— 比對 `eb8d47a` MuscleMemory fix 是否影響到 test 預期的 action sequence。若是真 regression（非預期 action sequence），向 controller 回報。

- [ ] **Step 2: TypeScript type-check**

```bash
npm run type-check
```

Expected: 無 error。

- [ ] **Step 3: 手動 single-recipe smoke（記入 PR description，不在 subagent 階段做）**

> **這一步留給 user 自跑** —— subagent 不要嘗試啟動 dev server。在 PR description 標註：「待 user 在瀏覽器跑 CRP lv95 軍需品 single-recipe solve，比對 action sequence」。

- [ ] **Step 4: 標記 Sprint 0 baseline tag**

```bash
git tag sprint-0/baseline
```

> Tag 用於後續 Sprint 1-3 對比的錨點；非 release tag，不需要 changelog。

- [ ] **Step 5: PR B 合併 gate**

Subagent **不要 push**。回報 controller，等 user 跑 BenchPanel 3-dataset benchmark 確認後再進 PR C。回報模板：

```
PR B (Sprint 0) ready for benchmark:
- npm test: PASS (397)
- npm run type-check: PASS
- WASM rebuilt, public/solver-wasm updated
- Sprint 0 native bench: <貼 CSV summary>
Awaiting user: BenchPanel 3-dataset benchmark vs bench/pr4-final（用 PR A 拿到的 wall-clock CSV 即可，wasmDur 此時尚未存在）.
```

---

## Task 3 — Sprint 1 / pool-config.ts (PR C, part 1)

**Files:**
- Create: `src/solver/pool-config.ts`
- Modify: `src/solver/worker.ts` — import `POOL_SIZE` 取代 local const

**Pre-flight context:**
- `worker.ts:13` 目前 `const POOL_SIZE = 2`
- `solver-worker.ts:24` 目前 `await pkg.init_threads(navigator.hardwareConcurrency || 4)`
- Sprint 1 要在 worker 內也讀同一個 `POOL_SIZE`，所以必須先抽出共用模組

- [ ] **Step 1: 建立 pool-config.ts**

```ts
// src/solver/pool-config.ts
// Shared between worker.ts (main thread pool size) and
// solver-worker.ts (per-worker rayon thread cap).
// Keep these in sync — Sprint 1 derives rayon threads via deriveRayonThreads.
export const POOL_SIZE = 2

/**
 * Derive per-worker rayon thread count from CPU concurrency.
 * Centralised so the low-hwc clamp and any future 4-core fallback heuristic
 * live next to POOL_SIZE rather than scattered across worker init code.
 */
export function deriveRayonThreads(hwc: number): number {
  return Math.max(1, Math.floor(hwc / POOL_SIZE))
}
```

- [ ] **Step 2: 改 worker.ts import**

把 `src/solver/worker.ts:13` 的 `const POOL_SIZE = 2` 刪掉，並在檔頭 imports 區塊插入：

```ts
import { POOL_SIZE } from './pool-config'
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check
```

Expected: 無 error。**不跑 npm test** —— 純常數位置移動，無 runtime 行為改動，type-check 已足。

- [ ] **Step 4: Commit**

```bash
git add src/solver/pool-config.ts src/solver/worker.ts
git commit -m "refactor(solver): extract POOL_SIZE to shared module"
```

---

## Task 4 — Sprint 1 / Rayon Thread Limit (PR C, part 2)

**Files:**
- Modify: `src/solver/solver-worker.ts:24` — `init_threads(hwc / POOL_SIZE)`

- [ ] **Step 1: 改 solver-worker.ts**

把 `solver-worker.ts:20-30` 區塊：

```ts
async function initWasm() {
  try {
    const pkg = await import(/* @vite-ignore */ wasmJsUrl)
    await pkg.default()
    await pkg.init_threads(navigator.hardwareConcurrency || 4)
```

改為：

```ts
import { deriveRayonThreads } from './pool-config'

// ... (existing code above)

async function initWasm() {
  try {
    const pkg = await import(/* @vite-ignore */ wasmJsUrl)
    await pkg.default()
    const hwc = navigator.hardwareConcurrency || 4
    await pkg.init_threads(deriveRayonThreads(hwc))
```

> Worker 是 module worker，可以直接 `import` 同層的 `pool-config.ts`。低 hwc 邊界：hwc=2 → `init_threads(1)`（rayon 退化為 serial）；hwc=4 → `init_threads(2)`。**未在 hwc=2 機器實機 smoke 過**，PR C commit message 須標註此限制。

- [ ] **Step 2: Type-check**

```bash
npm run type-check
```

Expected: 無 error。**不跑 npm test** —— worker-pool.test 用 mock 不會真跑 `init_threads`；行為差異要靠瀏覽器 benchmark 驗。

- [ ] **Step 3: native ground truth 對拍（reference-only）**

```bash
npm run bench:solver -- --threads=4
```

預期：相對於 PR B 的 Sprint 0 native baseline（threads 預設），threads=4 應該慢一些（單 process 沒競爭，threads=4 < 預設 hwc）。**這是 sanity check**，不是效能目標。

- [ ] **Step 4: Commit**

```bash
git add src/solver/solver-worker.ts
git commit -m "perf(solver): cap rayon threads per worker to hwc / POOL_SIZE

Each Web Worker previously initialized wasm-bindgen-rayon with the full
navigator.hardwareConcurrency, so a POOL_SIZE=2 setup ran 2× cores threads
contending for cores. Dataset 3 regressed 0.65× as a result. Splitting
evenly removes the contention while keeping the wall-clock parallelism."
```

- [ ] **Step 5: PR C 合併 gate**

Subagent **不要 push**。回報 controller，等 user 跑 BenchPanel 3-dataset benchmark 確認 dataset 3 不再 regression。回報模板：

```
PR C (Sprint 1) ready for benchmark:
- npm test: PASS
- npm run type-check: PASS
- Native bench --threads=4: <貼 CSV summary>
Awaiting user: BenchPanel 3-dataset benchmark.
Expected: ds1 65-75s, ds2 70-80s, ds3 80-110s (vs Sprint 0 baseline).
Trigger Sprint 1 fallback (POOL_SIZE=1) if ds3 still > 100s.
```

---

## Task 5 — Sprint 2 / Wrapper allow_non_max_quality_solutions (PR D, part 1)

**Files:**
- Modify: `raphael-wasm-wrapper/src/lib.rs` — `SolveConfig` 加 field，傳到 `SolverSettings`
- Modify: `public/solver-wasm/*` — 重 build

- [ ] **Step 1: 改 lib.rs SolveConfig**

把 `raphael-wasm-wrapper/src/lib.rs:19-34` 的 `SolveConfig` struct 改為（在 `adversarial` 行之後加一行）：

```rust
#[derive(Deserialize)]
struct SolveConfig {
    max_cp: u16,
    max_durability: u16,
    max_progress: u16,
    max_quality: u16,
    base_progress: u16,
    base_quality: u16,
    job_level: u8,
    use_manipulation: bool,
    use_heart_and_soul: bool,
    use_quick_innovation: bool,
    use_trained_eye: bool,
    backload_progress: bool,
    adversarial: bool,
    #[serde(default = "default_true")]
    allow_non_max_quality_solutions: bool,
}

fn default_true() -> bool { true }
```

> `#[serde(default = "default_true")]` 確保 JS 端不傳時行為與升級前一致（保 PR B / PR C 不受影響）。

- [ ] **Step 2: 改 solve() 把 field 傳下去**

`raphael-wasm-wrapper/src/lib.rs:119-122`：

```rust
let solver_settings = SolverSettings {
    simulator_settings,
    allow_non_max_quality_solutions: true,
};
```

改為：

```rust
let solver_settings = SolverSettings {
    simulator_settings,
    allow_non_max_quality_solutions: config.allow_non_max_quality_solutions,
};
```

- [ ] **Step 3: 重 build WASM**

```bash
cd raphael-wasm-wrapper
RUSTUP_TOOLCHAIN=nightly wasm-pack build --target web --out-dir ../public/solver-wasm
cd ..
npm run patch-wasm
```

- [ ] **Step 4: Smoke test 既有功能不變**

```bash
npm test
```

Expected: 全綠（既有測試不傳新 field，serde default 回 `true`，行為不變）。

- [ ] **Step 5: Commit**

```bash
git add raphael-wasm-wrapper/src/lib.rs public/solver-wasm/
git commit -m "feat(wasm): expose allow_non_max_quality_solutions to JS"
```

---

## Task 6 — Sprint 2 / TS types + worker pass-through (PR D, part 2)

**Files:**
- Modify: `src/solver/raphael.ts` — `SolverConfig` 加 `strict_quality?: boolean`；export `NO_SOLUTION_MESSAGE` 常數
- Modify: `src/solver/solver-worker.ts:configToWasmSettings` — 對應到新 field；使用 `NO_SOLUTION_MESSAGE` 取代字面字串

**Pre-flight context:**
- `solver-worker.ts:202` 目前把 wasm 的 `NoSolution` 翻成中文「找不到可行的製作方案，請確認裝備數值與配方是否正確」
- Task 7 需要在 batch-optimizer 偵測 NoSolution 走 fallback，**不該把這條字串複製到第二個檔案**
- 抽 `NO_SOLUTION_MESSAGE` 常數 + `isNoSolutionError` helper 是這個 Task 的副產出

- [ ] **Step 1: 改 raphael.ts SolverConfig + 加 NoSolution helper**

在 `src/solver/raphael.ts:27` `use_trained_eye: boolean` 行之後加：

```ts
  /**
   * When true, instructs raphael-rs to return NoSolution if target quality is
   * unachievable (instead of best-effort sub-target solution). Used by Phase 1
   * HQ feasibility probe in batch-optimizer. Defaults to false (lenient mode).
   */
  strict_quality?: boolean
```

在檔尾追加：

```ts
/**
 * Localised message emitted by the worker when raphael returns NoSolution.
 * Exported so callers (batch-optimizer) can detect this case without
 * pattern-matching arbitrary upstream Debug strings.
 */
export const NO_SOLUTION_MESSAGE = '找不到可行的製作方案，請確認裝備數值與配方是否正確'

export function isNoSolutionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg === NO_SOLUTION_MESSAGE || msg.includes('NoSolution')
}
```

- [ ] **Step 2: solver-worker.ts 使用常數**

`src/solver/solver-worker.ts:202` 區塊：

```ts
error: msg === 'NoSolution' ? '找不到可行的製作方案，請確認裝備數值與配方是否正確' : msg,
```

改為（檔頭 import 區塊加 `NO_SOLUTION_MESSAGE`）：

```ts
error: msg === 'NoSolution' ? NO_SOLUTION_MESSAGE : msg,
```

- [ ] **Step 3: 改 configToWasmSettings**

`src/solver/solver-worker.ts:88-118` 的 `configToWasmSettings` 函式，在 return 物件最後一行 `adversarial: false,` 之後加：

```ts
    adversarial: false,
    allow_non_max_quality_solutions: !config.strict_quality,
```

> 注意極性反轉：`strict_quality: true` ↔ `allow_non_max_quality_solutions: false`。Task 7 用 `isNoSolutionError` 偵測，不再做字串 regex。

- [ ] **Step 4: Type-check + 既有測試**

```bash
npm run type-check
npm test
```

Expected: 全綠。**不寫新的 strict-quality unit test** —— vitest jsdom 無法載入真實 WASM，`waitForWasm()` 會 hang。Strict mode 行為驗證走兩條路徑：
1. Task 7 Step 4 在瀏覽器 DevTools 手動 smoke
2. PR D gate user 跑 batch dataset 觀察 [bperf] wasmDur 差

- [ ] **Step 5: Commit**

```bash
git add src/solver/raphael.ts src/solver/solver-worker.ts
git commit -m "feat(solver): wire strict_quality flag + NoSolution helper"
```

---

## Task 7 — Sprint 2 / batch-optimizer strict probe (PR D, part 3)

**Files:**
- Modify: `src/services/batch-optimizer.ts:optimizeRecipe` — HQ-required 配方先跑 strict probe，`localStorage.__bperfForceLenient === '1'` 時 skip
- Modify: `CLAUDE.md` — Dev Benchmarks 段落補 `__bperfForceLenient` 用法

**Pre-flight context:**
- `optimizeRecipe` 現在無條件呼叫 `solveCraft(solverConfig, onSolverProgress)`
- HQ-required 判定：`recipe.canHq === true` 且 `solverConfig.hq_target === true`
- 升級後（PR B）的 raphael 對 HQ-unachievable 配方已含 PR #337（skip StepLbSolver），strict mode 應該更快返回
- **`__bperfForceLenient` runtime flag**：dev 端在 DevTools 設 `localStorage.__bperfForceLenient = '1'` 可 skip strict probe 走純 lenient，**免 git stash 切版本對比 wasmDur**（Step 4 用得到）

- [ ] **Step 1: 改 optimizeRecipe**

`src/services/batch-optimizer.ts:42-54` 區塊：

```ts
  const craftParams = recipeToCraftParams(recipe, gearset)
  if (buffs) { /* ... */ }
  const solverConfig = craftParamsToSolverConfig(craftParams)
  const solverResult = await solveCraft(solverConfig, onSolverProgress)
  const simResult = await simulateCraft(solverConfig, solverResult.actions)
```

改為（檔頭 import 區塊加 `isNoSolutionError`）：

```ts
import { isNoSolutionError } from '@/solver/raphael'

// Dev escape hatch: skip the strict probe entirely so a single build can
// produce both lenient and strict-probe timings via DevTools toggling.
// Read inside the function (not at module load) so toggling is hot.
function shouldForceLenient(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('__bperfForceLenient') === '1'
  } catch { return false }
}

// ...
  const craftParams = recipeToCraftParams(recipe, gearset)
  if (buffs) { /* ... unchanged ... */ }
  const solverConfig = craftParamsToSolverConfig(craftParams)

  // Strict probe: if recipe is HQ-eligible and we're targeting HQ, ask the
  // solver to return NoSolution if target is unreachable. raphael-rs skips
  // expensive precompute on unachievable cases (upstream PR #337), so the
  // probe is fast on HQ-impossible recipes and equivalent on achievable ones.
  let solverResult
  const useStrict = recipe.canHq && solverConfig.hq_target && !shouldForceLenient()
  if (useStrict) {
    try {
      solverResult = await solveCraft({ ...solverConfig, strict_quality: true }, onSolverProgress)
    } catch (err) {
      // NoSolution → fall back to lenient solve so caller still gets a build path
      // (batch-optimizer's downstream HQ-deficit logic handles "not double max").
      if (isNoSolutionError(err)) {
        solverResult = await solveCraft(solverConfig, onSolverProgress)
      } else {
        throw err
      }
    }
  } else {
    solverResult = await solveCraft(solverConfig, onSolverProgress)
  }
  const simResult = await simulateCraft(solverConfig, solverResult.actions)
```

> **設計重點**：strict probe 失敗時不直接 throw —— 仍跑 lenient solve 取得 action sequence，讓下游 `qualityDeficit` 計算照常進行；唯一差別是 strict probe 在 unachievable 配方能讓 raphael 早退，省時。`__bperfForceLenient` 只給 dev benchmark 用，**production 沒人會去 DevTools 設**。

- [ ] **Step 2: 跑既有單元測試**

```bash
npm test -- batch-optimizer
npm run type-check
```

Expected: 全綠（行為對 achievable recipe 不變；unachievable 多一次失敗 probe + fallback，但結果相同）。

- [ ] **Step 3: 更新 CLAUDE.md**

在「Dev Benchmarks」段落最後追加：

```markdown
- `localStorage.__bperfForceLenient = '1'`（DevTools console）→ batch-optimizer skip strict probe，所有 recipe 走 lenient solve。配合 BenchPanel 跑兩次（toggle on / off）即可拿 strict 收益對比，**免 git stash 切版本**。
```

- [ ] **Step 4: Commit**

```bash
git add src/services/batch-optimizer.ts CLAUDE.md
git commit -m "perf(batch): probe HQ feasibility before lenient solve

For HQ-eligible recipes targeting max quality, first ask the solver with
strict_quality=true. raphael skips StepLbSolver precompute when the target
is unreachable (upstream PR #337), so the probe returns NoSolution fast on
HQ-impossible recipes. Falls back to lenient solve on NoSolution so the
downstream HQ-deficit logic still runs.

Adds localStorage.__bperfForceLenient runtime flag so a single build can
emit both strict-probe and lenient timings for dev benchmark comparison."
```

- [ ] **Step 5: 驗證 strict probe 真的有省時間（用 BenchPanel + 同一 build）**

> **PR E 必須先 ship**，此 step 才能拿到 wasmDur 對比。subagent 不要嘗試自跑，在 PR D gate report 提示 user。

User 步驟（瀏覽器 + DevTools console）：

1. `npm run dev`，瀏覽 `/#/batch?bench=1`
2. DevTools console 設 `localStorage.__bperfForceLenient = '1'`
3. 按 BenchPanel 「Run dataset-2」，**Copy CSV** 存為 `lenient.csv`
4. DevTools console 清 flag：`localStorage.removeItem('__bperfForceLenient')`
5. 再按 「Run dataset-2」，Copy CSV 存為 `strict.csv`
6. 比對：HQ-unachievable recipe（spec §1 列出 4 個）的 `wasm_dur_ms` 在 strict.csv 應 < 50% lenient.csv

若 strict wasmDur 沒明顯下降，**走 spec §7.5 fallback**（hand-rolled prefilter shadow mode）。

- [ ] **Step 6: PR D 合併 gate**

回報模板：

```
PR D (Sprint 2) ready for benchmark:
- npm run type-check: PASS
- npm test -- batch-optimizer: PASS
Awaiting user:
1. BenchPanel 3-dataset browser benchmark vs Sprint 0 baseline (ds2 應顯著下降)
2. BenchPanel + __bperfForceLenient toggle 對拍（Task 7 Step 5）
若 ds2 沒進步 >30% 或 strict wasmDur 沒砍 50%，觸發 spec §7.5 fallback。
```

---

## Task 8 — Sprint 3 / solver-worker.ts wasmDur (PR E, part 1)

**Files:**
- Modify: `src/solver/solver-worker.ts` — solve handler 量 `wasmDur` 並 post
- Modify: `src/solver/raphael.ts:SolverResponse` — 加 `wasmDur?: number`

- [ ] **Step 1: 改 SolverResponse type**

`src/solver/raphael.ts:113-123` 區塊裡的 `SolverResponse` interface 加一行：

```ts
export interface SolverResponse {
  type: 'result' | 'error' | 'progress' | 'ready' | 'init-error' | 'simulate-result' | 'simulate-detail-result'
  result?: SolverResult
  simulateResult?: SimulateResult
  simulateDetailResult?: SimulateDetailResult
  error?: string
  progress?: number
  requestId?: number
  /** Wall time spent inside wasmSolve() in ms. Only set on 'result' messages. */
  wasmDur?: number
}
```

- [ ] **Step 2: 改 solver-worker.ts**

`src/solver/solver-worker.ts:164-197` 的 `solve` 分支，把 `wasmSolve!(settings)` 呼叫前後夾 `performance.now()`：

```ts
  if (type === 'solve') {
    try {
      const progressUpdate: SolverResponse = { type: 'progress', progress: 10, requestId }
      self.postMessage(progressUpdate)

      const settings = configToWasmSettings(config)

      const progressUpdate2: SolverResponse = { type: 'progress', progress: 30, requestId }
      self.postMessage(progressUpdate2)

      const solveStart = performance.now()
      const wasmResult = wasmSolve!(settings)
      const wasmDur = performance.now() - solveStart

      const progressUpdate3: SolverResponse = { type: 'progress', progress: 90, requestId }
      self.postMessage(progressUpdate3)

      // ... existing mappedActions / result code ...

      const resultResponse: SolverResponse = { type: 'result', result, requestId, wasmDur }
      self.postMessage(resultResponse)
    } catch (err) { /* unchanged */ }
  }
```

> **量測點精確說明**：`wasmDur` 涵蓋整個 `wasmSolve()` 同步呼叫，包含 rayon precompute + 主搜尋。不含 `configToWasmSettings` 與 action 映射。`wasm-bindgen` 對 `pub fn solve(...) -> Result<JsValue, JsValue>` 產的 binding 是同步的 —— Step 3 用 grep 確認。

- [ ] **Step 3: 確認 wasmSolve 是同步 binding**

```bash
grep -E "(export function|export async function) solve" public/solver-wasm/raphael_wasm_wrapper.js
```

Expected: 印出 `export function solve(config_js)` —— **不可有 `async` keyword**。若有，`performance.now()` 量到的不是真正 solver 耗時，subagent BLOCKED 回報。

- [ ] **Step 4: Type-check**

```bash
npm run type-check
```

Expected: 無 error。**不跑 npm test** —— `wasmDur` 是新增 optional 欄位，無法在現有測試 fail；行為驗證留給 PR E gate user benchmark。

- [ ] **Step 5: Commit**

```bash
git add src/solver/solver-worker.ts src/solver/raphael.ts
git commit -m "feat(solver): measure wasm solve duration and post wasmDur"
```

---

## Task 9 — Sprint 3 / batch-optimizer log wasmDur (PR E, part 2)

**Files:**
- Modify: `src/solver/worker.ts:solveCraft` — 透傳 `wasmDur` 給 caller
- Modify: `src/services/batch-optimizer.ts:optimizeRecipe` — `console.debug` `[bperf]` log

**Pre-flight context:**
- `worker.ts:handleRoutedResponse:115` `data.type === 'result'` 分支只 resolve `data.result`
- `worker.ts:solveCraft:185-214` 已用 `trackEvent('solver_complete', ...)`，可加 `wasmDur` 到 payload

**設計決定**：`wasmDur` 不上 public `SolverResult` interface（那是 caller 用的業務結果）；改用 internal extended type，只在 `solveCraft` 的 return 攜帶。Batch-optimizer 之外的 caller（`SolverPanel.vue` 等）拿到的 result shape 不變。

- [ ] **Step 1: 加 internal extended type**

`src/solver/raphael.ts`，在 `SolverResult` interface 之後追加：

```ts
/**
 * Internal extension carrying timing data from the worker.
 * Only used by batch-optimizer's [bperf] log; not part of the public solver
 * contract — keep wasmDur off SolverResult so simulator UI etc. aren't coupled.
 */
export interface SolverResultWithTiming extends SolverResult {
  wasmDur?: number
}
```

- [ ] **Step 2: worker.ts handleRoutedResponse 透傳**

`src/solver/worker.ts:115` 改為：

```ts
  if (data.type === 'result' && data.result) {
    pending.resolve({ ...data.result, wasmDur: data.wasmDur })
  }
```

- [ ] **Step 3: solveCraft return type 升級**

`src/solver/worker.ts:185-214` 的 `solveCraft` signature 從 `Promise<SolverResult>` 改成 `Promise<SolverResultWithTiming>`，並把 analytics payload 加 `wasm_duration_ms`：

```ts
export function solveCraft(
  config: SolverConfig,
  onProgress?: (percent: number) => void,
): Promise<SolverResultWithTiming> {
  // ...
  return new Promise<SolverResultWithTiming>((resolve, reject) => {
    pendingRequests.set(requestId, {
      onProgress,
      resolve: (r: SolverResultWithTiming) => {
        trackEvent('solver_complete', {
          duration_ms: Math.round(performance.now() - startedAt),
          action_count: r.actions.length, steps: r.steps,
          wasm_duration_ms: r.wasmDur !== undefined ? Math.round(r.wasmDur) : undefined,
        })
        resolve(r)
      },
      // ... reject unchanged
    })
    dispatchOrQueue('solve', { config: { ...config } }, requestId)
  })
}
```

> Caller side 不需改動 —— `SolverResultWithTiming extends SolverResult`，既有 destructure 都還合法。

- [ ] **Step 4: batch-optimizer 印 [bperf] log**

`src/services/batch-optimizer.ts:optimizeRecipe`，**在 strict-probe / lenient 兩條路徑會合後**（`const simResult = await simulateCraft(...)` 那行之前）插入：

```ts
  if (solverResult.wasmDur !== undefined) {
    console.debug(
      `[bperf] solve ${recipe.name} wasmDur=${solverResult.wasmDur.toFixed(0)}ms steps=${solverResult.actions.length}`
    )
  }
```

> 此位置 strict-fallback / lenient 兩條路徑都已 assign `solverResult`，一次 log 涵蓋所有情境。

- [ ] **Step 5: Type-check**

```bash
npm run type-check
```

Expected: 無 error。`SolverResultWithTiming` extends `SolverResult`，既有呼叫端不需改 signature。**不跑 npm test** —— 純新增 optional 欄位 + console.debug，無 runtime 行為差。

- [ ] **Step 6: Commit**

```bash
git add src/solver/raphael.ts src/solver/worker.ts src/services/batch-optimizer.ts
git commit -m "feat(batch): log per-recipe wasmDur for solver attribution"
```

- [ ] **Step 7: PR E 合併 gate**

回報模板：

```
PR E (Sprint 3) ready for benchmark:
- npm run type-check: PASS
- wasmSolve sync check: PASS (grep confirmed no `async`)
Awaiting user: BenchPanel 3-dataset benchmark（/#/batch?bench=1）.
Expected: BenchPanel wasm_dur_ms 欄位開始有值（PR A 跑時是 '—'）；
LV100 recipes 的 wasm_dur_ms 應 > LV9X 的 ~2-3×。
```

---

## Task 10 — §7.5 datasets-1/2 補檔（PR F）

**Branch:** `perf/hq-feasibility-prefilter`（已從 main 切，main 含 PR A-E + revert）
**Spec:** `docs/superpowers/specs/2026-05-12-batch-perf-next-sprints-design.md` §7.5.1

**Files:**
- Create: `scripts/dev/datasets/dataset-1.json` (6 recipes from perf-benchmarks.md lines 10-19)
- Create: `scripts/dev/datasets/dataset-2.json` (7 recipes from perf-benchmarks.md lines 73-81)

**Pre-flight context:**
- `scripts/dev/datasets/dataset-3.json` 已存在 (PR A T0)，schema 為「`recipeId` + `rlvl/progress/quality/durability` + 5000/5000/600 placeholder gearset 欄位 + `manipulation: true`」
- Dataset-1 / -2 沿用 schema；gearset placeholder 欄位 raphael-cli 才用，BenchPanel 改用 stored gearset（PR A 後 fix `f6c1170`）
- Recipe ID 查表方式（同 PR A T0 Step 1）：`public/data/items/zh-TW.json` → 找 item ID → `public/data/recipes.json` 比對 itemResult → 取 id/rlv/factors → `public/data/rlt.json` 取 base + 套 factors

- [ ] **Step 1: 建 dataset-1.json**

6 recipes（perf-benchmarks.md `## Dataset 1`）：
- 相思木砂輪機 (lv97 木工)
- 鈷鎢禦敵坎肩 (lv95 甲冑)
- 粉綠柱石詠咒半指手套 (lv94 金工)
- 卡岡圖亞革製敵軟甲褲 (lv99 皮革)
- 薄絹巧匠工作帽 (lv94 裁縫)
- 鮭魚乾 (lv97 烹調)

Schema 同 dataset-3.json：`name`, `recipes: [{label, recipeId, quantity, rlvl, progress, quality, durability, craftsmanship, control, cp, level, manipulation}, ...]`

- [ ] **Step 2: 建 dataset-2.json**

7 recipes：相思木符杖 (lv97) / 卡扎納爾手鋸 (lv100) / 粉綠柱石詠咒半指手套 (lv94) / 卡岡圖亞革禦敵軟甲褲 (lv99) / 薄絹禦敵腿套 (lv95) / 智力之寶藥 (lv100) / 奶油熱巧克力 (lv96)

注意「卡扎納爾手鋸 / 智力之寶藥」與 dataset-3 重疊 recipe，可從 dataset-3.json 直接複製對應 row 換 quantity。「粉綠柱石詠咒半指手套」與 dataset-1 重疊同理。

- [ ] **Step 3: bench:solver smoke**

```bash
npm run bench:solver -- --dataset=dataset-1
npm run bench:solver -- --dataset=dataset-2
```

Expected：所有 recipe 跑得過、無 cli error；wall time 順序與 perf-benchmarks.md lines 100-109 / 215-227 的相對形狀一致（lv100 重，lv94-95 輕）。

- [ ] **Step 4: Commit**

```bash
git add scripts/dev/datasets/dataset-1.json scripts/dev/datasets/dataset-2.json
git commit -m "feat(dev): dataset-1 + dataset-2 fixtures for prefilter shadow"
```

- [ ] **Step 5: PR F gate**

回報：「PR F (datasets) ready. bench:solver dataset-1 + dataset-2 PASS. Awaiting user: BenchPanel 跑 dataset-1 / dataset-2 確認 8 row + 7 row render OK.」

---

## Task 11 — §7.5 shadow log（PR G）

**Spec:** §7.5.2

**Files:**
- Modify: `src/services/batch-optimizer.ts:optimizeRecipe` — 加 `[bperf-prefilter]` console.debug
- Modify: `src/components/batch/BenchPanel.vue` — monkey-patch 抓 `[bperf-prefilter]`，CSV 多 3 欄

**Pre-flight context:**
- `canReachHQQuality` import from `@/services/feasibility-prefilter` 已存在（被 `buff-recommender` 等用）
- `simResult` 在 `optimizeRecipe` 中已有 (`await simulateCraft`)，可直接讀 `simResult.quality` / `simResult.max_quality`
- BenchPanel 已有 `wasmDurByLabel` map 模式，加 `prefilterByLabel` 並行抓

- [ ] **Step 1: 改 optimizeRecipe**

在 `const simResult = await simulateCraft(...)` 之後、`[bperf]` log 之前（PR E 後該 log 在 `[bperf-prefilter]` 之上）插入：

```ts
if (recipe.canHq && solverConfig.hq_target) {
  const predicted = canReachHQQuality(recipe, gearset, buffs)
  const actualReached = simResult.quality >= simResult.max_quality
  console.debug(
    `[bperf-prefilter] recipe=${recipe.name} predicted=${predicted} ` +
    `actual_reached=${actualReached} max_q=${simResult.max_quality} ` +
    `final_q=${simResult.quality} cp=${gearset.cp}`
  )
}
```

Import：`import { canReachHQQuality } from '@/services/feasibility-prefilter'`（檔頭加；若已存在不重複）。

- [ ] **Step 2: 改 BenchPanel.vue**

`BenchPanel.vue:script setup` 在 `wasmDurByLabel` 宣告附近加：

```ts
const prefilterByLabel = new Map<string, { predicted: boolean; actualReached: boolean; finalOverMax: number }>()
```

`console.debug` monkey-patch 區塊裡，現有 `[bperf]` regex 之後加：

```ts
const p = /\[bperf-prefilter\] recipe=(.+?) predicted=(true|false) actual_reached=(true|false) max_q=(\d+) final_q=(\d+) /.exec(msg)
if (p) {
  const max = Number(p[4]), final = Number(p[5])
  prefilterByLabel.set(p[1], {
    predicted: p[2] === 'true',
    actualReached: p[3] === 'true',
    finalOverMax: max > 0 ? final / max : 1,
  })
}
```

`BenchRow` interface 加 3 optional 欄位：`predicted?: boolean`, `actualReached?: boolean`, `finalOverMax?: number`。

`rows.value.push({...})` block 從 `prefilterByLabel.get(recipe.name)` 拿值並合進 row。

Table thead 加 3 個 `<th>`（`Predicted` / `Reached` / `Final/Max`），tbody 對應 `<td>`：

```vue
<td>{{ r.predicted === undefined ? '—' : (r.predicted ? '✓' : '✗') }}</td>
<td>{{ r.actualReached === undefined ? '—' : (r.actualReached ? '✓' : '✗') }}</td>
<td>{{ r.finalOverMax === undefined ? '—' : (r.finalOverMax * 100).toFixed(1) + '%' }}</td>
```

`toCsv()` header 改：

```
'label,wall_ms,wasm_dur_ms,steps,predicted,actual_reached,final_over_max,error'
```

每 row 對應加 3 欄。

- [ ] **Step 3: Type-check**

```bash
npx vue-tsc -b
```

Expected：7 pre-existing errors only。

- [ ] **Step 4: Commit**

```bash
git add src/services/batch-optimizer.ts src/components/batch/BenchPanel.vue
git commit -m "feat(batch): shadow log canReachHQQuality prediction for §7.5

Adds [bperf-prefilter] console.debug emitting (predicted, actual_reached,
max_q, final_q, cp) per HQ-targeted recipe. BenchPanel captures the
log into 3 new CSV columns. Pure observation, no behaviour change.

Used to gather 21-recipe prediction-vs-actual matrix for calibrating
canReachHQQualityStrict in PR H."
```

- [ ] **Step 5: PR G gate**

回報：

```
PR G (shadow log) ready:
- npx vue-tsc -b: 7 pre-existing errors only
- type-check confirmed [bperf-prefilter] format matches BenchPanel regex
Awaiting user:
1. npm run dev → /#/batch?bench=1
2. Run dataset-1, copy CSV → ds1.csv
3. Run dataset-2, copy CSV → ds2.csv
4. Run dataset-3, copy CSV → ds3.csv
5. Hand 3 CSVs back; controller will analyse 21 (predicted, actual_reached) rows.
```

---

## Task 12 — §7.5 calibrate + enable（PR H）

**Spec:** §7.5.3 / §7.5.4 / §7.5.5

**Files:**
- Modify: `src/services/feasibility-prefilter.ts` — 加 `canReachHQQualityStrict` (new function, not replacing existing one)
- Create: `src/__tests__/services/feasibility-prefilter.test.ts` extension — 21-recipe ground truth fixture
- Modify: `src/services/batch-optimizer.ts:optimizeRecipe` — prefilter-gated strict probe

**Pre-flight context:**
- PR G shadow CSV 由 controller 看過、係數 + 公式拓樸已決定（具體數值待 controller fill in）
- 既有 `canReachHQQuality` 不動（buff-recommender / self-craft-candidates 還用），新 `canReachHQQualityStrict` 是並行 export
- PR D 留下的 `strict_quality?` flag + `isNoSolutionError` helper + `NO_SOLUTION_MESSAGE` 全部復用

- [ ] **Step 1: 加 canReachHQQualityStrict**

`src/services/feasibility-prefilter.ts` 加新 export（公式由 controller PR G gate 後決定，subagent **不要先猜係數**，等 controller 把具體數值傳下來）：

```ts
// Tighter formula calibrated against 21-recipe shadow data (PR G).
// See docs/superpowers/specs/2026-05-12-batch-perf-next-sprints-design.md §7.5.3.
export const QUALITY_PHASE_UPPER_BOUND_MULTIPLIER_STRICT = <CONTROLLER_TO_FILL>
export const MARGIN_STRICT = <CONTROLLER_TO_FILL>

export function canReachHQQualityStrict(
  recipe: Recipe,
  gearset: GearsetStats,
  buffs?: { food: FoodBuff | null; medicine: FoodBuff | null },
): boolean {
  const stats = applyBuffsToStats(
    { craftsmanship: gearset.craftsmanship, control: gearset.control, cp: gearset.cp },
    buffs,
  )
  const baseQuality = computeBaseQuality(stats.control, gearset.level, recipe.recipeLevelTable)
  const maxQualitySteps = Math.floor(stats.cp / AVG_QUALITY_CP_COST)
  const maxAchievable = baseQuality * QUALITY_PHASE_UPPER_BOUND_MULTIPLIER_STRICT * maxQualitySteps * MARGIN_STRICT
  return maxAchievable >= recipe.recipeLevelTable.quality
}
```

> `<CONTROLLER_TO_FILL>` 是 placeholder，subagent BLOCKED 若 controller 沒在 task prompt 給數值。

- [ ] **Step 2: 21-recipe ground truth unit test**

在 `src/__tests__/services/feasibility-prefilter.test.ts` 既有測試之後加：

```ts
describe('canReachHQQualityStrict — 21-recipe ground truth', () => {
  // Fixture: each row is (recipe params, gearset, expected_predicted)
  // Source: shadow CSV from PR G, dataset-1/2/3 × real-gearset
  // Bake-in: any future formula change that flips a row fails CI.
  const cases: Array<{ name: string; rlvl: number; progress: number; quality: number; durability: number; cp: number; control: number; craftsmanship: number; level: number; expected: boolean }> = [
    // controller fills 21 rows from shadow CSV
  ]

  for (const c of cases) {
    it(`predicts ${c.expected} for ${c.name}`, () => {
      // build minimal Recipe + GearsetStats stub
      // call canReachHQQualityStrict
      // expect result === c.expected
    })
  }
})
```

**21 rows 由 controller 在 task prompt 中提供**（從 PR G shadow CSV 整理過後），subagent 不要自己生 fixture。

- [ ] **Step 3: optimizeRecipe 加 prefilter-gated strict probe**

`src/services/batch-optimizer.ts:optimizeRecipe`：

加 imports：

```ts
import { canReachHQQualityStrict } from '@/services/feasibility-prefilter'
import { isNoSolutionError } from '@/solver/raphael'
```

把現有 `const solverResult = await solveCraft(solverConfig, onSolverProgress)` 換成：

```ts
let solverResult
if (recipe.canHq && solverConfig.hq_target) {
  const predicted = canReachHQQualityStrict(recipe, gearset, buffs)
  if (!predicted) {
    try {
      solverResult = await solveCraft({ ...solverConfig, strict_quality: true }, onSolverProgress)
    } catch (err) {
      if (isNoSolutionError(err)) {
        solverResult = await solveCraft(solverConfig, onSolverProgress)
      } else { throw err }
    }
  } else {
    solverResult = await solveCraft(solverConfig, onSolverProgress)
  }
} else {
  solverResult = await solveCraft(solverConfig, onSolverProgress)
}
```

Shadow log（PR G 加的 `[bperf-prefilter]`）**保留不刪** — enable 後仍可監控公式漂移。

- [ ] **Step 4: 跑全測試 + type-check**

```bash
npm test
npx vue-tsc -b
```

Expected：397 + 新 21 個 prefilter test 全 pass；type-check 7 pre-existing errors only。

**Fail handling**：若新 unit test 某 row fail，代表 PR G CSV 與校準公式對不上，**STATUS BLOCKED**，回報哪幾 row fail + 公式套出來的 `maxAchievable` 數值，controller 重校。

- [ ] **Step 5: Commit**

```bash
git add src/services/feasibility-prefilter.ts src/__tests__/services/feasibility-prefilter.test.ts src/services/batch-optimizer.ts
git commit -m "perf(batch): gate strict probe on canReachHQQualityStrict prefilter

PR D strict probe was net -47% wall because every HQ-targeted recipe paid
the strict-mode search cost, but only the truly-unreachable ones benefited
from the early-exit. PR G shadow data over 21 recipes showed which
recipes raphael actually fails to HQ for the user's real gearset.

This PR calibrates canReachHQQualityStrict to 0 false negative against
that fixture, then only invokes strict probe when the prefilter predicts
unachievable. Achievable recipes go straight to lenient (zero strict
tax). Unachievable recipes still benefit from raphael's PR #337
skip-precompute fast path. NoSolution from strict probe falls back to
lenient as safety net for future formula drift."
```

- [ ] **Step 6: PR H gate**

回報：

```
PR H (calibrate + enable) ready:
- npm test: PASS (397 + 21 new)
- npx vue-tsc -b: 7 pre-existing errors only
Awaiting user:
1. BenchPanel /#/batch?bench=1 → Run dataset-3
2. Confirm dataset-3 wall ≤ previous lenient default (68.9s @ commit 6444a17)
3. Inspect [bperf-prefilter] log emissions: confirm predicted column still
   matches actual_reached row-by-row (0 false negative live verification)
```

---

## Schedule（呼應 spec §10）

```
Week 1
  Day 0   ── PR A · dev benchmark harness (T0 CLI + T0.5 BenchPanel) ✓ done
  Day 1   ── PR B · Sprint 0 upgrade (T1-T2) + user BenchPanel ✓ done
  Day 2   ── PR C · Sprint 1 rayon limit (T3-T4) + user BenchPanel ✓ done
  Day 3-4 ── PR E · Sprint 3 timer (T8-T9) + user BenchPanel wasm_dur_ms ✓ done

Week 2
  Day 1   ── PR D · Sprint 2 strict probe (T5-T7) ✓ shipped then reverted (-47% wall)
  Day 2   ── PR D benchmark：dataset-3 strict 89.5s vs lenient 68.9s → revert Task 7
  Day 3+  ── PR D 觸發 §7.5 fallback → PR F/G/H below

Week 3 (§7.5 fallback — branch perf/hq-feasibility-prefilter)
  Day 1   ── PR F · datasets (T10) — dataset-1.json + dataset-2.json
  Day 1   ── PR G · shadow log (T11) — [bperf-prefilter] + BenchPanel CSV 3 cols
  Day 1-2 ── user BenchPanel 3 dataset → 21-recipe shadow CSV
  Day 2   ── controller analysis → 校準方向
  Day 2-3 ── PR H · calibrate + enable (T12) — canReachHQQualityStrict + gated probe
  Day 3   ── user BenchPanel dataset-3 wall ≤ lenient default、0 false negative
```

> **PR 順序刻意把 PR E 排在 PR D 之前**：Sprint 3 timer 可在 Sprint 2 動工前就量到 PR C 改動的真實 wasmDur，把 contention 修正與 strict probe 收益分開觀察。
>
> **PR D 後切 §7.5 而非繼續硬調 strict probe**：實測證實 strict 對全 achievable dataset net negative，硬調沒有出路。改走 prefilter-gated 路徑，讓 strict 只服務真實 unreachable recipe。Sprint 2 留下的 wrapper field + TS infra 在 PR H 全部復用。

---

## Open Risks / Rollback

- **PR B 行為差異**（MuscleMemory）：若 npm test fail，subagent 應**先看 fail 是不是 action 序列變動而非 logic bug**，再決定 BLOCKED 或修測試。Controller 介入決定。
- **PR C 低 hwc 機器未驗**：`deriveRayonThreads(2) === 1`，rayon 退化為 serial 路徑未實機 smoke。PR C commit message 須明標此限制；4-core 機 dataset 1 若退步 >10%，調整路徑：擴充 `pool-config.ts:deriveRayonThreads` 加 hwc-aware heuristic（不要散在 worker 內）。
- **PR D strict probe 對 achievable recipe 變慢**：spec §7.3 列為已知風險，緩解依賴 PR B 已含 PR #337。若實測 ds1 變慢 >10%，**寫 follow-up spec 設計 stat-margin heuristic**（不在本計畫範圍硬塞），或直接走 spec §7.5 hand-rolled prefilter fallback。
- **PR E 量測點失真**：Task 8 Step 3 已 grep 驗證 `wasmSolve` 為 sync binding。若 grep 印出 `async`，subagent BLOCKED 回報，**不要嘗試 await 包裝** —— async binding 的耗時需用其他 instrumentation（例如 wrapper 內側 `performance.now()`，要動 Rust）。
- **PR F dataset 抓錯**：dataset-1/2 部分 recipe 已在 dataset-3.json，可直接複製 row 避免重複查表。Smoke gate 是 `npm run bench:solver --dataset=dataset-X` 全 8 + 7 recipe 跑得過。
- **PR G 邏輯滲漏**：shadow log block 在 simulate 之後、`[bperf]` 之前，**不要動 simResult 之後的 hqAmounts / qualityDeficit 計算**。BenchPanel monkey-patch 加 prefilter regex 要與既有 `[bperf]` regex 並存，**先試新 regex 再 fall through 既有**。
- **PR H 21-row fixture 由 controller 提供**：subagent 不要自己生 ground truth 數據，PR G 用 user 真實 gearset 跑出來的 CSV 是唯一可信來源。若 PR G CSV 與校準公式對不上某 row，**BLOCKED 回報該 row + 公式 maxAchievable 數值**，controller 重校。
- **PR H 既有 caller 隔離**：`canReachHQQualityStrict` 是 **新 export**，舊 `canReachHQQuality` 不動。Subagent 改動限定於 `optimizeRecipe`；任何同 commit 觸碰 `buff-recommender.ts` / `self-craft-candidates.ts` 視為 scope creep，spec review reject。

---

## References

- Spec：`docs/superpowers/specs/2026-05-12-batch-perf-next-sprints-design.md`
- Investigation：`docs/superpowers/specs/2026-05-12-rayon-contention-investigation-design.md`
- 前一輪 plan：`docs/superpowers/plans/2026-05-12-self-craft-validation-perf.md`
- raphael-rs upstream `aafcbb0` (2026-05-10) / pinned `47c4ea7` (2026-03-15)
- 相關 git tags: `bench/baseline`, `bench/pr4-final`, （此輪新增）`sprint-0/baseline`
