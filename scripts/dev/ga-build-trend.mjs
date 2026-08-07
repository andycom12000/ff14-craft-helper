#!/usr/bin/env node
// GA dashboard trend file builder (#205 / #191 決定 5).
//
// Reads the daily archive (`gh-data/history/<date>.json`, produced by
// `ga-analyze.mjs --snapshot --history`) and emits an INDEPENDENT trend file
// — NOT a field on `GaSnapshot`, and NOT written into `history/`. Two
// deliberate constraints carried over from #184/#191's resolution comments:
//
//   - `GaSnapshot`/`MetricsBundle` stay untouched. Stuffing a growing series
//     into the snapshot type would mean every daily archive re-serializes a
//     little more of it forever (二次成長：30.3MB → 48.8MB/year, #184 決定 4).
//   - Stores `(obs, n)`, never a pre-computed percentage or fired bit.
//     `evaluate()` needs `(obs, n)` to run Wilson CI — a percentage can't be
//     turned back into a confidence interval, and a pre-baked fired bit would
//     freeze today's threshold into history (#191 決定 5).
//
// Covers every rule in `GA_THRESHOLD_RULES` (`src/config/ga-thresholds.ts`),
// expanded exactly like `evaluate()` does (funnel/vitals `pick()` arrays
// become one series per suffix) — not just the 8 "glance ledger" metrics
// #184 originally scoped, because #191's streak/extinguish markers need a
// history for every rule that can appear on the 本期待辦 list, not only the
// always-present glance ones (see #191 決定 5, "外溢自 #191" comment on #184).
//
// Only keeps a trailing window of the last `--window` (default 28) ARCHIVED
// days — not a fixed calendar range. A day with no archive at all
// (`ga-snapshot.yml` cron miss, e.g. 2026-05-20 / 2026-07-09 per #184's
// "真正的破洞是 cron 漏跑") is simply not in the sequence — it contributes
// no entry, `evaluate()`'s streak walk skips straight over it and treats the
// snapshot immediately before and after as adjacent.
//
// This is a deliberate choice, not an oversight, and it's narrower than it
// looks: it's ONLY about days where the archiver itself never ran (zero
// observations, not "an observation that happened to be bad"). A day that
// DOES have an archive but where a specific rule's own data is unavailable
// within it (`validFrom` not reached yet, an optional field genuinely
// missing, `n < 30`) still produces an explicit `null` `TrendPoint` for that
// rule via `expandPick()` — that path is untouched, still breaks that rule's
// streak, and is exactly what #205's "資料缺席不算熄滅" guard is about. The
// difference: "we captured a snapshot and this metric was measurably absent"
// is a fact about the METRIC; "the archiver never ran that day" is a fact
// about the PIPELINE and carries no information about any specific rule's
// state either way — the honest treatment is to not let it count for or
// against continuity. Verified against two independent regression facts in
// `ga-build-regression-fixture.mjs`'s test suite that only reproduce under
// this rule: BOM 交棒率's streak spans its entire real-snapshot history
// (79 real days, 2 gap days excluded) with `streakCensored: true`, and the
// SAB-fix event (`sab7d` series) fires for exactly 7 REAL days
// (05-19, 05-21..05-26 — 05-20 is one of the two gap days) before going
// quiet for good; treating the gap as a breaking `null` instead would split
// that into two shorter runs (1 + 6), not the 7 actually observed.
//
// `GA_THRESHOLD_RULES`'s `pick()` closures are imported DIRECTLY from the
// real TS source (`../../src/config/ga-thresholds.ts`) — not reimplemented
// here — so this script and the frontend's `evaluate()` can never drift on
// what a rule's numerator/denominator is. This relies on Node's native
// TypeScript type-stripping (stable since Node 22.18 / unflagged by default
// on Node ≥23.6, and available behind `--experimental-strip-types` on any
// Node ≥22.6): `ga-thresholds.ts` only uses erasable syntax (interfaces,
// type annotations, `import type`) and its only non-type import
// (`MetricsBundle` from `@/types/ga-snapshot`) is `import type`-only, so it
// gets stripped entirely and never needs the `@/` alias resolved at runtime
// — that alias only exists in Vite/vitest, not plain Node. Run this script
// with the flag explicitly (`npm run ga:build-trend`, see package.json) so
// it doesn't depend on the invoking Node's default-on version cutoff.
//
// Usage:
//   node --experimental-strip-types scripts/dev/ga-build-trend.mjs \
//     --history <path to gh-data's history/ dir> \
//     [--out <path, default public/data/ga-trends.json>] \
//     [--window <trailing archived days, default 28>] \
//     [--bundle-window <7d|14d|28d, default 28d>]
//
// Production wiring (`.github/workflows/ga-snapshot.yml`): the daily cron calls this with
// `--out /tmp/gh-data/trends.json` — no `ga-` prefix, sitting next to `snapshot.json` at the
// `gh-data` branch root (that's the naming #191 決定 5's own worked example uses: `trends.json`,
// not `ga-trends.json`). It gets committed + pushed alongside `snapshot.json`/`history/` in the
// same job, and is meant to be fetched the same way `useGaSnapshot.ts` fetches `snapshot.json`
// (`https://raw.githubusercontent.com/.../gh-data/trends.json` in prod). The default
// `public/data/ga-trends.json` (WITH the `ga-` prefix, matching the gitignored
// `public/data/ga-snapshot.json` dev fixture convention) is only for local manual runs
// (`npm run ga:build-trend -- --history <checkout>`).

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..', '..')

function parseArgs(argv) {
  const args = { history: null, out: null, window: 28, bundleWindow: '28d' }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--history') args.history = argv[++i]
    else if (a === '--out') args.out = argv[++i]
    else if (a === '--window') args.window = Number(argv[++i])
    else if (a === '--bundle-window') args.bundleWindow = argv[++i]
  }
  return args
}

function die(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

/**
 * Expand one rule's `pick(bundle)` result into `{ id, point }` entries for a
 * single archived day, the same shape `evaluate()` produces
 * (`ga-evaluate.ts`'s `TrendPoint`). `bundle` MUST be a real bundle — this is
 * only meaningful on a day archive actually exists; missing days are handled
 * one level up by `buildSeries()`, not by calling this with `bundle: null`
 * (see that function's doc comment for why the naive version of that was a
 * bug: it fabricated a bogus bare `rule.id` series alongside the real
 * `${rule.id}:${suffix}` ones).
 */
function expandPick(rule, bundle, date) {
  let picked
  try {
    picked = rule.pick(bundle)
  } catch (err) {
    // pick() 已在來源檔逐一 guard 過缺欄位（#200/#201/#203 review）——真的丟出例外代表某個
    // guard 漏了，不該讓整個建置默默吞掉，但也不該讓單一規則、單一天的爛資料炸掉整支腳本。
    console.warn(`[ga-build-trend] ${rule.id} threw on ${date}: ${err instanceof Error ? err.message : err}`)
    picked = undefined
  }

  if (Array.isArray(picked)) {
    if (picked.length === 0) return [{ id: rule.id, point: null }]
    return picked.map((p, idx) => {
      const suffix = p.suffix ?? String(idx)
      return { id: `${rule.id}:${suffix}`, point: p ? { date, obs: p.obs, n: p.n } : null }
    })
  }
  return [{ id: rule.id, point: picked ? { date, obs: picked.obs, n: picked.n } : null }]
}

/**
 * Builds `{ [id]: (null | [obs, n])[] }` for `rules` across `dates`, given a
 * `date → bundle | undefined` lookup. Two passes, on purpose:
 *
 * 1. Discover, per rule, the full set of expanded ids it ever produces
 *    across the days that DO have a bundle, and record that day's points.
 * 2. Materialize one array per discovered id, one slot per date — a date
 *    with no bundle, or a date where this SPECIFIC id wasn't among that
 *    day's picks, is `null`.
 *
 * The naive one-pass version (`expandPick(rule, bundle ?? null, date)`,
 * calling `rule.pick(null)` and letting it fall through to the scalar
 * branch) has a real bug this two-pass version exists to avoid: for an
 * array-typed rule (`funnel.pageDropoff`, `vitals.good`), a missing day
 * would produce ONE bare `rule.id` entry instead of nulling out the several
 * real `${rule.id}:${suffix}` series — so the output ends up with a
 * spurious extra top-level id (`funnel.pageDropoff` alongside
 * `funnel.pageDropoff:BOM → Consumed` etc.) that doesn't correspond to
 * anything `evaluate()` would ever produce on a day that HAS data. Caught by
 * running this against the real 81-day `gh-data/history/` archive, which has
 * two real cron-gap days (#184's "真正的破洞是 cron 漏跑") — see
 * `ga-build-regression-fixture.mjs`'s header for the full story. The same
 * two-pass shape also absorbs the (currently unobserved, but possible) case
 * of a rule's array-typed `pick()` returning `[]` on a day that DOES have a
 * bundle: that day just contributes nothing to the id set, same as a missing
 * day, instead of adding a one-off bare-id series.
 */
function buildSeries(rules, dates, bundleFor) {
  const idsByRule = new Map() // rule.id -> Set<expanded id>
  const sawSuffixByRule = new Map() // rule.id -> boolean（曾在任一天展開出 `${rule.id}:${suffix}`）
  const pointsByDate = new Map() // date -> Map<expanded id, point | null>

  for (const rule of rules) {
    idsByRule.set(rule.id, new Set())
    sawSuffixByRule.set(rule.id, false)
  }

  for (const date of dates) {
    const bundle = bundleFor(date)
    if (!bundle) continue
    const points = new Map()
    for (const rule of rules) {
      const ids = idsByRule.get(rule.id)
      for (const { id, point } of expandPick(rule, bundle, date)) {
        if (id !== rule.id) sawSuffixByRule.set(rule.id, true)
        // 純量規則的「id === rule.id」與陣列規則「該天剛好回傳空陣列」用的是同一個 fallback
        // 形狀（見 expandPick 對 picked.length === 0 的處理）。只有在這條規則從未在任何一天
        // 展開出後綴形式時，才承認這個 bare id 是它真正的（唯一）id；否則視為「這天沒資料」，
        // 不讓它污染這條規則的後綴 id 集合——`sawSuffixByRule` 記完才在迴圈外一次性決定要不要
        // 把 bare id 補回來，不能在這裡當場判斷（判斷順序若提前，會被同一條規則「先幾天都是
        // null、後幾天才展開出後綴」的資料序給騙到）。
        if (id === rule.id && point === null) continue
        ids.add(id)
        points.set(id, point)
      }
    }
    pointsByDate.set(date, points)
  }

  // 純量規則（整段視窗從未展開出任何後綴）仍要保留它的 bare-id 序列，即使每一天都是 null——
  // 例如 solver.failRate / api.universalisRealFailRate 在早於各自 v2 欄位上線的歷史快照裡，
  // pick() 整段視窗都回傳 undefined；不能因為「這條規則從沒見過非 null 的一天」就讓它整條從
  // 輸出消失，那正是「量不到」被吃掉、假裝這條規則不存在的反面案例。只有真的展開過後綴形式
  // 的規則（funnel.pageDropoff / vitals.good）才不需要這個 bare-id 保底。
  for (const rule of rules) {
    if (!sawSuffixByRule.get(rule.id)) idsByRule.get(rule.id).add(rule.id)
  }

  const allIds = new Set([...idsByRule.values()].flatMap((s) => [...s]))
  const series = {}
  for (const id of allIds) {
    series[id] = dates.map((date) => {
      const point = pointsByDate.get(date)?.get(id)
      return point ? [point.obs, point.n] : null
    })
  }
  return series
}

async function main() {
  const args = parseArgs(process.argv)
  if (!args.history) die('Missing --history <dir> (a checkout of gh-data\'s history/ folder)')
  if (!Number.isFinite(args.window) || args.window <= 0) die(`--window must be a positive number, got: ${args.window}`)
  if (!['7d', '14d', '28d'].includes(args.bundleWindow)) die(`--bundle-window must be 7d/14d/28d, got: ${args.bundleWindow}`)

  const out = args.out ?? path.join(ROOT, 'public', 'data', 'ga-trends.json')

  const { GA_THRESHOLD_RULES } = await import(
    pathToFileURL(path.join(ROOT, 'src', 'config', 'ga-thresholds.ts')).href
  )

  const files = (await fs.readdir(args.history)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  if (!files.length) die(`No YYYY-MM-DD.json files found in ${args.history}`)

  const byDate = new Map()
  for (const f of files.sort()) {
    const date = f.replace('.json', '')
    const raw = JSON.parse(await fs.readFile(path.join(args.history, f), 'utf-8'))
    const bundle = raw.windows?.[args.bundleWindow]
    if (!bundle) {
      console.warn(`[ga-build-trend] ${f} has no windows.${args.bundleWindow} — treated as missing`)
      continue
    }
    byDate.set(date, bundle)
  }

  const allDates = [...byDate.keys()].sort()
  if (!allDates.length) die(`No archive carried a usable windows.${args.bundleWindow} bundle`)
  const dates = allDates.slice(-args.window)

  const series = buildSeries(GA_THRESHOLD_RULES, dates, (date) => byDate.get(date) ?? null)

  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    window: { days: args.window, bundleWindow: args.bundleWindow },
    dates,
    series,
  }

  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, JSON.stringify(payload))
  const stat = await fs.stat(out)
  console.log(
    `[ga-build-trend] wrote ${out} (${(stat.size / 1024).toFixed(1)} KB) — ` +
      `${dates.length} archived days (${dates[0]}..${dates.at(-1)}), ${Object.keys(series).length} rule ids`,
  )
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (invoked) {
  main().catch((err) => die(err instanceof Error ? err.stack ?? err.message : String(err)))
}

export { expandPick, buildSeries }
