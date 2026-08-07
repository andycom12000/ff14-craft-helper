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
import {
  isMachineSolveRow,
  classifyUniversalisFetch,
  classifyUniversalisFetchRow,
  buildActiveUsersGlance,
  marketRegionBucket,
  buildSolverHumanGlance,
  buildAdoptionGlance,
  buildRlvRawCounts,
  rlvRawCountsToRows,
  runReport,
  describeRequest,
  canAttributeMacroCopies,
  buildFailureRows,
  buildGearBucketBreakdown,
} from '../dev/ga-analyze.mjs'

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

// Regression for review N1: `ok` must be compared with strict `=== true`, not
// truthy. A raw (unconverted) GA4 string 'false' is truthy in JS — if this
// regresses to `if (ok) return 'success'`, this row silently misclassifies
// as success forever and universalisRealFails goes permanently to 0 with no
// visible symptom (#201 review N1).
test('classifyUniversalisFetch() treats a raw string "false" as NOT ok (strict === true)', () => {
  // status:200 deliberately doesn't match either the real-fail (0) or
  // no-listing (404) branch, isolating what's under test: the `ok` check.
  assert.equal(classifyUniversalisFetch({ ok: 'false', status: 200 }), 'other-fail')
  assert.equal(classifyUniversalisFetch({ ok: 'true', status: 200 }), 'other-fail') // string, not boolean true
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

// --- classifyUniversalisFetchRow() -----------------------------------------
// Unit tests for the raw-string → typed-input adapter actually wired into the
// pipeline (#201 review N2: classifyUniversalisFetch()-only tests gave false
// confidence because they never exercised this conversion — swapping the
// pipeline's gaBool()/Number() call-site logic for something broken left all
// six classifyUniversalisFetch() tests green while universalisRealFails
// silently went to 0).
test('classifyUniversalisFetchRow(): a real GA4 success row (string "true"/"200")', () => {
  assert.equal(classifyUniversalisFetchRow({ ok: 'true', status: '200' }), 'success')
})

test('classifyUniversalisFetchRow(): a real GA4 real-fail row (string "false"/"0")', () => {
  assert.equal(classifyUniversalisFetchRow({ ok: 'false', status: '0' }), 'real-fail')
})

test('classifyUniversalisFetchRow(): a real GA4 no-listing row (string "false"/"404")', () => {
  assert.equal(classifyUniversalisFetchRow({ ok: 'false', status: '404' }), 'no-listing')
})

// The exact B1 regression: GA4's `(not set)` sentinel on `status` must NOT
// coerce to 0 and alias into "real-fail" — `Number('(not set)') → NaN`, and
// a `|| 0` fallback (the original bug) turns that into a false "real-fail".
test('classifyUniversalisFetchRow(): status="(not set)" is "other-fail", NOT "real-fail" (#201 review B1)', () => {
  assert.equal(classifyUniversalisFetchRow({ ok: 'false', status: '(not set)' }), 'other-fail')
  assert.equal(classifyUniversalisFetchRow({ ok: '(not set)', status: '(not set)' }), 'other-fail')
})

test('classifyUniversalisFetchRow(): "1" is accepted as truthy ok (GA4 sometimes renders booleans as 0/1)', () => {
  assert.equal(classifyUniversalisFetchRow({ ok: '1', status: '200' }), 'success')
  assert.equal(classifyUniversalisFetchRow({ ok: '0', status: '0' }), 'real-fail')
})

// Unit tests for `buildActiveUsersGlance` — the glance.activeUsers denominator
// fix (#202). Getting this wrong either re-introduces the ~27.8% inflation
// (summing flip's three newVsReturning buckets) or silently diverges the live
// pipeline from the history backfill script, which reuses this same function
// so both sides share one definition (see the function's doc comment).
test('total comes straight from the dimension-less query, not new+returning', () => {
  const g = buildActiveUsersGlance({ dimensionlessTotal: 1096, flipNew: 662, flipReturning: 318 })
  assert.equal(g.total, 1096)
  // Sanity: this is the #202 issue body's own numbers (1401 inflated vs 1096
  // dimension-less) — new+returning+other summed to 1401, not 1096.
  assert.notEqual(g.total, 662 + 318)
})

test('new / returning pass through unchanged — #202 explicitly does not touch them', () => {
  const g = buildActiveUsersGlance({ dimensionlessTotal: 1096, flipNew: 662, flipReturning: 318 })
  assert.equal(g.new, 662)
  assert.equal(g.returning, 318)
})

test('returningPct denominator is the dimension-less total, not new+returning', () => {
  const g = buildActiveUsersGlance({ dimensionlessTotal: 1096, flipNew: 662, flipReturning: 318 })
  assert.equal(g.returningPct, 318 / 1096)
})

test('returningPct is 0 (not NaN/Infinity) when the dimension-less total is 0', () => {
  const g = buildActiveUsersGlance({ dimensionlessTotal: 0, flipNew: 0, flipReturning: 0 })
  assert.equal(g.returningPct, 0)
  assert.equal(g.total, 0)
})

// Unit tests for `marketRegionBucket` — the market_region ledger bucket
// classifier (#202). Missing the empty-string form here silently undercounts
// "never learned this user's region" the same way #198's missed craft_kind
// '' form leaked machine rows into the human bucket.
test('"(not set)" — GA\'s own missing-property sentinel — buckets as notset', () => {
  assert.equal(marketRegionBucket('(not set)'), 'notset')
})

test('"" (empty string) ALSO buckets as notset — must merge with the sentinel, not vanish', () => {
  assert.equal(marketRegionBucket(''), 'notset')
})

test('the app\'s own literal "unset" stays a DISTINCT bucket from notset', () => {
  assert.equal(marketRegionBucket('unset'), 'unset')
  assert.notEqual(marketRegionBucket('unset'), marketRegionBucket('(not set)'))
})

test('"cht" / "intl" pass through as their own buckets', () => {
  assert.equal(marketRegionBucket('cht'), 'cht')
  assert.equal(marketRegionBucket('intl'), 'intl')
})

test('an unrecognized value returns null so callers can skip it, not silently misfile it', () => {
  assert.equal(marketRegionBucket('some-unexpected-value'), null)
})

// Unit tests for `buildSolverHumanGlance` — the glance.solver human-face
// denominators (#200). #187/#189's stated acceptance bar is that the
// human-only completePct comes out ≤100% (the machine-loop-polluted full
// population had 63/71 historical days >100%); getting the per-row filter
// wrong here silently reintroduces that same impossible number under a new
// field name instead of fixing it.
test('buildSolverHumanGlance(): counts only human rows per event, machine rows are dropped entirely', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', count: 100 },
    { eventName: 'solver_start', craftKind: '(not set)', count: 200 }, // pre-fix machine
    { eventName: 'solver_start', craftKind: 'quick', source: 'machine', count: 50 }, // post-fix machine
    { eventName: 'solver_complete', craftKind: 'normal', source: 'user', count: 95 },
    { eventName: 'solver_complete', craftKind: '', count: 190 }, // pre-fix machine, empty-string leg
    { eventName: 'solver_failed', craftKind: 'expert', source: 'user', count: 5 },
    { eventName: 'solver_failed', craftKind: '(not set)', count: 3 },
  ]
  const g = buildSolverHumanGlance(rows)
  assert.equal(g.humanStarts, 100)
  assert.equal(g.humanCompletes, 95)
  assert.equal(g.humanFails, 5)
})

test('buildSolverHumanGlance(): humanCompletePct = humanCompletes / humanStarts, not the machine-polluted totals', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', count: 100 },
    { eventName: 'solver_start', craftKind: '(not set)', count: 900 }, // would push completePct >100% if counted
    { eventName: 'solver_complete', craftKind: 'normal', source: 'user', count: 96 },
    { eventName: 'solver_complete', craftKind: '(not set)', count: 950 }, // machine completes > machine starts
  ]
  const g = buildSolverHumanGlance(rows)
  // If the machine rows leaked in, starts=1000/completes=1046 would push this past 1 (>100%) —
  // exactly the #181/#189 bug this function exists to fix. Human-only must stay a clean ratio.
  assert.equal(g.humanStarts, 100)
  assert.equal(g.humanCompletes, 96)
  assert.equal(g.humanCompletePct, 0.96)
  assert.ok(g.humanCompletePct <= 1, 'human completePct must be ≤100% — the #200 acceptance bar')
})

test('buildSolverHumanGlance(): humanCompletePct is 0 (not NaN/Infinity) when humanStarts is 0', () => {
  const g = buildSolverHumanGlance([
    { eventName: 'solver_start', craftKind: '(not set)', count: 500 }, // all machine
  ])
  assert.equal(g.humanStarts, 0)
  assert.equal(g.humanCompletePct, 0)
})

test('buildSolverHumanGlance(): empty/missing rows default every field to 0, not undefined', () => {
  assert.deepEqual(buildSolverHumanGlance([]), {
    humanStarts: 0, humanCompletes: 0, humanFails: 0, humanCompletePct: 0,
  })
  assert.deepEqual(buildSolverHumanGlance(), {
    humanStarts: 0, humanCompletes: 0, humanFails: 0, humanCompletePct: 0,
  })
})

test('buildSolverHumanGlance(): an eventName outside the solver_* set is ignored, not miscounted', () => {
  const g = buildSolverHumanGlance([
    { eventName: 'batch_optimization_start', craftKind: 'normal', source: 'user', count: 999 },
  ])
  assert.equal(g.humanStarts, 0)
  assert.equal(g.humanCompletes, 0)
  assert.equal(g.humanFails, 0)
})

// #200 review regression: `solver_failed` has NEVER carried taxonomy in
// production (#189 決定 3), so every solver_failed row today has an absent
// craft_kind and gets classified as machine by isMachineSolveRow() — summing
// "non-machine solver_failed rows" always lands on exactly 0. Reporting that
// 0 as a plain number let ga-thresholds.ts's Wilson-CI gate read it as a
// confident large-n 0% failure rate (`state: 'clear'`) — a false all-clear
// the reviewer caught against a real 28d GA4 probe (obs=0/n=14572). These
// tests lock down the fix: `humanFails` must distinguish "we cannot
// currently attribute any solver_failed row" (→ undefined, NOT 0) from
// "there were truly zero solver_failed events at all" (→ a real 0).
test('buildSolverHumanGlance(): humanFails is undefined (not 0) when solver_failed rows exist but NONE carry real taxonomy — the #200 core regression', () => {
  // Mirrors the actual 28d GA4 probe shape: solver_failed rows exist (614
  // events) but every single one has craft_kind === '(not set)'.
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: '(not set)', count: 14572 },
    { eventName: 'solver_complete', craftKind: 'normal', source: '(not set)', count: 13924 },
    { eventName: 'solver_failed', craftKind: '(not set)', source: '(not set)', count: 614 },
  ]
  const g = buildSolverHumanGlance(rows)
  assert.equal(g.humanFails, undefined, 'humanFails must be undefined, not 0 — a 0 here would be a false all-clear')
  assert.notEqual(g.humanFails, 0)
  // humanStarts/humanCompletes are unaffected — only humanFails carries the
  // "can we even attribute this event?" ambiguity (solver_start/_complete
  // have reliably carried taxonomy on the human path since before #198).
  assert.equal(g.humanStarts, 14572)
  assert.equal(g.humanCompletes, 13924)
})

test('buildSolverHumanGlance(): humanFails is a real 0 when there are NO solver_failed rows at all (true zero, not unattributable)', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', count: 100 },
    { eventName: 'solver_complete', craftKind: 'normal', source: 'user', count: 96 },
    // no solver_failed rows in this window — nobody failed, human or machine.
  ]
  const g = buildSolverHumanGlance(rows)
  assert.equal(g.humanFails, 0)
  assert.notEqual(g.humanFails, undefined)
})

test('buildSolverHumanGlance(): humanFails resumes being a real number the moment ANY solver_failed row carries real taxonomy (post-#198-deploy self-heal)', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', count: 100 },
    { eventName: 'solver_complete', craftKind: 'normal', source: 'user', count: 96 },
    // Mostly still the old, un-attributable pre-deploy shape...
    { eventName: 'solver_failed', craftKind: '(not set)', source: '(not set)', count: 10 },
    // ...but ONE post-deploy human failure has landed, carrying real taxonomy.
    { eventName: 'solver_failed', craftKind: 'expert', source: 'user', count: 1 },
  ]
  const g = buildSolverHumanGlance(rows)
  assert.equal(g.humanFails, 1, 'the single attributable row makes attribution possible again — no manual unlock needed')
  assert.notEqual(g.humanFails, undefined)
})

test('buildSolverHumanGlance(): a machine-sourced (but taxonomy-carrying) solver_failed row also counts as "attributable" even though it contributes 0 to humanFails', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', count: 100 },
    { eventName: 'solver_complete', craftKind: 'normal', source: 'user', count: 96 },
    // Post-deploy machine failure — carries real craft_kind, but source:'machine'
    // means it's excluded from the human sum. Attribution is still "working"
    // here (we KNOW this one is machine, not "we can't tell"), so a resulting
    // human count of 0 is legitimate, not a data-availability gap.
    { eventName: 'solver_failed', craftKind: 'quick', source: 'machine', count: 4 },
  ]
  const g = buildSolverHumanGlance(rows)
  assert.equal(g.humanFails, 0)
  assert.notEqual(g.humanFails, undefined)
})

// Unit tests for `buildAdoptionGlance` — the glance.adoption cross-server +
// meld-advisor adoption denominators (#203). Getting the `fields` filter or
// the `cross_server` boolean parse wrong here silently mis-sizes a C-class
// rule's numerator/denominator the same quiet way a bad isMachineSolveRow()
// would — no malformed data, just a wrong count feeding straight into
// ga-thresholds.ts's Wilson-CI gate.
test('buildAdoptionGlance(): batchStarts sums every cross_server bucket, crossServerBatches only the true rows', () => {
  const g = buildAdoptionGlance({
    crossServerRows: [
      { crossServer: 'true', count: 8 },
      { crossServer: 'false', count: 1315 },
      { crossServer: '(not set)', count: 1383 }, // pre-registration rows, still real batch starts
    ],
  })
  assert.equal(g.batchStarts, 8 + 1315 + 1383)
  assert.equal(g.crossServerBatches, 8)
})

test('buildAdoptionGlance(): "1" is accepted as truthy cross_server (GA4 sometimes renders booleans as 0/1, same as gaBool() elsewhere)', () => {
  const g = buildAdoptionGlance({
    crossServerRows: [
      { crossServer: '1', count: 5 },
      { crossServer: '0', count: 20 },
    ],
  })
  assert.equal(g.batchStarts, 25)
  assert.equal(g.crossServerBatches, 5)
})

test('buildAdoptionGlance(): meldApplies sums only fields === meld_delta / meld_delta_single, not the generic field-edit writer', () => {
  const g = buildAdoptionGlance({
    meldFieldsRows: [
      { fields: 'meld_delta', count: 233 },
      { fields: 'meld_delta_single', count: 41 },
      // gearsets.ts:61's generic writer — comma-joined field list, NOT a meld-advisor apply.
      { fields: 'level,craftsmanship,control,cp', count: 900 },
    ],
  })
  assert.equal(g.meldApplies, 233 + 41)
})

test('buildAdoptionGlance(): meldAdvisorRuns passes straight through from the caller, independent of the two row sets', () => {
  const g = buildAdoptionGlance({ meldAdvisorRuns: 512 })
  assert.equal(g.meldAdvisorRuns, 512)
  assert.equal(g.batchStarts, 0)
  assert.equal(g.crossServerBatches, 0)
  assert.equal(g.meldApplies, 0)
})

test('buildAdoptionGlance(): missing/empty inputs default every field to 0, not undefined', () => {
  assert.deepEqual(buildAdoptionGlance({}), {
    batchStarts: 0, crossServerBatches: 0, meldAdvisorRuns: 0, meldApplies: 0,
  })
  assert.deepEqual(buildAdoptionGlance(), {
    batchStarts: 0, crossServerBatches: 0, meldAdvisorRuns: 0, meldApplies: 0,
  })
})

// --- buildRlvRawCounts() / rlvRawCountsToRows() (#209) ---------------------
// Item 15 of spec #194's pipeline test list: "raw RLV 直方圖 passthrough：
// 不做分桶、key 數量符合預期". `rows` here is the SIMPLIFIED shape the call
// site extracts from the raw GA response (`{ rlv, count, craftKind?,
// source? }`) — same convention buildSolverHumanGlance()/
// buildAdoptionGlance() use above, not the raw dimensionValues/metricValues
// GA4 shape.

test('buildRlvRawCounts(): passthrough — every distinct rlv is its own key, values are NOT bucketed', () => {
  const rows = [
    { rlv: '1', count: 4 },
    { rlv: '14', count: 118 },
    { rlv: '770', count: 118 },
    { rlv: '517', count: 9 },
  ]
  const counts = buildRlvRawCounts(rows)
  assert.equal(counts.size, 4) // key count matches distinct rlv values exactly — no collapsing into buckets
  assert.equal(counts.get(1), 4)
  assert.equal(counts.get(14), 118)
  assert.equal(counts.get(770), 118)
  assert.equal(counts.get(517), 9)
})

test('buildRlvRawCounts(): duplicate rlv keys (e.g. across paginated rows) sum instead of overwriting', () => {
  const rows = [{ rlv: '660', count: 10 }, { rlv: '660', count: 5 }]
  const counts = buildRlvRawCounts(rows)
  assert.equal(counts.size, 1)
  assert.equal(counts.get(660), 15)
})

test('buildRlvRawCounts(): rlv <= 0 (incl. empty-string → Number(\'\') === 0) is dropped as not-set, not counted as rlv 0', () => {
  const rows = [{ rlv: '', count: 40 }, { rlv: '0', count: 3 }, { rlv: '-5', count: 1 }, { rlv: '1', count: 7 }]
  const counts = buildRlvRawCounts(rows)
  assert.equal(counts.size, 1)
  assert.equal(counts.get(1), 7)
})

test('buildRlvRawCounts(): non-numeric rlv (e.g. "(not set)") is dropped, not NaN-keyed', () => {
  const rows = [{ rlv: '(not set)', count: 12 }, { rlv: '1', count: 7 }]
  const counts = buildRlvRawCounts(rows)
  assert.equal(counts.size, 1)
  assert.equal(counts.has(NaN), false)
})

test('buildRlvRawCounts(): humanOnly=true drops machine-originated rows before counting (shared isMachineSolveRow() discriminator)', () => {
  const rows = [
    { rlv: '660', craftKind: 'normal', source: 'user', count: 20 },
    { rlv: '660', craftKind: '(not set)', source: undefined, count: 500 }, // machine (pre-#198 leg)
    { rlv: '660', craftKind: 'normal', source: 'machine', count: 300 }, // machine (post-#198 leg)
  ]
  const counts = buildRlvRawCounts(rows, { humanOnly: true })
  assert.equal(counts.get(660), 20)
})

test('buildRlvRawCounts(): humanOnly=false (default) counts every row regardless of craftKind/source', () => {
  const rows = [
    { rlv: '660', craftKind: '(not set)', count: 500 },
    { rlv: '660', craftKind: 'normal', source: 'user', count: 20 },
  ]
  const counts = buildRlvRawCounts(rows)
  assert.equal(counts.get(660), 520)
})

test('buildRlvRawCounts(): empty/missing rows default to an empty map', () => {
  assert.equal(buildRlvRawCounts([]).size, 0)
  assert.equal(buildRlvRawCounts().size, 0)
})

test('rlvRawCountsToRows(): converts the count map to sorted { rlv, events } rows, ascending by rlv', () => {
  const counts = buildRlvRawCounts([
    { rlv: '660', count: 5 }, { rlv: '1', count: 4 }, { rlv: '300', count: 2 },
  ])
  assert.deepEqual(rlvRawCountsToRows(counts), [
    { rlv: 1, events: 4 },
    { rlv: 300, events: 2 },
    { rlv: 660, events: 5 },
  ])
})

test('rlvRawCountsToRows(): key count matches expected cardinality — live probe found 103 distinct rlv values on 7d, 141 on 28d, this asserts the shape scales without collapsing', () => {
  const rows = Array.from({ length: 141 }, (_, i) => ({ rlv: String(i + 1), count: i + 1 }))
  const out = rlvRawCountsToRows(buildRlvRawCounts(rows))
  assert.equal(out.length, 141)
})

// --- runReport() truncation warning (#209 review 1) -------------------------
// The old fix for the raw-RLV limit:100 truncation was to pick a bigger
// magic number (limit:200) — the reviewer's point: that just moves the
// failure mode to a later, still-silent date, because rowCount grows with
// the window and with every new expansion's recipe levels. This asserts the
// generic detector added to runReport() itself: whenever a request sets
// `limit` and GA4's `response.rowCount` (the TRUE matching row count,
// independent of how many rows actually came back) exceeds it, a warning
// fires — covering all ~15 call sites in this file for free.
//
// Uses a fake `client.runReport` (not a real GA4 client) — this is testing
// OUR wrapper's post-response logic, not GA4's query contract (which this
// suite deliberately doesn't unit-test, per the file header).

function fakeClient(response) {
  return { runReport: async () => [response] }
}

function captureWarn(fn) {
  const calls = []
  const original = console.warn
  console.warn = (...args) => calls.push(args.join(' '))
  return fn().finally(() => { console.warn = original }).then(() => calls)
}

test('runReport(): warns when response.rowCount exceeds request.limit', async () => {
  const calls = await captureWarn(() => runReport(
    fakeClient({ rowCount: 141, rows: [] }),
    { limit: 100, dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'recipe_select' } } } },
  ))
  assert.equal(calls.length, 1)
  assert.match(calls[0], /TRUNCATED/)
  assert.match(calls[0], /rowCount=141/)
  assert.match(calls[0], /limit=100/)
  assert.match(calls[0], /eventName=recipe_select/)
})

test('runReport(): does not warn when response.rowCount is within request.limit', async () => {
  const calls = await captureWarn(() => runReport(
    fakeClient({ rowCount: 80, rows: [] }),
    { limit: 100 },
  ))
  assert.equal(calls.length, 0)
})

test('runReport(): does not warn when response.rowCount equals request.limit exactly (not truncated)', async () => {
  const calls = await captureWarn(() => runReport(
    fakeClient({ rowCount: 100, rows: [] }),
    { limit: 100 },
  ))
  assert.equal(calls.length, 0)
})

test('runReport(): does not warn when the request has no limit set', async () => {
  const calls = await captureWarn(() => runReport(
    fakeClient({ rowCount: 99999, rows: [] }),
    {},
  ))
  assert.equal(calls.length, 0)
})

test('runReport(): does not warn when response.rowCount is absent (dimension-less aggregate responses)', async () => {
  const calls = await captureWarn(() => runReport(
    fakeClient({ rows: [] }),
    { limit: 100 },
  ))
  assert.equal(calls.length, 0)
})

// #209 review 2: a deliberate top-N query (e.g. apiEndpointRes, whose
// downstream only reads the top 10 rows anyway) fired this warning as
// permanent noise on every `--snapshot` run. `opts.topN` lets that specific
// call site opt out — every other call site stays warn-eligible by default.
test('runReport(): does not warn when opts.topN is true, even if rowCount exceeds limit', async () => {
  const calls = await captureWarn(() => runReport(
    fakeClient({ rowCount: 572, rows: [] }),
    { limit: 50 },
    { topN: true },
  ))
  assert.equal(calls.length, 0)
})

test('runReport(): still warns when opts.topN is false/absent, even alongside other opts like soft', async () => {
  const calls = await captureWarn(() => runReport(
    fakeClient({ rowCount: 141, rows: [] }),
    { limit: 100 },
    { soft: true },
  ))
  assert.equal(calls.length, 1)
  assert.match(calls[0], /TRUNCATED/)
})

test('describeRequest(): labels an eventName-filtered request by its stringFilter value', () => {
  const label = describeRequest({
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'solver_start' } } },
  })
  assert.equal(label, 'eventName=solver_start')
})

test('describeRequest(): labels an inListFilter request by its joined values', () => {
  const label = describeRequest({
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: ['a', 'b'] } } },
  })
  assert.equal(label, 'eventName∈[a,b]')
})

test('describeRequest(): falls back to the dimension list when there is no eventName filter', () => {
  const label = describeRequest({ dimensions: [{ name: 'customEvent:rlv' }] })
  assert.equal(label, 'dimensions=[customEvent:rlv]')
})

test('describeRequest(): falls back to a generic label when there is neither a filter nor dimensions', () => {
  assert.equal(describeRequest({}), '(unlabeled request)')
})

// --- canAttributeMacroCopies() (#209 review 2) ------------------------------
// `solver_macro_copy` has never carried taxonomy in production — every row
// arrives with craftKind '(not set)'/''. This mirrors buildSolverHumanGlance()'s
// canAttributeFails logic: a real 0 (no events at all) must stay a real 0,
// but "events exist, none carry taxonomy" must NOT collapse to a confident 0.

test('canAttributeMacroCopies(): false when solver_macro_copy rows exist but NONE carry real taxonomy (today\'s live shape)', () => {
  const rows = [
    { craftKind: '(not set)', count: 300 },
    { craftKind: '', count: 147 },
  ]
  assert.equal(canAttributeMacroCopies(rows), false)
})

test('canAttributeMacroCopies(): true (real zero) when there are no solver_macro_copy rows at all', () => {
  assert.equal(canAttributeMacroCopies([]), true)
  assert.equal(canAttributeMacroCopies(), true)
})

test('canAttributeMacroCopies(): true the moment ANY row carries real taxonomy (self-heals if solver_macro_copy starts emitting craft_kind)', () => {
  const rows = [
    { craftKind: '(not set)', count: 300 },
    { craftKind: 'normal', count: 5 },
  ]
  assert.equal(canAttributeMacroCopies(rows), true)
})

test('canAttributeMacroCopies(): craftKind entirely absent (undefined key) counts the same as "(not set)"', () => {
  assert.equal(canAttributeMacroCopies([{ count: 50 }]), false)
})

// --- buildFailureRows() (#211) ----------------------------------------------
// Cost-mode dimension added to the existing failures chart. Unlike most pure
// functions in this file, this one intentionally takes the RAW GA4 row shape
// (dimensionValues[0..2] = eventName/reason/calc_mode, metricValues[0] =
// eventCount) — see the function's doc comment in ga-analyze.mjs for why.

function failureRow(eventName, reason, calcMode, count) {
  return {
    dimensionValues: [{ value: eventName }, { value: reason }, { value: calcMode }],
    metricValues: [{ value: String(count) }],
  }
}

test('buildFailureRows(): classifies eventName into solver/batch/wasm exactly like the pre-#211 inline mapping', () => {
  const rows = [
    failureRow('solver_failed', 'timeout', '(not set)', 5),
    failureRow('batch_optimization_failed', 'no route', 'macro', 3),
    failureRow('wasm_load_failed', 'SAB unavailable', '(not set)', 2),
  ]
  const out = buildFailureRows(rows)
  assert.deepEqual(out.map((r) => r.event).sort(), ['batch', 'solver', 'wasm'])
})

test('buildFailureRows(): count is the FULL aggregate across every calc_mode, unchanged from the pre-#211 total', () => {
  const rows = [
    failureRow('batch_optimization_failed', 'no route', 'macro', 12),
    failureRow('batch_optimization_failed', 'no route', 'quick-buy', 6),
    failureRow('batch_optimization_failed', 'no route', '(not set)', 4),
  ]
  const out = buildFailureRows(rows)
  assert.equal(out.length, 1)
  assert.equal(out[0].count, 22)
})

test('buildFailureRows(): costModeBreakdown only includes known calc_mode values, excludes the (not set) sentinel', () => {
  const rows = [
    failureRow('batch_optimization_failed', 'no route', 'macro', 12),
    failureRow('batch_optimization_failed', 'no route', 'quick-buy', 6),
    failureRow('batch_optimization_failed', 'no route', '(not set)', 4),
  ]
  const out = buildFailureRows(rows)
  assert.deepEqual(
    out[0].costModeBreakdown.sort((a, b) => a.costMode.localeCompare(b.costMode)),
    [{ costMode: 'macro', count: 12 }, { costMode: 'quick-buy', count: 6 }],
  )
})

test('buildFailureRows(): costModeBreakdown is undefined (not an empty array) for solver/wasm rows — calc_mode structurally does not exist on those events', () => {
  const rows = [
    failureRow('solver_failed', 'timeout', '(not set)', 5),
    failureRow('wasm_load_failed', 'SAB unavailable', '(not set)', 2),
  ]
  const out = buildFailureRows(rows)
  for (const row of out) {
    assert.equal(row.costModeBreakdown, undefined)
  }
})

test('buildFailureRows(): costModeBreakdown is undefined (not []) for a batch reason whose every row predates calc_mode', () => {
  const rows = [
    failureRow('batch_optimization_failed', 'legacy reason', '(not set)', 40),
  ]
  const out = buildFailureRows(rows)
  assert.equal(out[0].costModeBreakdown, undefined)
  assert.equal(out[0].count, 40) // the aggregate total is still real, just not attributable by mode
})

test('buildFailureRows(): a missing reason falls back to "(no reason)", same as the pre-#211 inline mapping', () => {
  const rows = [failureRow('solver_failed', '', '(not set)', 1)]
  const out = buildFailureRows(rows)
  assert.equal(out[0].reason, '(no reason)')
})

test('buildFailureRows(): empty/missing rows return an empty array', () => {
  assert.deepEqual(buildFailureRows([]), [])
  assert.deepEqual(buildFailureRows(), [])
})

// --- buildGearBucketBreakdown() (#211) --------------------------------------
// Same simplified row shape as buildSolverHumanGlance() above (this ticket
// adds gear_bucket as a 4th dimension to that SAME query, not a new one).

test('buildGearBucketBreakdown(): always returns all three buckets, even ones with zero traffic', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: 'bis', count: 10 },
  ]
  const out = buildGearBucketBreakdown(rows)
  assert.deepEqual(out.map((r) => r.bucket), ['entry', 'mid', 'bis'])
  const entry = out.find((r) => r.bucket === 'entry')
  assert.equal(entry.starts, 0)
  assert.equal(entry.completes, 0)
})

test('buildGearBucketBreakdown(): machine-originated rows are dropped entirely, same isMachineSolveRow() filter as buildSolverHumanGlance()', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: 'mid', count: 40 },
    { eventName: 'solver_start', craftKind: '(not set)', gearBucket: 'mid', count: 900 }, // machine
  ]
  const out = buildGearBucketBreakdown(rows)
  const mid = out.find((r) => r.bucket === 'mid')
  assert.equal(mid.starts, 40)
})

test('buildGearBucketBreakdown(): a row with an unrecognized/absent gear_bucket is dropped, not mis-bucketed', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: '(not set)', count: 500 },
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: 'mid', count: 10 },
  ]
  const out = buildGearBucketBreakdown(rows)
  const total = out.reduce((sum, r) => sum + r.starts, 0)
  assert.equal(total, 10, 'the 500 (not set) rows must not silently inflate any bucket')
})

test('buildGearBucketBreakdown(): completeRate per bucket is completes/starts, NOT clamped (same convention as CraftKindRow, #209 review 3)', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: 'entry', count: 100 },
    { eventName: 'solver_complete', craftKind: 'normal', source: 'user', gearBucket: 'entry', count: 103 },
  ]
  const out = buildGearBucketBreakdown(rows)
  const entry = out.find((r) => r.bucket === 'entry')
  assert.equal(entry.completeRate, 1.03)
})

test('buildGearBucketBreakdown(): fails is undefined (not 0) when solver_failed rows exist but NONE carry real taxonomy — mirrors the #200 humanFails guard', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: 'bis', count: 100 },
    { eventName: 'solver_failed', craftKind: '(not set)', source: '(not set)', gearBucket: 'bis', count: 6 },
  ]
  const out = buildGearBucketBreakdown(rows)
  const bis = out.find((r) => r.bucket === 'bis')
  assert.equal(bis.fails, undefined)
  assert.equal(bis.failRate, undefined)
})

test('buildGearBucketBreakdown(): fails is a real 0 for a bucket with no solver_failed rows at all, once attribution is possible elsewhere', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: 'entry', count: 50 },
    // Attribution proven possible by a DIFFERENT bucket's real-taxonomy failure.
    { eventName: 'solver_failed', craftKind: 'expert', source: 'user', gearBucket: 'bis', count: 1 },
  ]
  const out = buildGearBucketBreakdown(rows)
  const entry = out.find((r) => r.bucket === 'entry')
  assert.equal(entry.fails, 0)
  assert.equal(entry.failRate, 0)
})

test('buildGearBucketBreakdown(): fails resumes being a real number the moment ANY solver_failed row carries real taxonomy (self-heals, mirrors buildSolverHumanGlance())', () => {
  const rows = [
    { eventName: 'solver_start', craftKind: 'normal', source: 'user', gearBucket: 'mid', count: 40 },
    { eventName: 'solver_failed', craftKind: '(not set)', source: '(not set)', gearBucket: 'mid', count: 10 },
    { eventName: 'solver_failed', craftKind: 'expert', source: 'user', gearBucket: 'mid', count: 1 },
  ]
  const out = buildGearBucketBreakdown(rows)
  const mid = out.find((r) => r.bucket === 'mid')
  assert.equal(mid.fails, 1)
})

test('buildGearBucketBreakdown(): empty/missing rows still return all three buckets, all zeroed (real, attributable zero — no solver_failed rows at all)', () => {
  for (const out of [buildGearBucketBreakdown([]), buildGearBucketBreakdown()]) {
    assert.equal(out.length, 3)
    for (const row of out) {
      assert.equal(row.starts, 0)
      assert.equal(row.completes, 0)
      assert.equal(row.fails, 0)
    }
  }
})
