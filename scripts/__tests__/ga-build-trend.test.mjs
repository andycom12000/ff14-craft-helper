// Unit tests for scripts/dev/ga-build-trend.mjs's archived-day retention
// logic — the production-only regression this fix addresses.
//
// Runnable via `node --test scripts/__tests__/ga-build-trend.test.mjs`. Same
// convention as the ga-analyze.test.mjs precedent next to it: excluded from
// `npm test` (vitest.config.ts excludes `scripts/**`), run via
// `npm run test:scripts` instead.
//
// Why this needs its own regression coverage: `ga-build-trend.mjs` shipped
// (#205/PR #224) with `--window` defaulting to 28, and #224's own regression
// suite only ever exercised it against the bundled 79-day
// `ga-regression-history.json` fixture via `buildSeries()`/`expandPick()`
// DIRECTLY — never through `main()`'s CLI-arg → retained-dates path, so
// nothing caught that the real `npm run ga:build-trend` (no `--window` flag,
// exactly how `.github/workflows/ga-snapshot.yml` invokes it) was silently
// throwing away all but the last 28 of the archive's real days. 79 days in,
// 28 days out, every test green — the exact "測不到 production 的形狀" this
// suite exists to close. See ga-build-trend.mjs's header for the full
// capacity-budget rationale (#191 決定 5's own table already prices an
// UNCAPPED file at ≈73 KB/year).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectRetainedDates, parseArgs } from '../dev/ga-build-trend.mjs'

// --- parseArgs() -------------------------------------------------------

test('parseArgs(): --window defaults to null (no cap) when the flag is absent — the exact production invocation shape', () => {
  // Mirrors .github/workflows/ga-snapshot.yml's "Build trend file" step
  // verbatim: --history and --out only, no --window. Before this fix,
  // args.window here silently defaulted to 28.
  const argv = ['node', 'ga-build-trend.mjs', '--history', '/tmp/gh-data/history', '--out', '/tmp/gh-data/trends.json']
  const args = parseArgs(argv)
  assert.equal(args.window, null)
})

test('parseArgs(): --window <n> still parses to a number when explicitly passed', () => {
  const argv = ['node', 'ga-build-trend.mjs', '--history', 'h', '--window', '28']
  const args = parseArgs(argv)
  assert.equal(args.window, 28)
})

test('parseArgs(): bundleWindow keeps its own independent default (28d) regardless of --window', () => {
  const argv = ['node', 'ga-build-trend.mjs', '--history', 'h']
  const args = parseArgs(argv)
  assert.equal(args.bundleWindow, '28d')
  assert.equal(args.window, null)
})

// --- selectRetainedDates() ---------------------------------------------

function fakeDates(n) {
  // Sorted ascending YYYY-MM-DD strings, same shape main() feeds this with.
  return Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`)
}

test('selectRetainedDates(): window=null keeps every archived day — the #191 決定 5 capacity budget assumes this, not a truncated file', () => {
  const all = fakeDates(79)
  const kept = selectRetainedDates(all, null)
  assert.equal(kept.length, 79)
  assert.deepEqual(kept, all)
})

// This is the literal production symptom: 79 real archived days, old default
// window of 28 silently dropped 51 of them.
test('selectRetainedDates(): the pre-fix default (28) would have kept only the trailing 28 of 79 — pinning the old bug shape so it cannot silently return', () => {
  const all = fakeDates(79)
  const kept = selectRetainedDates(all, 28)
  assert.equal(kept.length, 28)
  assert.equal(kept[0], all[79 - 28])
  assert.equal(kept.at(-1), all.at(-1))
})

test('selectRetainedDates(): an explicit --window larger than the available history is a no-op, not an error', () => {
  const all = fakeDates(10)
  const kept = selectRetainedDates(all, 100)
  assert.deepEqual(kept, all)
})

test('selectRetainedDates(): window=null on a short (sub-window) archive still keeps all of it — same as before this fix for the common case', () => {
  const all = fakeDates(5)
  assert.deepEqual(selectRetainedDates(all, null), all)
})
