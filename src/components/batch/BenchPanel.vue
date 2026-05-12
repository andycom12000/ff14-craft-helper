<script setup lang="ts">
import { ref } from 'vue'
import { getRecipe } from '@/api/xivapi'
import { useGearsetsStore, type GearsetStats } from '@/stores/gearsets'
import { CRAFT_TYPE_TO_JOB } from '@/utils/jobs'
import { optimizeRecipe } from '@/services/batch-optimizer'
import { waitForWasm } from '@/solver/worker'

const gearsetsStore = useGearsetsStore()

interface BenchRecipeEntry {
  label: string
  recipeId: number
  quantity: number
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
  predicted?: boolean
  actualReached?: boolean
  finalOverMax?: number
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
  const prefilterByLabel = new Map<string, { predicted: boolean; actualReached: boolean; finalOverMax: number }>()
  const origDebug = console.debug
  console.debug = (...args: unknown[]) => {
    const msg = args.map(a => String(a)).join(' ')
    const m = /\[bperf\] solve (.+?) wasmDur=(\d+(?:\.\d+)?)ms steps=(\d+)/.exec(msg)
    if (m) wasmDurByLabel.set(m[1], { wasmDur: Number(m[2]), steps: Number(m[3]) })
    const p = /\[bperf-prefilter\] recipe=(.+?) predicted=(true|false) actual_reached=(true|false) max_q=(\d+) final_q=(\d+) /.exec(msg)
    if (p) {
      const max = Number(p[4]), final = Number(p[5])
      prefilterByLabel.set(p[1], {
        predicted: p[2] === 'true',
        actualReached: p[3] === 'true',
        finalOverMax: max > 0 ? final / max : 1,
      })
    }
    origDebug.apply(console, args as [])
  }

  try {
    const url = `${import.meta.env.BASE_URL}scripts/dev/datasets/${name}.json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`fetch dataset failed: ${res.status}`)
    const dataset: BenchDataset = await res.json()

    // Without this, the first Promise.allSettled fan-out reaches the worker
    // before init_threads resolves and every solve returns "WASM 求解器尚未初始化完成".
    await waitForWasm()

    const totalStart = performance.now()
    await Promise.allSettled(dataset.recipes.map(async (entry) => {
      const start = performance.now()
      let recipe
      try {
        recipe = await getRecipe(entry.recipeId)
      } catch (err) {
        rows.value.push({ label: entry.label, wallMs: -1, error: `getRecipe ${entry.recipeId}: ${String(err)}` })
        return
      }
      const jobAbbr = CRAFT_TYPE_TO_JOB[recipe.craftType] ?? 'CRP'
      const stored = gearsetsStore.getGearsetForJob(jobAbbr)
      if (!stored) {
        rows.value.push({ label: entry.label, wallMs: -1, error: `no gearset for ${jobAbbr}` })
        return
      }
      const gearset: GearsetStats = {
        level: stored.level,
        craftsmanship: stored.craftsmanship,
        control: stored.control,
        cp: stored.cp,
      }
      try {
        await optimizeRecipe(recipe, gearset)
        const wallMs = performance.now() - start
        const wasm = wasmDurByLabel.get(recipe.name)
        const pf = prefilterByLabel.get(recipe.name)
        rows.value.push({
          label: entry.label,
          wallMs,
          wasmDurMs: wasm?.wasmDur,
          steps: wasm?.steps,
          predicted: pf?.predicted,
          actualReached: pf?.actualReached,
          finalOverMax: pf?.finalOverMax,
        })
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
  const header = 'label,wall_ms,wasm_dur_ms,steps,predicted,actual_reached,final_over_max,error'
  const lines = rows.value.map(r =>
    `${r.label},${Math.round(r.wallMs)},${r.wasmDurMs !== undefined ? Math.round(r.wasmDurMs) : ''},${r.steps ?? ''},${r.predicted === undefined ? '' : r.predicted},${r.actualReached === undefined ? '' : r.actualReached},${r.finalOverMax === undefined ? '' : r.finalOverMax.toFixed(4)},${r.error ?? ''}`
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
        <thead><tr><th>Recipe</th><th>Wall (ms)</th><th>WasmDur (ms)</th><th>Steps</th><th>Predicted</th><th>Reached</th><th>Final/Max</th><th>Error</th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.label">
            <td>{{ r.label }}</td>
            <td>{{ Math.round(r.wallMs) }}</td>
            <td>{{ r.wasmDurMs !== undefined ? Math.round(r.wasmDurMs) : '—' }}</td>
            <td>{{ r.steps ?? '—' }}</td>
            <td>{{ r.predicted === undefined ? '—' : (r.predicted ? '✓' : '✗') }}</td>
            <td>{{ r.actualReached === undefined ? '—' : (r.actualReached ? '✓' : '✗') }}</td>
            <td>{{ r.finalOverMax === undefined ? '—' : (r.finalOverMax * 100).toFixed(1) + '%' }}</td>
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
