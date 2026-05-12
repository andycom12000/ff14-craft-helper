#!/usr/bin/env node
// Run raphael-cli against a JSON dataset and emit wall-time CSV.
// Reference-only timing (native, no pool contention) — NOT a user-facing perf target.
// Sequential by design: each invocation saturates cores via rayon; running in
// parallel would oversubscribe and pollute timing.

import { spawn } from 'node:child_process'
import { readFile, mkdir, writeFile, readdir, stat } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WRAPPER_DIR = resolve(__dirname, '../../raphael-wasm-wrapper')
const TMP_DIR = resolve(__dirname, '../../.tmp/bench')
const TAG = '[bench]'

// raphael-cli is NOT a workspace member of raphael-wasm-wrapper — it lives in the
// upstream raphael-rs workspace pulled via git dep. We resolve the cargo checkout
// path from the wrapper's Cargo.lock and run `cargo run -p raphael-cli` there.
async function resolveRaphaelWorkspace() {
  const lock = await readFile(resolve(WRAPPER_DIR, 'Cargo.lock'), 'utf8')
  const m = lock.match(/git\+https:\/\/github\.com\/KonaeAkira\/raphael-rs(?:\?[^#]*)?#([0-9a-f]{40})/)
  if (!m) throw new Error('raphael-rs git source not found in Cargo.lock')
  const fullSha = m[1]
  const shortSha = fullSha.slice(0, 7)
  const cargoHome = process.env.CARGO_HOME || join(homedir(), '.cargo')
  const checkoutsRoot = join(cargoHome, 'git', 'checkouts')
  let entries
  try {
    entries = await readdir(checkoutsRoot)
  } catch {
    throw new Error(`cargo checkouts dir missing: ${checkoutsRoot}`)
  }
  const raphaelDir = entries.find(e => e.startsWith('raphael-rs-'))
  if (!raphaelDir) throw new Error('no raphael-rs-* in cargo checkouts')
  const wsRoot = join(checkoutsRoot, raphaelDir, shortSha)
  try {
    await stat(join(wsRoot, 'raphael-cli', 'Cargo.toml'))
  } catch {
    throw new Error(`raphael-cli not found at ${wsRoot}; run a wrapper cargo build first to materialize the checkout`)
  }
  return wsRoot
}

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
    'run', '--release', '-p', 'raphael-cli', '--',
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

function runOne(recipe, threads, cwd) {
  return new Promise((res, rej) => {
    const start = performance.now()
    const proc = spawn('cargo', buildCliArgs(recipe, threads), {
      cwd, shell: process.platform === 'win32',
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
  const wsRoot = await resolveRaphaelWorkspace()
  console.log(`${TAG} dataset: ${dataset.name} (${dataset.recipes.length} recipes)`)
  console.log(`${TAG} threads: ${args.threads ?? 'default'}`)
  console.log(`${TAG} workspace: ${wsRoot}`)
  console.log(`${TAG} note: native CLI timing — not comparable to WASM/browser numbers`)
  console.log()

  const rows = []
  for (const recipe of dataset.recipes) {
    process.stdout.write(`${TAG} ${recipe.label.padEnd(40)} `)
    try {
      const r = await runOne(recipe, args.threads, wsRoot)
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
