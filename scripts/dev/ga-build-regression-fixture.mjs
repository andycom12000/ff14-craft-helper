#!/usr/bin/env node
// Regenerates src/__tests__/fixtures/ga-regression-history.json (#205).
//
// This is NOT the production trend builder — see ga-build-trend.mjs for that
// (last-28-archived-days trailing window, `(obs, n)` only, ships to
// `gh-data/trends.json`). This script instead walks the ENTIRE
// `gh-data/history/` archive (79 files as of writing, 2026-05-19 → today,
// 2 known cron-gap days per #184's "真正的破洞是 cron 漏跑" — see
// ga-build-trend.mjs's header for why those 2 gap days are simply skipped
// rather than represented as an explicit `null` slot) and trims each real
// day down to a REAL (but field-pruned) `MetricsBundle` — not a
// pre-flattened `(obs, n)` map — so the #205 regression tests can run the
// actual `Rule.pick()` closures from `ga-thresholds.ts` through the actual
// `evaluate()` day by day, exactly like production would. The alternative
// (fixture stores pre-extracted `(obs, n)` per rule id) was tried first and
// rejected: it would silently duplicate `pick()`'s field-mapping logic in
// two places (the fixture builder AND whatever re-synthesizes a bundle from
// it for `evaluate()` to call `pick()` on again), and any drift between the
// two would go undetected by type-checking (both sides are just numbers).
//
// Only the fields any rule in `GA_THRESHOLD_RULES` actually reads survive
// the trim (`glance.*` in full, `simulatorFunnel.macroCopy`, `vitals`,
// `q4Funnels`, `misuseSignals`) — every other `MetricsBundle` field
// (`pages`, `solverFunnel`, `batchFunnel`, `failures`, `marketRegion`, and
// the v2 `byRegion`/`toolUsageByRlv`/`taxonomy`/`apiFailures` blocks) is
// dropped to satisfy the TYPE (empty array / placeholder) without carrying
// its real, much larger, content — that's most of the ~6MB/79-file archive.
//
// `gh-data/history/` is not checked out in CI or on a fresh clone, so the
// regression tests read this committed, trimmed fixture instead of hitting
// the branch directly. Re-run this script whenever the fixture needs
// refreshing (e.g. more days have accumulated and a regression assertion
// should be re-verified against a longer tail):
//
//   node --experimental-strip-types scripts/dev/ga-build-regression-fixture.mjs \
//     --history <path to a checkout of gh-data's history/ folder>
//
// Two things land in the fixture:
//
//   1. `dates` + `bundles` (28d window, one trimmed `MetricsBundle` per real
//      archived day, in order — the 2 gap days simply have no entry) —
//      every `GA_THRESHOLD_RULES` rule can be run against this with the real
//      `evaluate()`. Backs the "72 天內從來沒有空狀態" / "誤用三條門檻修正後
//      今天無翻轉" / "BOM 交棒率 streak 等於序列全長" regression facts.
//   2. `sab7d` — `glance.infra.sabUnavailable / glance.activeUsers.total`
//      read from the 7-DAY bundle window, NOT 28d, same "only real days,
//      gaps skipped" shape as `bundles`. Deliberately NOT one of
//      `GA_THRESHOLD_RULES` (the rebuilt `/admin/ga` — #196/#197 — has no
//      chart left to anchor it to). It's the real event #184's resolution
//      comment uses as its own worked example of "28d 滾動視窗在結構上畫不出
//      趨勢": the SAB fix lands as a clean, isolated 7-real-day fire run
//      under the 7d window that never re-ignites for the rest of the
//      archive, while the SAME event viewed through the 28d window smears
//      across ~30+ days because a 28d rolling average shares 27/28 of its
//      data with the previous day. This fixture captures the 7d series once
//      so the "SAB 修復...連亮 7 天後自動安靜" regression test can feed it to
//      `evaluate()` via an ad-hoc test-local `Rule` (the streak/censor engine
//      is generic over any `(obs,n)` series — it doesn't care whether the
//      rule is "real" / registered in ga-thresholds.ts). Kept as a flat
//      `(obs,n)` series, not a bundle, because it's synthetic-only (no
//      production rule ever reads it via `pick()`).

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..', '..')
const FIXTURE_OUT = path.join(ROOT, 'src', '__tests__', 'fixtures', 'ga-regression-history.json')

function parseArgs(argv) {
  const args = { history: null, out: FIXTURE_OUT }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--history') args.history = argv[++i]
    else if (a === '--out') args.out = argv[++i]
  }
  return args
}

function die(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

/** Keeps only the MetricsBundle fields any GA_THRESHOLD_RULES pick() reads. */
function trimBundle(bundle) {
  return {
    window: bundle.window,
    glance: bundle.glance,
    pages: [],
    solverFunnel: [],
    batchFunnel: [],
    simulatorFunnel: {
      entry: { label: '', count: 0, users: 0 },
      macroCopy: bundle.simulatorFunnel.macroCopy,
      globalContext: [],
    },
    failures: [],
    vitals: bundle.vitals,
    q4Funnels: bundle.q4Funnels,
    marketRegion: [],
    ...(bundle.misuseSignals !== undefined ? { misuseSignals: bundle.misuseSignals } : {}),
  }
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.history) die('Missing --history <dir> (a checkout of gh-data\'s history/ folder)')

  const files = (await fs.readdir(args.history)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  if (!files.length) die(`No YYYY-MM-DD.json files found in ${args.history}`)

  const byDate28 = new Map()
  const byDate7 = new Map()
  for (const f of files.sort()) {
    const date = f.replace('.json', '')
    const raw = JSON.parse(await fs.readFile(path.join(args.history, f), 'utf-8'))
    if (raw.windows?.['28d']) byDate28.set(date, raw.windows['28d'])
    if (raw.windows?.['7d']) byDate7.set(date, raw.windows['7d'])
  }

  const dates = [...byDate28.keys()].sort()
  if (!dates.length) die('No archive carried a usable windows.28d bundle')

  const bundles = dates.map((date) => trimBundle(byDate28.get(date)))

  const sab7dDates = [...byDate7.keys()].sort()
  const sab7d = sab7dDates.map((date) => {
    const bundle = byDate7.get(date)
    const { sabUnavailable } = bundle.glance.infra
    const { total } = bundle.glance.activeUsers
    return [sabUnavailable, total]
  })

  const fixture = {
    // 純粹是這份 fixture 本身的格式版本，與 GaSnapshot.schemaVersion 無關（那個維持 1 沒被動過）。
    fixtureVersion: 1,
    generatedFrom: { history: '/gh-data/history', fileCount: files.length },
    // `dates`/`bundles` 只涵蓋 28d 視窗有存檔的日子；`sab7dDates`/`sab7d` 是獨立的一組（同一批
    // 檔案的 7d 視窗），兩組理論上該涵蓋同一組真實日子，但刻意不假設兩者永遠同步——各自只放
    // 真的讀得到該視窗的那些天。
    dates,
    bundles,
    sab7dDates,
    sab7d,
  }

  await fs.mkdir(path.dirname(args.out), { recursive: true })
  await fs.writeFile(args.out, JSON.stringify(fixture))
  const stat = await fs.stat(args.out)
  console.log(
    `[ga-build-regression-fixture] wrote ${args.out} (${(stat.size / 1024).toFixed(1)} KB) — ` +
      `${dates.length} real archived days (${dates[0]}..${dates.at(-1)}); ` +
      `calendar gap days within that range (no archive at all, e.g. cron misses) are simply absent ` +
      `from the sequence — see ga-build-trend.mjs's header for why`,
  )
}

main().catch((err) => die(err instanceof Error ? (err.stack ?? err.message) : String(err)))
