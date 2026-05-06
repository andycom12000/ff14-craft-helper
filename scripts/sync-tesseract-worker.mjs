#!/usr/bin/env node
// Sync tesseract.js's bundled worker into public/tesseract-shim/worker.min.js
// so our shim (public/tesseract-shim/shim.js) can importScripts it as a
// same-origin file. The shim filters LSTM-only noise from console; see
// public/tesseract-shim/shim.js for context.
//
// Idempotent: skips writes when the bytes already match. Run automatically
// before `vite` (dev) and `vite build` via the predev / prebuild npm hooks.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

// Resolve tesseract.js regardless of whether it's installed in this worktree's
// node_modules or hoisted to a parent (relevant inside git worktrees).
const require = createRequire(import.meta.url)
let SRC
try {
  const pkgPath = require.resolve('tesseract.js/package.json')
  SRC = resolve(dirname(pkgPath), 'dist/worker.min.js')
} catch {
  console.error('[sync-tesseract] cannot resolve tesseract.js — run `npm install` first')
  process.exit(1)
}

const DEST_DIR = 'public/tesseract-shim'
const DEST = `${DEST_DIR}/worker.min.js`

await mkdir(DEST_DIR, { recursive: true })

const src = await readFile(SRC)
let prev
try {
  prev = await readFile(DEST)
} catch {
  prev = null
}

if (prev && prev.equals(src)) {
  console.log('[sync-tesseract] up-to-date')
} else {
  await writeFile(DEST, src)
  console.log(`[sync-tesseract] wrote ${DEST} (${src.byteLength} bytes)`)
}
