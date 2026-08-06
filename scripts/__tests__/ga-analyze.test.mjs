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
import { isMachineSolveRow } from '../dev/ga-analyze.mjs'

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
