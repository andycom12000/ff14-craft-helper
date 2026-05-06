#!/usr/bin/env node
// Patch wasm-bindgen-rayon's generated workerHelpers to use the modern
// single-object init signature, silencing the per-worker
// "using deprecated parameters for the initialization function" warning.
//
// wasm-bindgen-rayon 1.3.0 still emits `pkg.default(module, memory)` (positional),
// which wasm-bindgen 0.2.114 has flagged deprecated. Until the upstream package
// updates, re-run this script after every `wasm-pack build` — it is idempotent.

import { readFile, writeFile } from 'node:fs/promises'
import { glob } from 'node:fs/promises'

const OLD = 'await pkg.default(data.module, data.memory);'
const NEW = 'await pkg.default({ module_or_path: data.module, memory: data.memory });'
const PATTERN = 'public/solver-wasm/snippets/wasm-bindgen-rayon-*/src/workerHelpers.no-bundler.js'

let patched = 0
let skipped = 0

for await (const file of glob(PATTERN)) {
  const src = await readFile(file, 'utf8')
  if (src.includes(NEW)) {
    skipped += 1
    continue
  }
  if (!src.includes(OLD)) {
    console.warn(`[patch] unexpected content in ${file} — neither old nor new init form found`)
    continue
  }
  await writeFile(file, src.replace(OLD, NEW), 'utf8')
  patched += 1
  console.log(`[patch] ${file}`)
}

console.log(`[patch] done — patched=${patched}, already-patched=${skipped}`)
