#!/usr/bin/env node
// One-time backfill (#209): patch `windows[*].taxonomy.rlvRaw` across the
// gh-data `history/` snapshots so the frontend's dynamic top-8 RLV
// leaderboard (`src/components/ga-dashboard/rlv-aggregate.ts`) has raw
// per-rlv data to aggregate on days before this ticket shipped, instead of
// only the retired wide buckets (`taxonomy.rlvHistogram`, `@deprecated`).
//
// Why this is a SEPARATE script instead of a `ga-analyze.mjs --snapshot`
// flag: same reasoning as `ga-backfill-active-users.mjs` (#202) — a one-time
// migration over already-generated files, not part of the daily pipeline.
// It must patch ONLY `taxonomy.rlvRaw` — re-running the full `buildBundle()`
// per historical day would retroactively apply every OTHER fix that has
// landed since onto data that predates them, corrupting history in a
// different way than the bug it's fixing (spec #194 "Further Notes" #3:
// "回填只 patch 指定欄位，不重跑整份 bundle...這條對 RLV 回填與活躍用戶回填
// 都成立").
//
// Uses `buildRlvRawCounts()` / `rlvRawCountsToRows()` imported from
// ga-analyze.mjs (same "share one pure function with the live pipeline"
// contract `ga-backfill-active-users.mjs` established for
// `buildActiveUsersGlance()`), so the backfilled history and today's live
// output define "raw RLV histogram" identically.
//
// Every window is re-queried scoped to ITS OWN `window.startDate`/`endDate`
// (NOT "Ndaysago", which would shift the range relative to today) — same
// convention as the activeUsers backfill.
//
// Usage:
//   1. npm i -D @google-analytics/data (same setup as ga-analyze.mjs)
//   2. GA_PROPERTY_ID=<id> node scripts/dev/ga-backfill-rlv-raw.mjs \
//        --history <path to gh-data's history/ dir> [--dry-run] [--only YYYY-MM-DD]
//
// --dry-run prints the old→new key-count delta for every file/window without
// writing. --only limits the run to a single day's file, useful for a smoke
// check before committing to the full 71-/77-day run (each window is its own
// GA4 request, so a 77-file run issues up to 77×3 = 231 calls — expect it to
// take a while and to respect GA4's request quota).
//
// A window whose bundle has no `taxonomy` key at all is SKIPPED (not
// patched): that means `hasTaxonomy` was false in the ORIGINAL pipeline run
// for that day (no recipe_select/solver_* events at all), so there is
// nothing to backfill — inventing a `taxonomy` object that never existed
// would be a bigger change than "patch one field".

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { buildClient, runReport, buildRlvRawCounts, rlvRawCountsToRows } from './ga-analyze.mjs'

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
      const win = bundle?.window
      if (!win?.startDate || !win?.endDate) {
        console.warn(`  (skip) ${file} ${windowKey}: missing window dates`)
        continue
      }
      if (!bundle.taxonomy) {
        console.warn(`  (skip) ${file} ${windowKey}: no taxonomy on this day — nothing to backfill`)
        continue
      }

      // Sequential on purpose — stays well under GA4's per-property rate limit.
      const res = await runReport(client, {
        property,
        dateRanges: [{ startDate: win.startDate, endDate: win.endDate }],
        dimensions: [{ name: 'customEvent:rlv' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: { filter: {
          fieldName: 'eventName', stringFilter: { value: 'recipe_select' } } },
        limit: 200, // raw passthrough — see ga-analyze.mjs's rlvHistRes comment
      })
      const rows = (res?.rows ?? []).map((r) => ({
        rlv: r.dimensionValues[0].value,
        count: Number(r.metricValues[0].value),
      }))
      const rlvRaw = rlvRawCountsToRows(buildRlvRawCounts(rows))

      const existing = bundle.taxonomy.rlvRaw
      const existingKeyCount = existing?.length ?? 0
      console.log(
        `  ${file} ${windowKey}: rlvRaw ${existingKeyCount} key(s) -> ${rlvRaw.length} key(s)`,
      )

      if (JSON.stringify(existing) !== JSON.stringify(rlvRaw)) {
        bundle.taxonomy.rlvRaw = rlvRaw
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
