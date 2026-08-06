#!/usr/bin/env node
// One-time backfill (#202): patch `glance.activeUsers.{total,returningPct}`
// across the gh-data `history/` snapshots to the dimension-less-total
// definition, so the trend series doesn't show a fake step where the
// definition silently changes partway through.
//
// Why this is a SEPARATE script instead of a `ga-analyze.mjs --snapshot`
// flag: this is a one-time migration over already-generated files, not part
// of the daily pipeline. It must patch ONLY the two `activeUsers` leaves —
// re-running the full `buildBundle()` per historical day would retroactively
// apply every OTHER fix that has landed since (e.g. #201's universalis
// real-fail/no-listing split, #196's field cuts) onto data that predates
// them, corrupting history in a different way than the bug it's fixing.
//
// Uses the exact same `buildActiveUsersGlance()` used by the live pipeline
// (imported, not reimplemented) so the backfilled history and today's output
// share one definition — see that function's doc comment in ga-analyze.mjs.
// `new`/`returning` are read from the EXISTING file and left untouched (they
// were already correct single-row user counts, never part of the bug); only
// `total` comes from a fresh GA4 query, scoped to that day's own
// `window.startDate`/`window.endDate` (NOT "Ndaysago", which would shift the
// range relative to today).
//
// Usage:
//   1. npm i -D @google-analytics/data (same setup as ga-analyze.mjs)
//   2. GA_PROPERTY_ID=<id> node scripts/dev/ga-backfill-active-users.mjs \
//        --history <path to gh-data's history/ dir> [--dry-run] [--only YYYY-MM-DD]
//
// --dry-run prints the old→new delta for every file/window without writing.
// --only limits the run to a single day's file, useful for a smoke check
// before committing to the full 71-/77-day run (each window is its own GA4
// request, so a 77-file run issues up to 77×3 = 231 calls — expect it to
// take a while and to respect GA4's request quota).

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { buildClient, runReport, buildActiveUsersGlance } from './ga-analyze.mjs'

function parseArgs(argv) {
  const args = { history: null, dryRun: false, only: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--history') args.history = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--only') args.only = argv[++i]
  }
  return args
}

function die(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.history) die('Missing --history <dir> (a checkout of gh-data\'s history/ folder)')

  const propertyId = process.env.GA_PROPERTY_ID
  if (!propertyId) die('Missing env GA_PROPERTY_ID (numeric GA4 property id, NOT G-xxx)')
  if (!/^\d+$/.test(propertyId)) die(`GA_PROPERTY_ID must be numeric, got: ${propertyId}`)
  const property = `properties/${propertyId}`

  const client = await buildClient()

  const allFiles = (await fs.readdir(args.history))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
  if (!allFiles.length) die(`No YYYY-MM-DD.json files found in ${args.history}`)

  const targetFiles = args.only ? allFiles.filter((f) => f === `${args.only}.json`) : allFiles
  if (!targetFiles.length) die(`--only ${args.only} matched no file in ${args.history}`)

  console.log(`[backfill] ${targetFiles.length} file(s) — dryRun=${args.dryRun}`)

  let filesChanged = 0
  for (const file of targetFiles) {
    const filePath = path.join(args.history, file)
    const raw = await fs.readFile(filePath, 'utf8')
    const snapshot = JSON.parse(raw)
    let changed = false

    for (const windowKey of Object.keys(snapshot.windows ?? {})) {
      const bundle = snapshot.windows[windowKey]
      const existing = bundle?.glance?.activeUsers
      const win = bundle?.window
      if (!existing || !win?.startDate || !win?.endDate) {
        console.warn(`  (skip) ${file} ${windowKey}: missing glance.activeUsers or window dates`)
        continue
      }

      // Sequential on purpose — stays well under GA4's per-property rate limit.
      const res = await runReport(client, {
        property,
        dateRanges: [{ startDate: win.startDate, endDate: win.endDate }],
        metrics: [{ name: 'totalUsers' }],
      })
      const dimensionlessTotal = Number(res?.rows?.[0]?.metricValues?.[0]?.value ?? 0)

      const patched = buildActiveUsersGlance({
        dimensionlessTotal,
        flipNew: existing.new,
        flipReturning: existing.returning,
      })

      const totalDelta = patched.total - existing.total
      console.log(
        `  ${file} ${windowKey}: total ${existing.total} -> ${patched.total} (${totalDelta >= 0 ? '+' : ''}${totalDelta}), `
        + `returningPct ${(existing.returningPct * 100).toFixed(1)}% -> ${(patched.returningPct * 100).toFixed(1)}%`,
      )

      if (patched.total !== existing.total || patched.returningPct !== existing.returningPct) {
        bundle.glance.activeUsers = patched
        changed = true
      }

      await sleep(150)
    }

    if (changed) {
      filesChanged++
      if (!args.dryRun) {
        await fs.writeFile(filePath, JSON.stringify(snapshot, null, 2))
        console.log(`  wrote ${filePath}`)
      }
    }
  }

  console.log(`[backfill] done. ${filesChanged}/${targetFiles.length} file(s) had a delta.`)
  if (args.dryRun) console.log(`[backfill] --dry-run set — nothing was written.`)
}

main().catch((err) => { console.error(err); process.exit(1) })
