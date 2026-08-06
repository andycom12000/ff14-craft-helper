// Unit tests for scripts/dev/ga-analyze.mjs's `isMachineSolveRow` — the
// human/machine solve discriminator (#198).
//
// Runnable via `node --test scripts/__tests__/ga-analyze.test.mjs`. NOT
// picked up by `npm test` (vitest.config.ts deliberately excludes
// `scripts/**` — see its git history: "exclude scripts/** so ETL smoke test
// [is] run via [node --test]"). This mirrors the existing
// scripts/__tests__/build-game-data.test.mjs precedent for the same reason:
// these are pipeline/ETL scripts, not app code, and the harness owner chose
// to keep them off the PR-blocking vitest run.
//
// Why this pure function gets its own test file (per #194's testing
// decisions "接縫二"): a wrong cross-cutover rule doesn't produce malformed
// data — the denominator just gets silently smaller — so schema validation
// can't catch it, but it would quietly pollute every solver-derived metric.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMachineSolveRow, classifyUniversalisFetch } from '../dev/ga-analyze.mjs'

test('craft_kind === "(not set)" is machine, regardless of source (pre-fix leg)', () => {
  assert.equal(isMachineSolveRow({ craftKind: '(not set)' }), true)
  assert.equal(isMachineSolveRow({ craftKind: '(not set)', source: 'user' }), true)
})

// #189's 28d probe: 1493 solver_start rows (of 9289 machine-originated) had
// craft_kind === '' rather than the GA4 "(not set)" sentinel. Missing this
// form specifically was called out as a named failure mode in #187/#189 —
// this is the single most load-bearing assertion in this file.
test('craft_kind === "" (empty string) is ALSO machine — the #189 1493-row leak', () => {
  assert.equal(isMachineSolveRow({ craftKind: '' }), true)
  assert.equal(isMachineSolveRow({ craftKind: '', source: 'user' }), true)
})

test('craft_kind entirely absent (undefined key, not just falsy) is machine', () => {
  assert.equal(isMachineSolveRow({}), true)
  assert.equal(isMachineSolveRow(), true)
})

test('a populated craft_kind with no source is human (pre-fix human leg — SolverPanel never omitted taxonomy)', () => {
  assert.equal(isMachineSolveRow({ craftKind: 'normal' }), false)
  assert.equal(isMachineSolveRow({ craftKind: 'expert' }), false)
})

test('post-fix: populated craft_kind + source "user" is human', () => {
  assert.equal(isMachineSolveRow({ craftKind: 'normal', source: 'user' }), false)
})

test('post-fix: populated craft_kind + source "machine" is machine (the new explicit leg)', () => {
  assert.equal(isMachineSolveRow({ craftKind: 'normal', source: 'machine' }), true)
  assert.equal(isMachineSolveRow({ craftKind: 'quick', source: 'machine' }), true)
})

// Continuity check: feeding a sequence that spans both eras must not flip
// classification for rows shaped identically within an era.
test('classification is continuous across the fix-date cutover for a mixed sequence', () => {
  const rows = [
    { craftKind: '(not set)' },              // pre-fix machine
    { craftKind: '' },                        // pre-fix machine (empty-string form)
    { craftKind: 'normal' },                  // pre-fix human
    { craftKind: 'normal', source: 'user' },  // post-fix human
    { craftKind: 'normal', source: 'machine' }, // post-fix machine
  ]
  assert.deepEqual(rows.map(isMachineSolveRow), [true, true, false, false, true])
})

// Unit tests for `classifyUniversalisFetch` — the universalis 真故障 vs
// 「查無掛單」discriminator (#201). Getting this wrong silently pollutes the
// denominator of the universalis 真故障率 rule the same way a bad
// isMachineSolveRow() would: no malformed data, just a quietly wrong count.
test('ok=true is always "success", regardless of status', () => {
  assert.equal(classifyUniversalisFetch({ ok: true, status: 200 }), 'success')
  // Success path always carries the real HTTP status, but classification
  // should key off `ok` first — status is irrelevant once ok is true.
  assert.equal(classifyUniversalisFetch({ ok: true, status: 0 }), 'success')
})

test('ok=false & status=0 is "real-fail" (network/timeout/parse error)', () => {
  assert.equal(classifyUniversalisFetch({ ok: false, status: 0 }), 'real-fail')
})

// The exact bug this discriminator exists to prevent: folding "no listing"
// 404s into the failure numerator inflated the reported rate from 1.98% to
// 5.91% (#189 決定 3 / #201 issue body).
test('ok=false & status=404 is "no-listing" — must NOT be classified as real-fail', () => {
  assert.equal(classifyUniversalisFetch({ ok: false, status: 404 }), 'no-listing')
})

test('ok=false & any other status is "other-fail" — must not silently join either bucket', () => {
  assert.equal(classifyUniversalisFetch({ ok: false, status: 500 }), 'other-fail')
  assert.equal(classifyUniversalisFetch({ ok: false, status: 429 }), 'other-fail')
})

test('classifyUniversalisFetch() called with no args does not throw (defensive default)', () => {
  assert.equal(classifyUniversalisFetch(), 'other-fail')
})

// Continuity check mirroring the isMachineSolveRow() precedent above: a
// mixed batch of rows must classify independently, no cross-row leakage.
test('classification is independent per row for a mixed sequence', () => {
  const rows = [
    { ok: true, status: 200 },
    { ok: false, status: 404 },
    { ok: false, status: 0 },
    { ok: false, status: 404 },
    { ok: true, status: 200 },
  ]
  assert.deepEqual(
    rows.map(classifyUniversalisFetch),
    ['success', 'no-listing', 'real-fail', 'no-listing', 'success'],
  )
})
