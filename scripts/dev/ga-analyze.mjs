#!/usr/bin/env node
// GA4 analytics pull + analysis report.
//
// Setup:
//   1. npm i -D @google-analytics/data
//   2. Put service-account JSON at ~/.ff14-craft-helper/ga-sa.json
//      (stable location outside the repo; override with GA_SA_PATH)
//      - Add the SA email as a Viewer on the GA4 property
//   3. Export GA_PROPERTY_ID=<numeric property id>
//   4. node scripts/dev/ga-analyze.mjs
//
// Outputs:
//   .tmp/ga/*.csv         raw query results
//   .tmp/ga/report.md     analysis answering the 3 questions

import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { OAuth2Client } from 'google-auth-library'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..', '..')
const OUT = path.join(ROOT, '.tmp', 'ga')
const HOME = process.env.HOME || process.env.USERPROFILE || ''
// Stable location outside the repo (survives `.tmp/` wipes). Override with GA_SA_PATH.
const SA_PATH = process.env.GA_SA_PATH
  || path.join(HOME, '.ff14-craft-helper', 'ga-sa.json')

function parseArgs(argv) {
  const args = { snapshot: false, out: null, history: null, windowDays: null }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--snapshot') args.snapshot = true
    else if (a === '--out')     args.out = argv[++i]
    else if (a === '--history') args.history = argv[++i]
    else if (a === '--window')  args.windowDays = Number(argv[++i])
  }
  return args
}
const CLI = parseArgs(process.argv)

const WINDOW_DAYS = CLI.windowDays ?? Number(process.env.GA_WINDOW_DAYS ?? 28)

async function main() {
  const propertyId = process.env.GA_PROPERTY_ID
  if (!propertyId) die('Missing env GA_PROPERTY_ID (numeric GA4 property id, NOT G-xxx)')
  if (!/^\d+$/.test(propertyId)) die(`GA_PROPERTY_ID must be numeric, got: ${propertyId}`)

  const accessToken = process.env.GA_ACCESS_TOKEN
  let client
  if (accessToken) {
    const oauth = new OAuth2Client()
    oauth.setCredentials({ access_token: accessToken })
    client = new BetaAnalyticsDataClient({ authClient: oauth })
  } else {
    try { await fs.access(SA_PATH) }
    catch { die(`Missing ${SA_PATH} (service-account JSON) — or set GA_ACCESS_TOKEN`) }
    client = new BetaAnalyticsDataClient({ keyFilename: SA_PATH })
  }

  await fs.mkdir(OUT, { recursive: true })
  const property = `properties/${propertyId}`
  const dateRanges = [{ startDate: `${WINDOW_DAYS}daysAgo`, endDate: 'today' }]

  console.log(`Pulling GA data for property ${propertyId}, last ${WINDOW_DAYS} days...`)

  // ---------------------------------------------------------------------------
  // Q1: top pages
  // ---------------------------------------------------------------------------
  const topPages = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'userEngagementDuration' },
      { name: 'engagementRate' },
      { name: 'bounceRate' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 50,
  })
  await writeCsv('top-pages.csv', topPages)

  // ---------------------------------------------------------------------------
  // Q1b: traffic source — to understand where users come from
  // ---------------------------------------------------------------------------
  const acquisition = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'engagementRate' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 20,
  })
  await writeCsv('acquisition.csv', acquisition)

  // ---------------------------------------------------------------------------
  // Q2: friction — event counts (overall + per-page)
  // ---------------------------------------------------------------------------
  const eventCounts = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 100,
  })
  await writeCsv('event-counts.csv', eventCounts)

  // Solver funnel: start vs complete vs failed
  const solverFunnel = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: {
          values: ['solver_start', 'solver_complete', 'solver_failed', 'wasm_load_failed', 'sab_unavailable'],
        },
      },
    },
  })
  await writeCsv('solver-funnel.csv', solverFunnel)

  // Batch funnel
  const batchFunnel = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: {
          values: [
            'batch_add_recipe',
            'batch_optimization_start',
            'batch_optimization_complete',
            'batch_optimization_cancelled',
            'batch_optimization_failed',
            'bom_calculate',
            'bom_send_to_batch',
          ],
        },
      },
    },
  })
  await writeCsv('batch-funnel.csv', batchFunnel)

  // Failure reasons — pull custom param `reason` (auto-collected as customEvent:reason)
  const failureReasons = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }, { name: 'customEvent:reason' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: ['solver_failed', 'batch_optimization_failed', 'wasm_load_failed'] },
      },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  }, { soft: true })
  if (failureReasons) await writeCsv('failure-reasons.csv', failureReasons)

  // Engagement time per page (proxy for "where do they get stuck or stay long?")
  const engagementPerPage = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [
      { name: 'screenPageViews' },
      { name: 'userEngagementDuration' },
      { name: 'averageSessionDuration' },
      { name: 'engagementRate' },
      { name: 'bounceRate' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 30,
  })
  await writeCsv('engagement-per-page.csv', engagementPerPage)

  // Web vitals — performance friction
  const webVitals = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:metric' }, { name: 'customEvent:rating' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'web_vitals' } } },
  }, { soft: true })
  if (webVitals) await writeCsv('web-vitals.csv', webVitals)

  // ---------------------------------------------------------------------------
  // Q3: retention / stickiness
  // ---------------------------------------------------------------------------
  const newVsReturning = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'engagementRate' },
      { name: 'averageSessionDuration' },
      { name: 'screenPageViewsPerSession' },
    ],
  })
  await writeCsv('new-vs-returning.csv', newVsReturning)

  // Returning users — top events (what keeps them coming back?)
  const returningEvents = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 40,
  })
  await writeCsv('returning-events.csv', returningEvents)

  // Returning users — top pages
  const returningPages = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }, { name: 'engagementRate' }],
    dimensionFilter: {
      filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning' } },
    },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 30,
  })
  await writeCsv('returning-pages.csv', returningPages)

  // Sessions per user — who comes back, broken down by entry page?
  const sessionsPerUser = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'sessionsPerUser' },
      { name: 'engagementRate' },
    ],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 30,
  })
  await writeCsv('sessions-per-user-by-landing.csv', sessionsPerUser)

  // ---------------------------------------------------------------------------
  // Q4: 2026-05-19 GA expansion — market_region / recipe taxonomy / page funnel
  // All queries are `soft: true` because the custom dimensions / user properties
  // must be registered in GA admin before the Data API will return them.
  // If a section returns no data, the report renders a "no data yet" placeholder.
  // ---------------------------------------------------------------------------

  // A. Funnels × market_region (user_property)
  const funnelsByRegion = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }, { name: 'customUser:market_region' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: [
          'solver_start', 'solver_complete', 'solver_macro_copy',
          'batch_optimization_start', 'batch_optimization_complete',
          'bom_calculate', 'bom_send_to_batch', 'bom_copy_list',
          'bom_target_add', 'bom_item_check',
        ]},
      },
    },
    limit: 100,
  }, { soft: true })
  if (funnelsByRegion) await writeCsv('funnels-by-region.csv', funnelsByRegion)

  // B. Onboarding milestone funnel
  const onboardingFunnel = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:step' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'first_session_milestone' } },
    },
  }, { soft: true })
  if (onboardingFunnel) await writeCsv('onboarding-funnel.csv', onboardingFunnel)

  // C. Top recipes (by recipe_select event count)
  const topRecipes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:recipe_id' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'recipe_select' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  }, { soft: true })
  if (topRecipes) await writeCsv('top-recipes.csv', topRecipes)

  // D. Recipe taxonomy: rlv distribution
  const recipeByRlv = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'recipe_select' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 25,
  }, { soft: true })
  if (recipeByRlv) await writeCsv('recipe-by-rlv.csv', recipeByRlv)

  // E. Recipe taxonomy: craft_kind × is_expert × is_collectable joint distribution
  const recipeByKind = await runReport(client, {
    property, dateRanges,
    dimensions: [
      { name: 'customEvent:craft_kind' },
      { name: 'customEvent:is_expert' },
      { name: 'customEvent:is_collectable' },
    ],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'recipe_select' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 40,
  }, { soft: true })
  if (recipeByKind) await writeCsv('recipe-by-kind.csv', recipeByKind)

  // F. recipe_open_source — which entry point dominates
  const recipeOpenSource = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:source' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'recipe_select' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
  }, { soft: true })
  if (recipeOpenSource) await writeCsv('recipe-open-source.csv', recipeOpenSource)

  // G. Misuse signals (page_misuse_hint × type)
  const misuseHints = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:type' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'page_misuse_hint' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
  }, { soft: true })
  if (misuseHints) await writeCsv('misuse-hints.csv', misuseHints)

  // H. recipe_name_locale_miss top item ids
  const localeMiss = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:kind' }, { name: 'customEvent:item_id' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'recipe_name_locale_miss' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  }, { soft: true })
  if (localeMiss) await writeCsv('locale-miss.csv', localeMiss)

  // I. api_failure breakdown
  const apiFailures = await runReport(client, {
    property, dateRanges,
    dimensions: [
      { name: 'customEvent:api' },
      { name: 'customEvent:endpoint' },
      { name: 'customEvent:status' },
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: {
      filter: { fieldName: 'eventName', stringFilter: { value: 'api_failure' } },
    },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  }, { soft: true })
  if (apiFailures) await writeCsv('api-failures.csv', apiFailures)

  // ---------------------------------------------------------------------------
  // Summary stats for the report
  // ---------------------------------------------------------------------------
  const summary = buildSummary({
    topPages, eventCounts, solverFunnel, batchFunnel,
    failureReasons, engagementPerPage, webVitals,
    newVsReturning, returningEvents, returningPages,
    acquisition,
    funnelsByRegion, onboardingFunnel, topRecipes,
    recipeByRlv, recipeByKind, recipeOpenSource,
    misuseHints, localeMiss, apiFailures,
  })
  await fs.writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))

  await writeReport(summary)

  console.log(`\nDone.`)
  console.log(`  CSVs:   ${path.relative(ROOT, OUT)}/*.csv`)
  console.log(`  Report: ${path.relative(ROOT, path.join(OUT, 'report.md'))}`)
}

// -----------------------------------------------------------------------------

// Best-effort human label for a request, used ONLY in the truncation warning
// below — never in the query itself. Tries the eventName filter's value(s)
// first (most requests here filter on eventName), falls back to the
// dimension list so an unfiltered request still gets a usable label.
// Exported for scripts/__tests__/ga-analyze.test.mjs's runReport() truncation
// tests, which construct a fake `client.runReport` and assert on the exact
// warning text — the shape of the LABEL (not the GA4 query-building this file
// deliberately doesn't unit-test) is what those tests pin down.
export function describeRequest(request) {
  const f = request.dimensionFilter?.filter
  if (f?.fieldName === 'eventName') {
    if (f.stringFilter?.value) return `eventName=${f.stringFilter.value}`
    if (f.inListFilter?.values) return `eventName∈[${f.inListFilter.values.join(',')}]`
  }
  const dims = request.dimensions?.map((d) => d.name).join(',')
  return dims ? `dimensions=[${dims}]` : '(unlabeled request)'
}

// Exported so scripts/dev/ga-backfill-active-users.mjs (#202's history
// backfill) can drive live GA4 requests the same way this module does,
// instead of duplicating client bootstrap / soft-fail plumbing.
export async function runReport(client, request, opts = {}) {
  try {
    const [response] = await client.runReport(request)
    // #209 review 1: `limit: 200` on the raw RLV queries silently truncated
    // real data before this check existed (7d had 103 keys, 28d had 141 —
    // both under the OLD limit:100, but the failure mode is the same shape
    // for ANY query here the moment its true row count grows past whatever
    // limit was picked). GA4 always returns `rowCount` — the TRUE number of
    // rows matching the query, independent of how many rows actually came
    // back — so a generic check here covers all ~15 call sites in this file
    // for free, instead of relying on someone noticing a chart looks thin.
    // response.rowCount is undefined for aggregate-only responses (no
    // dimensions), so the comparison naturally no-ops for those.
    //
    // #209 review 2: this fired as permanent noise on `apiEndpointRes`
    // (rowCount 192–572 vs limit 50, every single `--snapshot` run) because
    // that query is a DELIBERATE top-N leaderboard whose downstream only
    // reads the top 10 anyway — nothing is lost by truncating it. A warning
    // that fires on every cron run stops meaning anything, which would have
    // buried the ONE genuinely-exhaustive query that starts silently
    // truncating in the future among permanent expected noise. `opts.topN`
    // is how a call site declares "I deliberately only want the top N rows,
    // truncation here is expected, do not warn" — every other call site
    // stays warn-eligible by default (bias: an extra warning is cheap, a
    // missed real truncation is not).
    if (!opts.topN && request.limit && response.rowCount > request.limit) {
      console.warn(
        `  ⚠ TRUNCATED: ${describeRequest(request)} — rowCount=${response.rowCount} > limit=${request.limit} `
        + `(${response.rowCount - request.limit} row(s) silently dropped by GA4, raise the limit)`,
      )
    }
    return response
  } catch (err) {
    if (opts.soft) {
      console.warn(`  (soft) report failed: ${err.message}`)
      return null
    }
    throw err
  }
}

async function writeCsv(name, response) {
  if (!response) return
  const headers = [
    ...response.dimensionHeaders.map((h) => h.name),
    ...response.metricHeaders.map((h) => h.name),
  ]
  const lines = [headers.join(',')]
  for (const row of response.rows ?? []) {
    const dims = row.dimensionValues.map((v) => csvCell(v.value))
    const mets = row.metricValues.map((v) => csvCell(v.value))
    lines.push([...dims, ...mets].join(','))
  }
  await fs.writeFile(path.join(OUT, name), lines.join('\n') + '\n')
}

function csvCell(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function tableRows(response) {
  if (!response?.rows) return []
  return response.rows.map((row) => {
    const o = {}
    response.dimensionHeaders.forEach((h, i) => { o[h.name] = row.dimensionValues[i]?.value })
    response.metricHeaders.forEach((h, i) => { o[h.name] = Number(row.metricValues[i]?.value ?? 0) })
    return o
  })
}

function buildSummary(reports) {
  const r = Object.fromEntries(
    Object.entries(reports).map(([k, v]) => [k, tableRows(v)]),
  )

  const eventTotal = (name) => r.eventCounts.find((e) => e.eventName === name)?.eventCount ?? 0
  const eventUsers = (name) => r.eventCounts.find((e) => e.eventName === name)?.totalUsers ?? 0

  const solverStart = eventTotal('solver_start')
  const solverComplete = eventTotal('solver_complete')
  const solverFailed = eventTotal('solver_failed')
  const wasmLoadFailed = eventTotal('wasm_load_failed')
  const sabUnavailable = eventTotal('sab_unavailable')

  const batchStart = eventTotal('batch_optimization_start')
  const batchComplete = eventTotal('batch_optimization_complete')
  const batchCancelled = eventTotal('batch_optimization_cancelled')
  const batchFailed = eventTotal('batch_optimization_failed')
  const batchAddRecipe = eventTotal('batch_add_recipe')

  const bomCalculate = eventTotal('bom_calculate')
  const bomSendToBatch = eventTotal('bom_send_to_batch')

  const totalUsers = r.newVsReturning.reduce((s, x) => s + x.activeUsers, 0)
  const newUsers = r.newVsReturning.find((x) => x.newVsReturning === 'new')?.activeUsers ?? 0
  const returningUsers = r.newVsReturning.find((x) => x.newVsReturning === 'returning')?.activeUsers ?? 0

  return {
    window_days: WINDOW_DAYS,
    totals: { totalUsers, newUsers, returningUsers,
      returningRate: totalUsers ? returningUsers / totalUsers : 0 },
    topPages: r.topPages.slice(0, 15),
    acquisition: r.acquisition.slice(0, 10),
    funnels: {
      solver: {
        start: solverStart, complete: solverComplete, failed: solverFailed,
        completeRate: solverStart ? solverComplete / solverStart : 0,
        failRate: solverStart ? solverFailed / solverStart : 0,
        usersStart: eventUsers('solver_start'),
        usersComplete: eventUsers('solver_complete'),
      },
      batch: {
        addRecipe: batchAddRecipe,
        start: batchStart, complete: batchComplete,
        cancelled: batchCancelled, failed: batchFailed,
        completeRate: batchStart ? batchComplete / batchStart : 0,
        cancelRate: batchStart ? batchCancelled / batchStart : 0,
        failRate: batchStart ? batchFailed / batchStart : 0,
        usersStart: eventUsers('batch_optimization_start'),
        usersComplete: eventUsers('batch_optimization_complete'),
      },
      bom: {
        calculate: bomCalculate,
        sendToBatch: bomSendToBatch,
        conversionToBatch: bomCalculate ? bomSendToBatch / bomCalculate : 0,
      },
      infrastructure: { wasmLoadFailed, sabUnavailable },
    },
    failureReasons: r.failureReasons?.slice(0, 20) ?? [],
    webVitals: r.webVitals ?? [],
    engagementPerPage: r.engagementPerPage.slice(0, 15),
    newVsReturning: r.newVsReturning,
    returningEvents: r.returningEvents.slice(0, 25),
    returningPages: r.returningPages.slice(0, 15),
    // 2026-05-19 expansion (PR #40). Each is empty until the corresponding
    // custom dimension / user_property is registered in GA admin AND events
    // start flowing post-deploy.
    funnelsByRegion: r.funnelsByRegion ?? [],
    onboardingFunnel: r.onboardingFunnel ?? [],
    topRecipes: r.topRecipes ?? [],
    recipeByRlv: r.recipeByRlv ?? [],
    recipeByKind: r.recipeByKind ?? [],
    recipeOpenSource: r.recipeOpenSource ?? [],
    misuseHints: r.misuseHints ?? [],
    localeMiss: r.localeMiss ?? [],
    apiFailures: r.apiFailures ?? [],
    // Derived: page funnel drop rates from existing event counts.
    pageFunnel: derivePageFunnel(r.eventCounts),
  }
}

// Page funnel drop: ratio of "next step" events to "prior step" events.
// Per spec §4.3.4 the windowed version requires GA4 Explorations; here we
// surface the raw count ratios, which approximate the funnel when most users
// follow the same path in order.
function derivePageFunnel(eventCounts) {
  if (!eventCounts?.length) return null
  const total = (name) => eventCounts.find((e) => e.eventName === name)?.eventCount ?? 0
  const users = (name) => eventCounts.find((e) => e.eventName === name)?.totalUsers ?? 0

  const recipeSelect = total('recipe_select')
  const solverStart = total('solver_start')
  const solverComplete = total('solver_complete')
  const solverMacroCopy = total('solver_macro_copy')
  const batchAddRecipe = total('batch_add_recipe')
  const batchOptStart = total('batch_optimization_start')
  const bomCalculate = total('bom_calculate')
  // Any of these counts as "BOM result consumed" downstream:
  const bomConsumed = total('bom_item_check') + total('bom_copy_list')
    + total('bom_send_to_batch') + total('aetheryte_tp_copy')

  return {
    recipeToSolver: { from: recipeSelect, to: solverStart,
      rate: recipeSelect ? solverStart / recipeSelect : 0 },
    solverToMacro: { from: solverComplete, to: solverMacroCopy,
      rate: solverComplete ? solverMacroCopy / solverComplete : 0 },
    batchAddToOpt: { from: batchAddRecipe, to: batchOptStart,
      rate: batchAddRecipe ? batchOptStart / batchAddRecipe : 0 },
    bomCalcToConsumed: { from: bomCalculate, to: bomConsumed,
      rate: bomCalculate ? bomConsumed / bomCalculate : 0 },
    users: {
      recipeSelect: users('recipe_select'),
      solverStart: users('solver_start'),
      solverMacroCopy: users('solver_macro_copy'),
    },
  }
}

async function writeReport(s) {
  const pct = (n) => `${(n * 100).toFixed(1)}%`
  const num = (n) => n.toLocaleString('en-US')
  const sec = (ms) => `${(ms / 1000).toFixed(1)}s`

  const md = []
  md.push(`# GA Analysis — Last ${s.window_days} Days`)
  md.push('')
  md.push(`> Auto-generated by \`scripts/dev/ga-analyze.mjs\`. Raw CSVs in this directory.`)
  md.push('')

  md.push(`## At a glance`)
  md.push('')
  md.push(`- **Active users:** ${num(s.totals.totalUsers)} (new ${num(s.totals.newUsers)} / returning ${num(s.totals.returningUsers)} — **${pct(s.totals.returningRate)} returning**)`)
  md.push(`- **Solver:** ${num(s.funnels.solver.start)} starts → ${num(s.funnels.solver.complete)} completed (${pct(s.funnels.solver.completeRate)}), ${num(s.funnels.solver.failed)} failed (${pct(s.funnels.solver.failRate)})`)
  md.push(`- **Batch optimisation:** ${num(s.funnels.batch.start)} starts → ${num(s.funnels.batch.complete)} done (${pct(s.funnels.batch.completeRate)}); ${pct(s.funnels.batch.cancelRate)} cancelled, ${pct(s.funnels.batch.failRate)} failed`)
  md.push(`- **BOM → Batch handoff:** ${num(s.funnels.bom.calculate)} calculations → ${num(s.funnels.bom.sendToBatch)} sent to batch (${pct(s.funnels.bom.conversionToBatch)})`)
  if (s.funnels.infrastructure.wasmLoadFailed || s.funnels.infrastructure.sabUnavailable) {
    md.push(`- **Infra warnings:** ${num(s.funnels.infrastructure.wasmLoadFailed)} WASM load failures, ${num(s.funnels.infrastructure.sabUnavailable)} SAB unavailable`)
  }
  md.push('')

  md.push(`## Q1 — Most-used pages`)
  md.push('')
  md.push(`| Page | Title | Views | Users | Sessions | Engagement | Bounce |`)
  md.push(`| --- | --- | ---: | ---: | ---: | ---: | ---: |`)
  for (const p of s.topPages) {
    md.push(`| \`${p.pagePath || '/'}\` | ${ellipsis(p.pageTitle, 40)} | ${num(p.screenPageViews)} | ${num(p.activeUsers)} | ${num(p.sessions)} | ${pct(p.engagementRate)} | ${pct(p.bounceRate)} |`)
  }
  md.push('')

  md.push(`### Where do visitors arrive from?`)
  md.push('')
  md.push(`| Channel | Source | Sessions | Users | Engagement |`)
  md.push(`| --- | --- | ---: | ---: | ---: |`)
  for (const a of s.acquisition) {
    md.push(`| ${a.sessionDefaultChannelGroup} | ${a.sessionSource} | ${num(a.sessions)} | ${num(a.activeUsers)} | ${pct(a.engagementRate)} |`)
  }
  md.push('')

  md.push(`## Q2 — Friction points`)
  md.push('')
  md.push(`### Solver funnel`)
  md.push('')
  md.push(`- Start → Complete: **${pct(s.funnels.solver.completeRate)}** (${num(s.funnels.solver.start)} → ${num(s.funnels.solver.complete)})`)
  md.push(`- Fail rate: **${pct(s.funnels.solver.failRate)}** (${num(s.funnels.solver.failed)} failures)`)
  md.push(`- User reach: ${num(s.funnels.solver.usersStart)} unique users started, ${num(s.funnels.solver.usersComplete)} saw a result`)
  md.push('')
  md.push(`### Batch optimisation funnel`)
  md.push('')
  md.push(`- Add recipe events: ${num(s.funnels.batch.addRecipe)}`)
  md.push(`- Start → Complete: **${pct(s.funnels.batch.completeRate)}**`)
  md.push(`- Cancelled: ${pct(s.funnels.batch.cancelRate)} | Failed: ${pct(s.funnels.batch.failRate)}`)
  md.push(`- Unique users reaching start: ${num(s.funnels.batch.usersStart)}, completing: ${num(s.funnels.batch.usersComplete)}`)
  md.push('')

  if (s.failureReasons.length) {
    md.push(`### Top failure reasons`)
    md.push('')
    md.push(`| Event | Reason | Count |`)
    md.push(`| --- | --- | ---: |`)
    for (const f of s.failureReasons) {
      md.push(`| ${f.eventName} | ${ellipsis(f['customEvent:reason'], 80)} | ${num(f.eventCount)} |`)
    }
    md.push('')
  }

  if (s.webVitals.length) {
    md.push(`### Web vitals (perf friction)`)
    md.push('')
    md.push(`| Metric | Rating | Count |`)
    md.push(`| --- | --- | ---: |`)
    for (const v of s.webVitals) {
      md.push(`| ${v['customEvent:metric']} | ${v['customEvent:rating']} | ${num(v.eventCount)} |`)
    }
    md.push('')
  }

  md.push(`### Engagement vs bounce per page`)
  md.push('')
  md.push(`| Page | Views | Avg session | Engagement | Bounce |`)
  md.push(`| --- | ---: | ---: | ---: | ---: |`)
  for (const p of s.engagementPerPage) {
    md.push(`| \`${p.pagePath || '/'}\` | ${num(p.screenPageViews)} | ${sec(p.averageSessionDuration * 1000)} | ${pct(p.engagementRate)} | ${pct(p.bounceRate)} |`)
  }
  md.push('')

  md.push(`## Q3 — What brings users back?`)
  md.push('')
  md.push(`### New vs returning`)
  md.push('')
  md.push(`| Bucket | Users | Sessions | Engagement | Avg session | Pages/session |`)
  md.push(`| --- | ---: | ---: | ---: | ---: | ---: |`)
  for (const x of s.newVsReturning) {
    md.push(`| ${x.newVsReturning} | ${num(x.activeUsers)} | ${num(x.sessions)} | ${pct(x.engagementRate)} | ${sec(x.averageSessionDuration * 1000)} | ${x.screenPageViewsPerSession?.toFixed(2)} |`)
  }
  md.push('')

  md.push(`### Top events among returning users`)
  md.push('')
  md.push(`| Event | Count | Users |`)
  md.push(`| --- | ---: | ---: |`)
  for (const e of s.returningEvents) {
    md.push(`| ${e.eventName} | ${num(e.eventCount)} | ${num(e.totalUsers)} |`)
  }
  md.push('')

  md.push(`### Pages returning users visit`)
  md.push('')
  md.push(`| Page | Views | Users | Engagement |`)
  md.push(`| --- | ---: | ---: | ---: |`)
  for (const p of s.returningPages) {
    md.push(`| \`${p.pagePath || '/'}\` | ${num(p.screenPageViews)} | ${num(p.activeUsers)} | ${pct(p.engagementRate)} |`)
  }
  md.push('')

  // -- Q4 — 2026-05-19 expansion ----------------------------------------------
  md.push(`## Q4 — Post-2026-05-19 dimensions`)
  md.push('')
  md.push(`> Backfilled by PR #40. Sections show "no data yet" until the custom dimensions / user properties are registered in GA admin AND production deploy has had time to accumulate events.`)
  md.push('')

  // Page funnel drop (derived from existing events; always renderable)
  if (s.pageFunnel) {
    md.push(`### Page funnel drop rates`)
    md.push('')
    md.push(`| Funnel | From → To | Count → Count | Rate |`)
    md.push(`| --- | --- | ---: | ---: |`)
    const f = s.pageFunnel
    md.push(`| Recipe → Solver | recipe_select → solver_start | ${num(f.recipeToSolver.from)} → ${num(f.recipeToSolver.to)} | ${pct(f.recipeToSolver.rate)} |`)
    md.push(`| Solver → Macro | solver_complete → solver_macro_copy | ${num(f.solverToMacro.from)} → ${num(f.solverToMacro.to)} | ${pct(f.solverToMacro.rate)} |`)
    md.push(`| Batch prep → Optimize | batch_add_recipe → batch_optimization_start | ${num(f.batchAddToOpt.from)} → ${num(f.batchAddToOpt.to)} | ${pct(f.batchAddToOpt.rate)} |`)
    md.push(`| BOM → Consumed | bom_calculate → (item_check ∪ copy_list ∪ send_to_batch ∪ tp_copy) | ${num(f.bomCalcToConsumed.from)} → ${num(f.bomCalcToConsumed.to)} | ${pct(f.bomCalcToConsumed.rate)} |`)
    md.push('')
    md.push(`*Rates >100% / very low rates often mean inflated denominators: \`solver_start\` / \`solver_complete\` include batch optimizer's per-recipe internal solves, not just user-initiated ones. \`solver_macro_copy\` only fires from the user-facing MacroExport. Treat absolute rates as noisy and compare across reports to track direction.*`)
    md.push('')
  }

  // A. Funnels × market_region
  md.push(`### Funnels × market_region`)
  md.push('')
  if (s.funnelsByRegion.length) {
    md.push(`| Event | Region | Count | Users |`)
    md.push(`| --- | --- | ---: | ---: |`)
    for (const f of s.funnelsByRegion) {
      md.push(`| ${f.eventName} | ${f['customUser:market_region'] || '(unset)'} | ${num(f.eventCount)} | ${num(f.totalUsers)} |`)
    }
  } else {
    md.push(`_No data yet. Register the \`market_region\` user property as a custom dimension in GA admin, then wait ~24h post-deploy for data to accumulate._`)
  }
  md.push('')

  // B. Onboarding milestone funnel
  md.push(`### Onboarding milestone funnel`)
  md.push('')
  if (s.onboardingFunnel.length) {
    const order = ['viewed_recipe', 'ran_solver', 'saw_macro', 'used_batch']
    const sorted = [...s.onboardingFunnel].sort(
      (a, b) => order.indexOf(a['customEvent:step']) - order.indexOf(b['customEvent:step']),
    )
    md.push(`| Step | Users reaching | Events |`)
    md.push(`| --- | ---: | ---: |`)
    for (const m of sorted) {
      md.push(`| ${m['customEvent:step']} | ${num(m.totalUsers)} | ${num(m.eventCount)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`step\` as a custom dimension on the \`first_session_milestone\` event in GA admin._`)
  }
  md.push('')

  // C. Top recipes
  md.push(`### Top recipes (by recipe_select)`)
  md.push('')
  if (s.topRecipes.length) {
    md.push(`| Recipe ID | Selects | Users |`)
    md.push(`| --- | ---: | ---: |`)
    for (const r of s.topRecipes.slice(0, 20)) {
      md.push(`| \`${r['customEvent:recipe_id']}\` | ${num(r.eventCount)} | ${num(r.totalUsers)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`recipe_id\` as a custom dimension on \`recipe_select\` in GA admin._`)
  }
  md.push('')

  // D. Recipe taxonomy: rlv distribution
  md.push(`### Recipe selects by rlv`)
  md.push('')
  if (s.recipeByRlv.length) {
    md.push(`| rlv | Selects |`)
    md.push(`| --- | ---: |`)
    for (const r of s.recipeByRlv) {
      md.push(`| ${r['customEvent:rlv']} | ${num(r.eventCount)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`rlv\` as a custom dimension on \`recipe_select\` in GA admin._`)
  }
  md.push('')

  // E. Recipe taxonomy: craft_kind × is_expert × is_collectable
  md.push(`### Recipe selects by craft_kind × is_expert × is_collectable`)
  md.push('')
  if (s.recipeByKind.length) {
    md.push(`| craft_kind | is_expert | is_collectable | Selects | Users |`)
    md.push(`| --- | --- | --- | ---: | ---: |`)
    for (const r of s.recipeByKind) {
      md.push(`| ${r['customEvent:craft_kind']} | ${r['customEvent:is_expert']} | ${r['customEvent:is_collectable']} | ${num(r.eventCount)} | ${num(r.totalUsers)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`craft_kind\` / \`is_expert\` / \`is_collectable\` as custom dimensions on \`recipe_select\` in GA admin._`)
  }
  md.push('')

  // F. Recipe open source
  md.push(`### Recipe open source (entry point)`)
  md.push('')
  if (s.recipeOpenSource.length) {
    md.push(`| Source | Selects | Users |`)
    md.push(`| --- | ---: | ---: |`)
    for (const r of s.recipeOpenSource) {
      md.push(`| ${r['customEvent:source']} | ${num(r.eventCount)} | ${num(r.totalUsers)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`source\` as a custom dimension on \`recipe_select\` in GA admin._`)
  }
  md.push('')

  // G. Misuse signals
  md.push(`### Page misuse signals`)
  md.push('')
  if (s.misuseHints.length) {
    md.push(`| Type | Events | Users affected |`)
    md.push(`| --- | ---: | ---: |`)
    for (const r of s.misuseHints) {
      md.push(`| ${r['customEvent:type']} | ${num(r.eventCount)} | ${num(r.totalUsers)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`type\` as a custom dimension on \`page_misuse_hint\` in GA admin._`)
  }
  md.push('')

  // H. Locale miss top items
  md.push(`### Locale miss top items (zh-TW fallback)`)
  md.push('')
  if (s.localeMiss.length) {
    md.push(`| Kind | Item ID | Misses | Users |`)
    md.push(`| --- | --- | ---: | ---: |`)
    for (const r of s.localeMiss) {
      md.push(`| ${r['customEvent:kind']} | \`${r['customEvent:item_id']}\` | ${num(r.eventCount)} | ${num(r.totalUsers)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`kind\` and \`item_id\` as custom dimensions on \`recipe_name_locale_miss\` in GA admin._`)
  }
  md.push('')

  // I. API failure breakdown
  md.push(`### API failure breakdown`)
  md.push('')
  if (s.apiFailures.length) {
    md.push(`| API | Endpoint | Status | Count |`)
    md.push(`| --- | --- | --- | ---: |`)
    for (const r of s.apiFailures) {
      md.push(`| ${r['customEvent:api']} | ${ellipsis(r['customEvent:endpoint'], 50)} | ${r['customEvent:status']} | ${num(r.eventCount)} |`)
    }
  } else {
    md.push(`_No data yet. Register \`api\`, \`endpoint\`, \`status\` as custom dimensions on \`api_failure\` in GA admin (\`universalis_fetch\` legacy event still firing in parallel until deprecation)._`)
  }
  md.push('')

  md.push(`---`)
  md.push('')
  md.push(`*Sanity check the numbers before quoting — small sample windows are noisy. If a metric looks off, open the corresponding CSV in this folder and cross-check in GA UI.*`)
  md.push('')

  await fs.writeFile(path.join(OUT, 'report.md'), md.join('\n'))
}

function ellipsis(s, n) {
  if (!s) return ''
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

function die(msg) {
  console.error(`ERROR: ${msg}`)
  process.exit(1)
}

async function runSnapshot() {
  const propertyId = process.env.GA_PROPERTY_ID
  if (!propertyId) die('Missing env GA_PROPERTY_ID')
  const client = await buildClient()

  const out = CLI.out ?? path.join(ROOT, 'public', 'data', 'ga-snapshot.json')
  const historyDir = CLI.history  // optional

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    propertyId,
    windows: {},
  }

  for (const days of [7, 14, 28]) {
    const key = `${days}d`
    console.log(`[snapshot] querying ${key}...`)
    snapshot.windows[key] = await buildBundle(client, propertyId, days)
  }

  await fs.mkdir(path.dirname(out), { recursive: true })
  await fs.writeFile(out, JSON.stringify(snapshot, null, 2))
  console.log(`[snapshot] wrote ${out}`)

  if (historyDir) {
    const stamp = snapshot.generatedAt.slice(0, 10)  // YYYY-MM-DD
    const histPath = path.join(historyDir, `${stamp}.json`)
    await fs.mkdir(historyDir, { recursive: true })
    await fs.writeFile(histPath, JSON.stringify(snapshot, null, 2))
    console.log(`[snapshot] archived ${histPath}`)
  }
}

// Exported for the same reason as runReport() above — reused by
// scripts/dev/ga-backfill-active-users.mjs.
export async function buildClient() {
  const accessToken = process.env.GA_ACCESS_TOKEN
  if (accessToken) {
    const oauth = new OAuth2Client()
    oauth.setCredentials({ access_token: accessToken })
    return new BetaAnalyticsDataClient({ authClient: oauth })
  }
  try { await fs.access(SA_PATH) }
  catch { die(`Missing ${SA_PATH} (service-account JSON)`) }
  return new BetaAnalyticsDataClient({ keyFilename: SA_PATH })
}

async function buildBundle(client, propertyId, days) {
  const property = `properties/${propertyId}`
  const dateRanges = [{ startDate: `${days}daysAgo`, endDate: 'today' }]

  // helper for date string
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - days)
  const fmt = (d) => d.toISOString().slice(0, 10)

  // --- Q1: pages ----------------------------------------------------------
  // Top-N (#209 review 2): `pages` is rendered as a "top pages" leaderboard
  // (bundle field consumed directly, no further slicing downstream) —
  // `orderBys`+`limit: 20` IS the product intent, not an accidental cap.
  // Long-tail paths (rare query-string variants etc.) are meant to fall off;
  // nothing downstream needs the exhaustive page-path set to sum correctly.
  const pagesRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
    metrics: [
      { name: 'screenPageViews' }, { name: 'totalUsers' },
      { name: 'sessions' }, { name: 'userEngagementDuration' },
      { name: 'engagementRate' }, { name: 'bounceRate' },
    ],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 20,
  }, { topN: true })
  const pages = (pagesRes?.rows ?? []).map((r) => mapPageRow(r))

  // --- Q2: funnels --------------------------------------------------------
  const evCounts = await fetchEventCounts(client, property, dateRanges, [
    'solver_start', 'solver_complete', 'solver_failed',
    'batch_optimization_start', 'batch_optimization_complete',
    'batch_optimization_failed', 'batch_optimization_cancelled',
    'page_view', 'solver_macro_copy', 'recipe_select',
    'bom_calculate', 'bom_send_to_batch', 'bom_item_check',
    'bom_copy_list', 'bom_target_add', 'aetheryte_tp_copy',
    'batch_add_recipe',
    'web_vitals',
    'wasm_load_failed', 'sab_unavailable',
    // #203: meld-advisor adoption denominator. Unregistered event name (no
    // dimension, no 28-day dark clock) — folding it into this existing query
    // is a free "+0" per #189's pipeline cost table (item 6).
    'meld_advisor_run',
  ])

  // Conversion funnels — entry → the value endpoint, NOT ending at failures.
  // Solver converges on solver_macro_copy (the user actually exported a macro);
  // batch has no macro-copy event, so its endpoint is optimization-complete.
  // Failure/cancel counts are surfaced in the failures breakdown + glance, not
  // as a funnel terminal, so the funnel reads as "how many converted".
  const solverFunnel = [
    { step: 'solver_start',      count: evCounts.get('solver_start') ?? 0,      tone: 'neutral' },
    { step: 'solver_complete',   count: evCounts.get('solver_complete') ?? 0,   tone: 'success' },
    { step: 'solver_macro_copy', count: evCounts.get('solver_macro_copy') ?? 0, tone: 'success' },
  ]

  const batchFunnel = [
    { step: 'batch_add',      count: evCounts.get('batch_add_recipe') ?? 0,            tone: 'neutral' },
    { step: 'batch_start',    count: evCounts.get('batch_optimization_start') ?? 0,    tone: 'neutral' },
    { step: 'batch_complete', count: evCounts.get('batch_optimization_complete') ?? 0, tone: 'success' },
  ]

  // --- Q2: simulator funnel (inferred) ------------------------------------
  const simulatorPageView = pages.find((p) => p.path === '/simulator')
  const simulatorFunnel = {
    entry: {
      label: '/simulator page_view',
      count: simulatorPageView?.views ?? 0,
      users: simulatorPageView?.users ?? 0,
    },
    macroCopy: {
      label: 'solver_macro_copy',
      count: evCounts.get('solver_macro_copy') ?? 0,
      users: await uniqueUsersForEvent(client, property, dateRanges, 'solver_macro_copy'),
    },
    globalContext: [
      { label: 'recipe_select (any page)',   count: evCounts.get('recipe_select') ?? 0 },
      { label: 'solver_start (any page)',    count: evCounts.get('solver_start') ?? 0 },
      { label: 'solver_complete (any page)', count: evCounts.get('solver_complete') ?? 0 },
    ],
  }

  // --- Q2: failures -------------------------------------------------------
  // NOT top-N (#209 review 2): `orderBys`/`limit` here are display-order
  // only — FailuresBar.vue renders every row it's given (re-sorts itself,
  // never slices), and `reason` is a free-form error MESSAGE (`err.message`
  // at the throw site, not an enum), so its cardinality isn't bounded the
  // way e.g. misuse `type` is. A truncation here would silently hide a real,
  // possibly-rare failure reason from the diagnostic chart — stays
  // warn-eligible.
  //
  // #211: `customEvent:calc_mode` added as a 3rd dimension so the existing
  // (event, reason) rows can also carry a per-batch-reason cost-mode split
  // ('macro' | 'quick-buy') — see `buildFailureRows()` below. `calc_mode`
  // only exists on `batch_optimization_failed` (BatchView.vue); solver/wasm
  // rows report GA4's `(not set)` sentinel here, which `buildFailureRows()`
  // excludes from the breakdown rather than mis-attributing. `limit` raised
  // 30 → 200 (was already exhaustive, not top-N — adding a 3rd dimension
  // multiplies row count by calc_mode's ~3 observed values, so the old
  // headroom no longer holds).
  const failuresRes = await runReport(client, {
    property, dateRanges,
    dimensions: [
      { name: 'eventName' },
      { name: 'customEvent:reason' },
      { name: 'customEvent:calc_mode' },
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: {
      values: ['solver_failed', 'batch_optimization_failed', 'wasm_load_failed'] } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 200,
  }, { soft: true })
  const failures = buildFailureRows(failuresRes?.rows ?? [])

  // --- Q2: vitals ---------------------------------------------------------
  const vitalsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:metric' }, { name: 'customEvent:rating' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'web_vitals' } } },
    limit: 60,
  }, { soft: true })
  const vitals = buildVitalsRows(vitalsRes?.rows ?? [])

  // --- flip -----------------------------------------------------------
  // newVsReturning × (totalUsers, sessions). No longer surfaced as its own
  // dashboard chart (#196 cut FlipBands) or bundle field, but this query is
  // PERMANENTLY required, not a transitional leftover: glance.activeUsers
  // below reads all four of total/new/returning/returningPct off `flip.users`.
  // #202 (dimension-less totalUsers query) only replaces the denominator
  // behind `total`/`returningPct` — `new` and `returning` are plain per-row
  // user counts and #202 explicitly does NOT touch them (its numerator was
  // already clean; only the denominator was inflated). Do not delete this
  // query when #202 lands, or the new/returning split on the hero band goes
  // to zero.
  const flipRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
  })
  const flip = mapFlip(flipRes?.rows ?? [])

  // --- Q4: funnel drop rates (reuse existing helpers) ---------------------
  // Only comparable, single-meaning conversions. Dropped:
  //   - Recipe → Solver: solver_start is inflated by the batch optimiser's
  //     per-recipe internal solves, so it exceeds recipe_select (>100% "drop").
  //   - Solver → Macro: better served by the simulator funnel, which uses a
  //     clean /simulator page_view denominator instead of inflated solver_complete.
  // Conversion colour is direction-aware and threshold-based so the same rate
  // always reads the same way across funnels: higher conversion = greener.
  // (Flags used to be hand-set, which made the lowest-rate funnel render GREEN
  // even as the Q2 TL;DR called that same funnel the biggest leak — color and
  // prose contradicting each other. Derive both from the rate instead.)
  const rateVerdict = (from, to) => {
    const rate = from > 0 ? to / from : 0
    if (rate >= 0.5) return { flag: 'ok', note: '轉換健康' }
    if (rate >= 0.3) return { flag: 'warn', note: '轉換待觀察' }
    return { flag: 'danger', note: '轉換偏低' }
  }
  const q4FunnelsRaw = [
    { name: 'Batch prep → Optimize', label: 'batch_add_recipe → batch_opt_start',
      from: evCounts.get('batch_add_recipe') ?? 0, to: evCounts.get('batch_optimization_start') ?? 0 },
    // "Consumed" = downstream uses of the calculated BOM. bom_target_add is
    // UPSTREAM (you add a target before calculating), so including it pushed the
    // rate over 100%; use aetheryte_tp_copy instead, matching derivePageFunnel.
    { name: 'BOM → Consumed', label: 'bom_calculate → (any consume)',
      from: evCounts.get('bom_calculate') ?? 0,
      to: ['bom_item_check', 'bom_copy_list', 'bom_send_to_batch', 'aetheryte_tp_copy']
        .map((n) => evCounts.get(n) ?? 0).reduce((a, b) => a + b, 0) },
  ]
  const q4Funnels = q4FunnelsRaw.map((f) => ({ ...f, ...rateVerdict(f.from, f.to) }))

  // --- Q4: market_region --------------------------------------------------
  const mrRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }, { name: 'customUser:market_region' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: {
      values: ['solver_start', 'solver_complete', 'batch_optimization_start',
               'batch_optimization_complete', 'bom_calculate', 'bom_send_to_batch',
               'solver_macro_copy'] } } },
    limit: 80,
  }, { soft: true })
  const marketRegion = buildMarketRegion(mrRes?.rows ?? [])

  // --- glance.api: universalis 真故障率分子分母 (#201) ---------------------
  // Numerator and denominator MUST come from the same event. `apiFailures`
  // (built off `api_failure`) is a different, slightly out-of-sync stream —
  // 3.5% higher on both failure buckets (#189 決定 3) — so it stays
  // drill-down-only and is never mixed in here. `ok`/`status` are both
  // already-registered, fully-backfillable dims (no 28-day dark period).
  const universalisRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:ok' }, { name: 'customEvent:status' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'universalis_fetch' } } },
    limit: 50,
  }, { soft: true })
  let universalisCalls = 0
  let universalisRealFails = 0
  let universalisNoListing = 0
  let universalisOtherFails = 0
  for (const r of universalisRes?.rows ?? []) {
    const count = Number(r.metricValues[0].value)
    universalisCalls += count
    const cls = classifyUniversalisFetchRow({
      ok: r.dimensionValues[0].value,
      status: r.dimensionValues[1].value,
    })
    if (cls === 'real-fail') universalisRealFails += count
    else if (cls === 'no-listing') universalisNoListing += count
    else if (cls === 'other-fail') universalisOtherFails += count
  }

  // --- glance.solver: human-face denominators (#200) ----------------------
  // Applies isMachineSolveRow() (#198) to solver's OWN funnel counts — until
  // now the discriminator was wired into exactly one consumer
  // (toolUsageByRlv.simulatorCount, #198/#190) while glance.solver.starts/
  // completes/fails stayed full-population (machine + human) denominators.
  // craft_kind + source ride along on ALL THREE solver_* events so each row
  // can be classified before aggregating — combined into ONE runReport across
  // solver_start/_complete/_failed (#189's pipeline cost table counts this as
  // "+1", not "+3"). `starts`/`completes`/`fails`/`completePct` below are left
  // untouched (still full-population, per #200 issue body: "既有四欄維持全量
  // （含機器），新增人類面"); only the five new `human*`/`macroCopies` fields
  // are added.
  //
  // #211: `customEvent:gear_bucket` added as a 4th dimension — it rides the
  // SAME three solver_* events (worker.ts sets it on every solve attempt, not
  // a different event), so the 裝備水準×求解結果 chart below is +0 runReport
  // calls, not +1. `gear_bucket` has been registered/emitted on solver_start
  // for a while (no dark period on THAT leg), but solver_complete/solver_failed
  // only started carrying it in #198 (client fix, not yet deployed to
  // production as of this ticket) — same "no dark period on the dimension
  // itself, but not backfillable" shape as `craft_kind`/`source` above.
  const solverHumanRes = await runReport(client, {
    property, dateRanges,
    dimensions: [
      { name: 'eventName' },
      { name: 'customEvent:craft_kind' },
      { name: 'customEvent:source' },
      { name: 'customEvent:gear_bucket' },
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: {
      values: ['solver_start', 'solver_complete', 'solver_failed'] } } },
    limit: 1000,
  }, { soft: true })
  const solverHumanRows = (solverHumanRes?.rows ?? []).map((r) => ({
    eventName: r.dimensionValues[0].value,
    craftKind: r.dimensionValues[1].value,
    source: r.dimensionValues[2].value,
    gearBucket: r.dimensionValues[3].value,
    count: Number(r.metricValues[0].value),
  }))
  const solverHuman = buildSolverHumanGlance(solverHumanRows)

  // --- Chart: 裝備水準 × 求解結果 (#211, spec #194 §C3) ---------------------
  // Reuses solverHumanRows (gear_bucket rides the same query as the human
  // denominators above) — see buildGearBucketBreakdown()'s doc comment.
  // Omitted entirely (not an empty array) when this window has zero
  // solver_start/_complete/_failed rows at all, mirroring the `hasTaxonomy`
  // gate below.
  const gearBucketBreakdown = solverHumanRows.length
    ? buildGearBucketBreakdown(solverHumanRows)
    : undefined

  // --- glance.adoption: cross-server usage + meld-advisor adoption (#203) --
  // Two C-class "decide the next feature" denominators. Both custom dimensions
  // (`cross_server`, `fields`) were hand-registered 2026-07-31 (no Admin API
  // access on this property — #186 決定 5); neither backfills, so the series
  // has a real 28-day dark window until roughly 2026-08-28 (see the
  // `chart-adoption` placeholder in GaDashboardView.vue, which hard-codes the
  // same date). `meld_advisor_run` needs none of that — it's an unregistered
  // event name, folded into `evCounts` above instead of a dedicated query.
  //
  // `batchStarts` intentionally re-derives its own `batch_optimization_start`
  // total from THIS query rather than reading `evCounts.get('batch_optimization_start')`
  // (used by `glance.batch.starts` above) — same underlying event today, but a
  // deliberately separate code path so the two denominators (batch health vs.
  // cross-server-adoption rate) can diverge later without silently dragging
  // each other along (#203 issue body: "語意獨立，刻意不與 batch.starts 共用").
  const crossServerRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:cross_server' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'batch_optimization_start' } } },
    limit: 10,
  }, { soft: true })
  const crossServerRows = (crossServerRes?.rows ?? []).map((r) => ({
    crossServer: r.dimensionValues[0].value,
    count: Number(r.metricValues[0].value),
  }))

  // `meldApplies` numerator: `gearset_apply_all` rows whose `fields` matches
  // one of the meld-advisor's two writer branches (#189 決定 2) —
  // useSimulator.ts's scope==='all' branch (`fields: 'meld_delta'`) and its
  // scope==='this' branch (`fields: 'meld_delta_single'`). gearsets.ts:61's
  // generic field-edit writer ALSO fires `gearset_apply_all`, but with a
  // comma-joined `fields` list (e.g. `level,craftsmanship,control,cp`) — that
  // form deliberately does not match either literal below, so it's excluded
  // (it isn't a meld-advisor apply).
  const meldFieldsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:fields' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'gearset_apply_all' } } },
    limit: 20,
  }, { soft: true })
  const meldFieldsRows = (meldFieldsRes?.rows ?? []).map((r) => ({
    fields: r.dimensionValues[0].value,
    count: Number(r.metricValues[0].value),
  }))

  const adoption = buildAdoptionGlance({
    crossServerRows,
    meldFieldsRows,
    meldAdvisorRuns: evCounts.get('meld_advisor_run') ?? 0,
  })

  // --- v2 dashboard fields (additive; OMITs unavailable fields) -----------
  const v2 = await buildV2Fields(client, property, dateRanges, { evCounts, flip })

  // --- glance.activeUsers.total: dimension-less single query (#202) -------
  // Summing flip's three newVsReturning buckets (as this used to) inflates
  // the count ~27.8% (1401 vs 1096 in a 28-day probe): a user who crosses
  // from 'new' to 'returning' mid-window, or whose bucket is ambiguous
  // across sessions, gets counted once per bucket they touch. A plain
  // dimension-less totalUsers report dedupes once, globally, per GA4's own
  // definition of activeUsers. `new` / `returning` themselves are untouched
  // — see the giant comment above flipRes: they're single-row, already-clean
  // per-bucket counts, not a sum.
  const activeUsersRes = await runReport(client, {
    property, dateRanges,
    metrics: [{ name: 'totalUsers' }],
  })
  const activeUsersTotal = Number(activeUsersRes?.rows?.[0]?.metricValues?.[0]?.value ?? 0)

  // --- glance summary -----------------------------------------------------
  const glance = {
    activeUsers: buildActiveUsersGlance({
      dimensionlessTotal: activeUsersTotal,
      flipNew: flip.users.new,
      flipReturning: flip.users.returning,
    }),
    solver: {
      starts: evCounts.get('solver_start') ?? 0,
      completes: evCounts.get('solver_complete') ?? 0,
      fails: evCounts.get('solver_failed') ?? 0,
      completePct: (evCounts.get('solver_start') ?? 0)
        ? (evCounts.get('solver_complete') ?? 0) / (evCounts.get('solver_start') ?? 1) : 0,
      // Human-face denominators (#200) — see buildSolverHumanGlance() below.
      ...solverHuman,
      // solver_macro_copy is fired ONLY from the three human-facing copy UIs
      // (SimulatorView, MacroExport, batch TodoList) — none of the machine-
      // loop callers (batch-optimizer / buff-recommender / meld-advisor) ever
      // reach a macro-copy button, so this is already 100% human with no
      // isMachineSolveRow() filtering needed (#187/#189).
      macroCopies: evCounts.get('solver_macro_copy') ?? 0,
    },
    batch: {
      starts: evCounts.get('batch_optimization_start') ?? 0,
      completes: evCounts.get('batch_optimization_complete') ?? 0,
      fails: evCounts.get('batch_optimization_failed') ?? 0,
      cancelled: evCounts.get('batch_optimization_cancelled') ?? 0,
      completePct: (evCounts.get('batch_optimization_start') ?? 0)
        ? (evCounts.get('batch_optimization_complete') ?? 0) / (evCounts.get('batch_optimization_start') ?? 1) : 0,
    },
    bom: {
      calculates: evCounts.get('bom_calculate') ?? 0,
      sentToBatch: evCounts.get('bom_send_to_batch') ?? 0,
      handoffPct: (evCounts.get('bom_calculate') ?? 0)
        ? (evCounts.get('bom_send_to_batch') ?? 0) / (evCounts.get('bom_calculate') ?? 1)
        : 0,
    },
    infra: {
      sabUnavailable: evCounts.get('sab_unavailable') ?? 0,
      wasmLoadFailed: evCounts.get('wasm_load_failed') ?? 0,
    },
    api: {
      universalisCalls,
      universalisRealFails,
      universalisNoListing,
      universalisOtherFails,
    },
    adoption,
  }

  return {
    window: { days, startDate: fmt(start), endDate: fmt(today) },
    glance, pages, solverFunnel, batchFunnel, simulatorFunnel,
    failures, vitals, q4Funnels, marketRegion,
    ...(gearBucketBreakdown ? { gearBucketBreakdown } : {}),
    ...v2,
  }
}

// ===========================================================================
//  v2 dashboard fields — DRAFT (unverified against live GA).
//  Purely additive: every field is OMITTED when its source data is unavailable
//  so the chart degrades to a "資料累積中" placeholder. Never throws.
//  Every runReport here uses { soft: true } and guards `.rows ?? []`.
//  Reuses the exact custom-dimension names proven in the analyze() markdown
//  path (lines ~255–382): customEvent:step / source / type / kind / item_id /
//  api / endpoint / status / rlv / craft_kind / is_expert / is_collectable,
//  and customUser:market_region.
// ===========================================================================

const MISUSE_META = {
  single_recipe_in_batch: {
    label: '批量頁只放單一配方',
    gloss: 'Used the batch optimizer for a single recipe — the simulator fits better.',
  },
  large_queue_in_simulator: {
    label: '模擬器塞入大量佇列',
    gloss: 'Queued many recipes in the single-recipe simulator — batch crafting is the intended tool.',
  },
  bom_without_quantity: {
    label: 'BOM 未填數量',
    gloss: 'Opened the bill of materials without a target quantity, so totals stayed empty.',
  },
}

// market_region raw value → cht | intl | unset.
// Confirmed against live GA + buildMarketRegion(): the app emits the literal
// values 'cht' / 'intl' / 'unset', and GA reports '(not set)' when the user
// property was never set. Everything that isn't 'cht'/'intl' collapses to unset.
function regionBucket(value) {
  const v = value === null || value === undefined ? '' : String(value).trim()
  if (v === 'cht') return 'cht'
  if (v === 'intl') return 'intl'
  return 'unset'
}

// RLV grouping moved from pipeline to frontend (#209 / spec #194 §C3): the
// wide expansion-aligned buckets a prior version of this file computed here
// (≤300 / 301–510 / 511–600 / 601–680 / 681+) are retired — that function
// used to live at this spot but nothing calls it anymore. The pipeline now
// passes through the RAW per-rlv event count (real rlv spans 1–770, 103
// distinct keys observed live on the 7d window / 141 on 28d — cardinality is
// not a problem, though `runReport()`'s rowCount check is what actually
// guards against it growing past `limit` unnoticed), and the
// dashboard picks a dynamic top-8-by-volume "leaderboard" client-side
// (`src/components/ga-dashboard/rlv-aggregate.ts`) instead of a fixed
// classification. `RlvBucket`/`rlvHistogram` stay defined in
// `src/types/ga-snapshot.ts` (marked `@deprecated`) purely so the 71+ frozen
// `gh-data/history/` snapshots that still carry the old bucketed shape keep
// parsing — no new snapshot populates that field.
//
// n <= 0 (incl. empty-string rlv → Number('') === 0) is treated as unset and
// dropped — same "not-set doesn't get counted as a real value" convention
// the retired bucket function used, now applied per-row instead of per-bucket.
// `humanOnly` additionally drops machine-originated rows via
// `isMachineSolveRow()` BEFORE counting — used by the solver_start leg of
// chart #3 (toolUsageByRlv).
//
// `rows` is the SIMPLIFIED per-row shape (`{ rlv, count, craftKind?, source?
// }`), not the raw GA API response — same convention as
// `buildSolverHumanGlance()`/`buildAdoptionGlance()` above: call sites
// extract `dimensionValues`/`metricValues` themselves so this pure function
// (and its node:test fixtures) never touch the GA4 response shape directly
// (spec #194's "接縫二" — pure transforms tested on plain objects, not
// query-assembly detail).
export function buildRlvRawCounts(rows = [], { humanOnly = false } = {}) {
  const counts = new Map()
  for (const r of rows) {
    const n = Number(r.rlv)
    if (!Number.isFinite(n) || n <= 0) continue
    if (humanOnly && isMachineSolveRow({ craftKind: r.craftKind, source: r.source })) continue
    counts.set(n, (counts.get(n) ?? 0) + (r.count ?? 0))
  }
  return counts
}

// `Map<rlv, count>` → sorted `[{ rlv, events }]` passthrough (item 15 of
// spec #194's pipeline test list: "raw RLV 直方圖 passthrough：不做分桶、key
// 數量符合預期"). Sorted ascending by rlv purely for stable/diffable output —
// the frontend's top-8 aggregation re-sorts by volume itself.
export function rlvRawCountsToRows(counts) {
  return [...counts.entries()]
    .map(([rlv, events]) => ({ rlv, events }))
    .sort((a, b) => a.rlv - b.rlv)
}

// --- Q2 failures: cost-mode dimension (#211) -------------------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs` (same
// node:test harness as buildRlvRawCounts() above).
//
// `rows` is the raw GA4 API row shape (dimensionValues[0..2] = eventName,
// reason, calc_mode) — kept as the one exception to this file's usual
// "simplified row shape into pure functions" convention because the
// (event, reason) aggregation key itself is derived from dimensionValues[0]
// (see the existing inline classification this replaces), not worth a second
// mapping pass just to rename three positional fields.
//
// `count` on the returned row is the FULL aggregate — sums every calc_mode
// value including the `(not set)` sentinel — unchanged from the pre-#211
// shape (batch.failRate and every other consumer of `failures[].count` reads
// the same total it always has). `costModeBreakdown` is a strict addition:
// only populated for `event === 'batch'` rows (calc_mode only exists on
// `batch_optimization_failed`; solver/wasm rows always see the `(not set)`
// sentinel here and would misleadingly look like a real "zero-mode" reading
// if not excluded), and only from calc_mode values in `KNOWN_COST_MODES` —
// `(not set)` rows contribute to `count` but never to the breakdown array,
// so a reason with zero attributable rows gets `costModeBreakdown: undefined`
// (key absent from the map), never an empty array standing in for zeros.
const KNOWN_COST_MODES = new Set(['macro', 'quick-buy'])

export function buildFailureRows(rows = []) {
  const totals = new Map() // key `${event}|${reason}` -> { event, reason, count }
  const costModes = new Map() // same key -> Map<costMode, count>

  for (const r of rows) {
    const rawEvent = r.dimensionValues[0].value
    const event = rawEvent.startsWith('solver') ? 'solver'
      : rawEvent.startsWith('batch') ? 'batch'
      : 'wasm'
    const reason = r.dimensionValues[1].value || '(no reason)'
    const calcMode = r.dimensionValues[2]?.value
    const count = Number(r.metricValues[0].value)
    const key = `${event}|${reason}`

    const existing = totals.get(key)
    totals.set(key, { event, reason, count: (existing?.count ?? 0) + count })

    if (event === 'batch' && KNOWN_COST_MODES.has(calcMode)) {
      const modes = costModes.get(key) ?? new Map()
      modes.set(calcMode, (modes.get(calcMode) ?? 0) + count)
      costModes.set(key, modes)
    }
  }

  return [...totals.entries()].map(([key, row]) => {
    const modes = costModes.get(key)
    if (!modes) return row
    return {
      ...row,
      costModeBreakdown: [...modes.entries()].map(([costMode, count]) => ({ costMode, count })),
    }
  })
}

// --- Human/machine solve discriminator (#198) -----------------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs`
// (node:test — see that file's header for why it isn't wired into `npm test`).
//
// Cross-cutover rule — MUST stay valid on both sides of the #198 fix date:
//   - Before the fix: `solveCraftForRecipe` (the machine-loop façade consumed
//     by batch-optimizer / buff-recommender / meld-advisor) never set
//     `config.taxonomy`, so `craft_kind` was absent on every machine-
//     originated solver_start/_complete/_failed row. GA4 renders "absent" as
//     EITHER the `(not set)` sentinel OR an empty string `''` — a 28-day
//     probe found both (7796 `(not set)` + 1493 `''` on solver_start alone).
//     Matching only one leaks ~1493 machine rows into the human side.
//   - After the fix: every solver event carries taxonomy (craft_kind is
//     always populated) AND an explicit `source` tag: `'user'` for the one
//     human-initiated path (SolverPanel calling `solveCraft` directly),
//     `'machine'` for every façade caller.
// A row is machine-originated iff EITHER leg fires (OR, not date-branched) —
// that keeps the classification continuous across the fix date instead of a
// step-function flip. Delete the craft_kind-absence leg once the 71-day
// retention window has fully rotated past the fix date (client-side mirror
// of this note lives in `src/solver/raphael.ts`'s `SolverConfig.source` doc).
const CRAFT_KIND_ABSENT_VALUES = new Set(['(not set)', ''])
const MACHINE_SOURCE_VALUES = new Set(['machine'])

export function isMachineSolveRow({ craftKind, source } = {}) {
  if (CRAFT_KIND_ABSENT_VALUES.has(craftKind ?? '(not set)')) return true
  return MACHINE_SOURCE_VALUES.has(source)
}

// --- glance.solver human-face denominators (#200) --------------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs` (same
// node:test harness as isMachineSolveRow() above, which this reuses per row).
//
// This is the "套進全部分母" half of #200: isMachineSolveRow() used to gate
// exactly one consumer (toolUsageByRlv.simulatorCount). Here it's applied to
// solver's OWN glance denominators — the ones #181/#183/#187 flagged as
// polluted (`solver.completePct` was >100% on 63/71 historical days because
// the machine loop inflates `solver_start` far more than `solver_complete`).
//
// `rows` is the combined (eventName, craft_kind, source, count) breakdown for
// solver_start/_complete/_failed from ONE runReport (see buildBundle) — kept
// as a single query per #189's pipeline cost table ("+1", not "+3").
//
// Deliberately NOT clamped to [0, 1]: #187 決定 3 makes `completePct` ≤ 100%
// on the human-only denominator the acceptance bar for #200 itself. If the
// real pipeline run still comes out >100% after this filter, that's a new
// fact demanding its own diagnostic ticket (#187 決定 3), not something to
// paper over here with Math.min().
//
// `humanFails` gets special treatment `humanStarts`/`humanCompletes` don't
// need: `solver_failed` (unlike `_start`/`_complete`) has NEVER carried
// taxonomy in production (#189 決定 3 — `worker.ts:320` only started
// forwarding `config.taxonomy` in #198, not yet deployed as of this ticket).
// Every `solver_failed` row today therefore has an absent `craft_kind`, which
// `isMachineSolveRow()` correctly (and unavoidably) classifies as machine —
// so summing "non-machine solver_failed rows" always lands on exactly 0. That
// 0 is NOT "we measured zero human failures"; it's "we cannot currently tell
// human failures from machine ones at all", and reporting it as a plain
// number would let downstream code (ga-thresholds.ts's Wilson-CI gate) read
// it as a confident, large-n 0% failure rate — a false all-clear (see #200
// review: this is the exact regression the review caught, live 28d GA4 probe
// obs=0/n=14572 rendered `state: 'clear'` before this fix).
//
// The fix distinguishes the two cases directly from the row data: if ANY
// solver_failed row (human or machine) carries a real `craft_kind`, the
// discriminator is demonstrably working for this event today, so a resulting
// 0 is a genuine "no human failures found" and `humanFails` stays a number.
// If solver_failed rows exist but NONE carry real taxonomy, attribution is
// structurally impossible right now, so `humanFails` reports `undefined`
// instead of 0 — `glance.solver.humanFails` is optional (v2-additive, same
// contract as an absent pre-#200 snapshot), and `ga-thresholds.ts`'s
// `pick()` already treats `undefined` as "metric absent" (`state: 'absent'`),
// not silently-false-clear. If there are no solver_failed rows at all
// (nobody failed, human or machine), that's a real, uncontested zero — this
// does NOT fall into the "can't attribute" bucket. Once #198 deploys, every
// NEW solver_failed row carries real taxonomy immediately (no separate dark
// period the way macro-copy has), so this self-heals the moment the first
// post-deploy failure event lands — no manual flag flip required for this
// specific signal (though `ga-thresholds.ts` still keeps `trusted: false` as
// a second, manually-lifted gate — see that file's note).
export function buildSolverHumanGlance(rows = []) {
  let humanStarts = 0
  let humanCompletes = 0
  let humanFails = 0
  let failedTotal = 0
  let failedWithTaxonomy = 0
  for (const row of rows) {
    const count = row.count ?? 0
    if (row.eventName === 'solver_failed') {
      failedTotal += count
      if (!CRAFT_KIND_ABSENT_VALUES.has(row.craftKind ?? '(not set)')) failedWithTaxonomy += count
    }
    if (isMachineSolveRow({ craftKind: row.craftKind, source: row.source })) continue
    if (row.eventName === 'solver_start') humanStarts += count
    else if (row.eventName === 'solver_complete') humanCompletes += count
    else if (row.eventName === 'solver_failed') humanFails += count
  }
  const canAttributeFails = failedTotal === 0 || failedWithTaxonomy > 0
  return {
    humanStarts,
    humanCompletes,
    humanFails: canAttributeFails ? humanFails : undefined,
    humanCompletePct: humanStarts ? humanCompletes / humanStarts : 0,
  }
}

// --- 裝備水準 × 求解結果 (#211, spec #194 §C3) ------------------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs` (same
// node:test harness as buildSolverHumanGlance() above — same input row shape,
// `{ eventName, craftKind, source, gearBucket, count }`, from the SAME query).
//
// Human-filtered via isMachineSolveRow() (#200), same as CraftKindRow/
// TaxonomyCell — a row that fails the human check contributes to NEITHER a
// gear bucket NOR the failedTotal/failedWithTaxonomy tally below (mirrors
// buildSolverHumanGlance()'s own ordering: the taxonomy-presence check for
// `solver_failed` runs on ALL rows, human or machine, but the actual bucket
// accumulation is human-only).
//
// `KNOWN_GEAR_BUCKETS` fixes the three output rows unconditionally (like the
// 2×2 grid in ExpertCollectableMatrix.vue) rather than only emitting buckets
// that saw traffic — a bucket with zero starts this window is still a real
// "we saw nothing here", not an absent row to prune.
//
// `fails`/`failRate` share the exact `canAttributeFails` guard
// buildSolverHumanGlance() uses for `humanFails` (duplicated here rather than
// calling that function a second time — the accumulation loop below needs
// the per-bucket breakdown buildSolverHumanGlance() doesn't return, so
// re-deriving `canAttributeFails` locally from the same rows is simpler than
// threading it through as a second return value). `solver_failed` has never
// carried taxonomy in production (#189 決定 3) — every row's craft_kind reads
// GA4's `(not set)`/`''` sentinel today, so `fails` reports `undefined` (not
// a confident 0) until #198 deploys and the first post-deploy failure event
// carries real taxonomy (self-heals immediately, no 28-day wait — same as
// `humanFails`).
const KNOWN_GEAR_BUCKETS = ['entry', 'mid', 'bis']

export function buildGearBucketBreakdown(rows = []) {
  const buckets = new Map(KNOWN_GEAR_BUCKETS.map((b) => [b, { starts: 0, completes: 0, fails: 0 }]))
  let failedTotal = 0
  let failedWithTaxonomy = 0

  for (const row of rows) {
    const count = row.count ?? 0
    if (row.eventName === 'solver_failed') {
      failedTotal += count
      if (!CRAFT_KIND_ABSENT_VALUES.has(row.craftKind ?? '(not set)')) failedWithTaxonomy += count
    }
    if (isMachineSolveRow({ craftKind: row.craftKind, source: row.source })) continue
    const bucket = buckets.get(row.gearBucket)
    if (!bucket) continue // gear_bucket absent/unrecognized (pre-dimension history) — drop, don't mis-bucket
    if (row.eventName === 'solver_start') bucket.starts += count
    else if (row.eventName === 'solver_complete') bucket.completes += count
    else if (row.eventName === 'solver_failed') bucket.fails += count
  }

  const canAttributeFails = failedTotal === 0 || failedWithTaxonomy > 0
  return KNOWN_GEAR_BUCKETS.map((bucket) => {
    const cell = buckets.get(bucket)
    return {
      bucket,
      starts: cell.starts,
      completes: cell.completes,
      fails: canAttributeFails ? cell.fails : undefined,
      completeRate: cell.starts > 0 ? cell.completes / cell.starts : 0, // NOT clamped — #209 review 3 convention
      failRate: canAttributeFails ? (cell.starts > 0 ? cell.fails / cell.starts : 0) : undefined,
    }
  })
}

// --- macro-copy attribution guard (#209 review 2) ---------------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs` —
// same shape of fix `canAttributeFails` above applies to `humanFails`.
//
// `solver_macro_copy` (unlike solver_start/_complete) has NEVER carried
// taxonomy in production — a live probe found every row's is_expert/
// is_collectable/craft_kind/source all sitting at the GA4 "(not set)"
// sentinel. `isMachineSolveRow()` therefore (correctly, and unavoidably)
// classifies EVERY solver_macro_copy row as machine-originated and filters
// it out before it can be bucketed into a TaxonomyCell/CraftKindRow. The
// resulting `macroCopies: 0` is NOT "we measured zero macro copies" — it's
// the exact same "attribution is structurally impossible" shape #200 review
// caught for `humanFails` (a real 28d probe found obs=0/n=14572 rendering a
// confident false all-clear before that fix). `glance.solver.macroCopies`
// itself is UNAFFECTED (#200 already established it's 100% human by
// construction, no isMachineSolveRow() filter applies there) — this guard is
// only for the per-cell/per-kind breakdowns that DO filter by taxonomy.
//
// `rows` is the SIMPLIFIED `{ craftKind, count }` shape (same convention as
// buildSolverHumanGlance() above), extracted from the SAME taxMacroRows the
// matrix/craftKindBreakdown accumulation already fetches — no new GA4 query.
export function canAttributeMacroCopies(rows = []) {
  let total = 0
  let withTaxonomy = 0
  for (const row of rows) {
    const count = row.count ?? 0
    total += count
    if (!CRAFT_KIND_ABSENT_VALUES.has(row.craftKind ?? '(not set)')) withTaxonomy += count
  }
  return total === 0 || withTaxonomy > 0
}

function gaBool(value) {
  return value === 'true' || value === '1'
}

// --- glance.adoption: cross-server + meld-advisor adoption denominators (#203) --
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs` (same
// node:test harness as buildSolverHumanGlance() above).
//
// `crossServerRows` is the (cross_server, count) breakdown of
// `batch_optimization_start` (one runReport, dimensioned on `customEvent:
// cross_server`) — `batchStarts` sums EVERY row (true / false / the
// `(not set)` sentinel for events emitted before the dimension was
// registered), `crossServerBatches` sums only the `true` rows. Both come out
// of the SAME query so the denominator can never desync from its numerator's
// source event (mirrors the universalis_fetch ok/status query above).
//
// `meldFieldsRows` is the (fields, count) breakdown of `gearset_apply_all` —
// `meldApplies` sums only rows whose `fields` is exactly `meld_delta` or
// `meld_delta_single` (the meld-advisor's two writer branches, #189 決定 2).
// Any other `fields` value (e.g. the generic field-edit writer's
// comma-joined `level,craftsmanship,control,cp`) is silently excluded — it's
// a real apply, just not a meld-advisor one.
//
// `meldAdvisorRuns` is NOT derived from either row set — it's `evCounts.get(
// 'meld_advisor_run')` from the plain event-count query (buildBundle), passed
// straight through here so this function has a single return-shape contract
// for all four `glance.adoption` fields.
export function buildAdoptionGlance({ crossServerRows = [], meldFieldsRows = [], meldAdvisorRuns = 0 } = {}) {
  let batchStarts = 0
  let crossServerBatches = 0
  for (const row of crossServerRows) {
    const count = row.count ?? 0
    batchStarts += count
    if (gaBool(row.crossServer)) crossServerBatches += count
  }

  let meldApplies = 0
  for (const row of meldFieldsRows) {
    if (row.fields === 'meld_delta' || row.fields === 'meld_delta_single') {
      meldApplies += row.count ?? 0
    }
  }

  return { batchStarts, crossServerBatches, meldAdvisorRuns, meldApplies }
}

// --- universalis 真故障 vs 「查無掛單」判別 (#201) -------------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs` (same
// node:test harness as isMachineSolveRow() above — see that file's header).
//
// A `universalis_fetch` row's `ok`/`status` params (src/api/universalis.ts)
// classify into exactly one bucket:
//   - ok === true                → 'success'
//   - ok === false, status === 0 → 'real-fail'  (network/timeout/parse error
//                                    — attemptFetch() never resolves a status)
//   - ok === false, status === 404 → 'no-listing' (a legitimate empty-market
//                                    response, NOT a fault — #189 決定 3)
//   - anything else               → 'other-fail' (e.g. an unregistered/unknown status,
//                                    or the `(not set)` sentinel arriving here already
//                                    typed as a non-0/404 number via classifyUniversalisFetchRow()
//                                    below — must NEVER silently join 'real-fail' or
//                                    'no-listing', see #189 resolution comment / #201 review B1)
// Only 'real-fail' feeds the universalis 真故障率 numerator. 'no-listing' is
// tallied separately as a standing footnote and must NEVER be folded into
// the numerator — that was the exact bug this rule replaces (404s inflated
// the reported failure rate from 1.98% to 5.91%).
export function classifyUniversalisFetch({ ok, status } = {}) {
  // Strict `=== true`, not truthy — a raw GA4 row's `ok` param can arrive as
  // the string 'false' (truthy in JS) if a caller forgets to run it through
  // gaBool() first; the strict check makes that a loud 'other-fail' instead
  // of a silent, permanently-invisible "always success" misclassification.
  if (ok === true) return 'success'
  if (status === 0) return 'real-fail'
  if (status === 404) return 'no-listing'
  return 'other-fail'
}

// Raw-string → typed-input adapter for `classifyUniversalisFetch()`, extracted as its own
// pure function so the GA4 string→{boolean,number} conversion is unit-tested independently
// of a live GA4 call (#201 review N1/N2 — testing classifyUniversalisFetch() only with
// already-typed { ok: boolean, status: number } gave false confidence; it never exercised
// this conversion, which is where the actual bugs live).
//
// `status` MUST NOT fall back to `0` on a non-numeric value (e.g. the `(not set)` sentinel,
// or any dimension value GA4 hasn't resolved yet) — that would alias it to 'real-fail', the
// exact class of false-positive this rule exists to eliminate (#201 review B1).
export function classifyUniversalisFetchRow({ ok, status } = {}) {
  const rawStatus = Number(status)
  return classifyUniversalisFetch({
    ok: gaBool(ok),
    status: Number.isFinite(rawStatus) ? rawStatus : -1,
  })
}

// --- glance.activeUsers denominator fix (#202) -----------------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs` (same
// node:test harness as isMachineSolveRow() / classifyUniversalisFetch() above).
//
// `total` used to be flip.users.new + flip.users.returning + flip.users.other
// — a sum across newVsReturning's three buckets. That inflates the count
// because newVsReturning is a SESSION-scoped dimension: a user with sessions
// in more than one bucket during the window (e.g. their very first session
// this window landed them in 'new', a later one in 'returning') gets counted
// once per bucket. `dimensionlessTotal` comes from a plain totalUsers report
// with NO dimensions, so GA4 dedupes it once, globally — the correct
// definition of "how many distinct people showed up".
//
// `flipNew` / `flipReturning` are NOT touched — they're single-row, already-
// clean per-bucket user counts (the numerator was never the problem, only
// the total/returningPct denominator was). This is also the shared
// definition used by the 71/77-day history backfill
// (scripts/dev/ga-backfill-active-users.mjs) — passing the same
// dimensionlessTotal-goes-in / flipNew+flipReturning-stay-put shape keeps
// the live pipeline and the backfilled history on one definition, so the
// series doesn't show a step where the definition silently changes.
export function buildActiveUsersGlance({ dimensionlessTotal, flipNew, flipReturning }) {
  return {
    total: dimensionlessTotal,
    new: flipNew,
    returning: flipReturning,
    returningPct: dimensionlessTotal ? flipReturning / dimensionlessTotal : 0,
  }
}

// --- market_region ledger bucket classification (#202) ---------------------
// Pure function, unit-tested via `scripts/__tests__/ga-analyze.test.mjs`.
//
// buildMarketRegion() (the legacy `marketRegion` bundle field, kept per #196
// even though its dedicated chart was cut) used to only recognize the literal
// '(not set)' sentinel as "never learned this user's region". GA4 sometimes
// returns an empty string '' instead of the sentinel for the same underlying
// gap — the exact shape of hole #198 found on craft_kind (7796 '(not set)' +
// 1493 '' — matching only one leaked rows into the wrong bucket). Folding ''
// into the same 'notset' bucket here closes that gap for market_region too.
// 'unset' is a DIFFERENT, deliberate bucket: the app's own literal string for
// "visited but hasn't completed the server-selection onboarding yet" (see
// regionBucket() below) — it must stay separate from 'notset' (GA never
// learned anything at all), not get merged into it.
export function marketRegionBucket(region) {
  if (region === '(not set)' || region === '') return 'notset'
  if (region === 'unset') return 'unset'
  if (region === 'cht') return 'cht'
  if (region === 'intl') return 'intl'
  return null
}

// Make an api_failure endpoint readable: strip the request origin (older events
// logged the full URL incl. URL-encoded world names), decode percent-escapes so
// the result is human-readable, then truncate on a whole-character boundary (the
// old .slice(0, 50) cut mid-%XX and produced garbled strings).
function cleanApiEndpoint(raw) {
  let s = String(raw || '')
  s = s.replace(/^https?:\/\/universalis\.app\/api\/v2\//, '')
    .replace(/^https?:\/\/[^/]+\//, '')
  try { s = decodeURIComponent(s) } catch { /* keep raw if escapes are malformed */ }
  return s.length > 60 ? s.slice(0, 59) + '…' : s
}

async function buildV2Fields(client, property, dateRanges, _ctx) {
  // _ctx = { evCounts, flip } — reserved for future cross-field reuse;
  // every v2 field below queries GA directly so the existing buildBundle
  // aggregates are never mutated.
  const out = {}

  // --- Chart #5: misuseSignals -------------------------------------------
  // page_misuse_hint × customEvent:type (eventCount + totalUsers→affectedUsers).
  // NOT top-N (#209 review 2): downstream maps every row it gets with no
  // slice — `out.misuseSignals` is meant to be the complete breakdown.
  // `type` is an enum emitted by useFunnelMisuseDetector.ts (currently 3
  // fixed values via MISUSE_META, unknown types fall back to a raw label),
  // so `limit: 30` has real headroom; `orderBys` is just display order.
  const misuseRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:type' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'page_misuse_hint' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  }, { soft: true })
  const misuseRows = misuseRes?.rows ?? []
  if (misuseRows.length) {
    out.misuseSignals = misuseRows.map((r) => {
      const type = r.dimensionValues[0].value
      const meta = MISUSE_META[type] ?? { label: type, gloss: '' }
      return {
        type,
        label: meta.label,
        gloss: meta.gloss,
        eventCount: Number(r.metricValues[0].value),
        affectedUsers: Number(r.metricValues[1].value),
      }
    })
  }

  // --- Chart #7: apiFailures ---------------------------------------------
  // matrix: api_failure × (api, status). topEndpoints: × (api, endpoint, status).
  // NOT top-N (#209 review 2): `matrix` re-aggregates EVERY row it gets into
  // `matrixMap` below (no slice) — it's meant to be the full api×status
  // breakdown, not a leaderboard. `api`/`status` are both small closed sets
  // (a couple of API names, a handful of HTTP status codes), so `limit: 50`
  // has real headroom; `orderBys` only affects iteration order into the Map,
  // not what gets counted. Contrast with `apiEndpointRes` right below, which
  // IS top-N.
  const apiMatrixRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:api' }, { name: 'customEvent:status' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'api_failure' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  }, { soft: true })
  // Top-N (#209 review 2): downstream `topEndpoints` below takes only the
  // top 10 rows (`.sort().slice(0, 10)`) — this query's rowCount already
  // exceeds `limit: 50` on every real window (192/401/572 across 7d/14d/28d
  // in a live probe), which is expected and benign here, unlike the
  // exhaustive RLV/matrix queries where a missing row corrupts a sum.
  const apiEndpointRes = await runReport(client, {
    property, dateRanges,
    dimensions: [
      { name: 'customEvent:api' },
      { name: 'customEvent:endpoint' },
      { name: 'customEvent:status' },
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'api_failure' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  }, { soft: true, topN: true })
  const apiMatrixRows = apiMatrixRes?.rows ?? []
  const apiEndpointRows = apiEndpointRes?.rows ?? []
  if (apiMatrixRows.length || apiEndpointRows.length) {
    const matrixMap = new Map()
    for (const r of apiMatrixRows) {
      const api = r.dimensionValues[0].value
      const status = Number(r.dimensionValues[1].value) || 0
      const key = `${api}|${status}`
      const count = Number(r.metricValues[0].value)
      matrixMap.set(key, (matrixMap.get(key) ?? 0) + count)
    }
    const matrix = [...matrixMap.entries()].map(([key, count]) => {
      const [api, status] = key.split('|')
      return { api, status: Number(status) || 0, count }
    })
    const topEndpoints = apiEndpointRows
      .map((r) => ({
        api: r.dimensionValues[0].value,
        endpoint: cleanApiEndpoint(r.dimensionValues[1].value),
        status: Number(r.dimensionValues[2].value) || 0,
        count: Number(r.metricValues[0].value),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
    out.apiFailures = { matrix, topEndpoints }
  }

  // --- Chart #4: taxonomy -------------------------------------------------
  // Dimension coverage confirmed against live GA:
  //   - rlv lives on recipe_select (NOT solver_start), so rlvRaw queries
  //     recipe_select — it reads as "recipe difficulty being opened".
  //   - is_expert / is_collectable ARE on solver_start (matrix starts split
  //     correctly) but are largely (not set) on solver_complete, so per-cell
  //     completeRate for the expert/collectable cells is unreliable. TODO:
  //     emit is_expert/is_collectable on solver_complete too.
  //   - craft_kind + source ride along on the matrix and craftKindBreakdown
  //     queries below SOLELY so isMachineSolveRow() (#198) can filter each row
  //     before aggregating (#200) — pre-fix, every machine-loop row has NO
  //     is_expert/is_collectable either, so they all piled into the
  //     (false,false) cell; post-fix (once #198 deploys) the façade DOES set
  //     real taxonomy on machine rows, so without this filter they'd instead
  //     spread across whichever cell matches the recipe's real is_expert/
  //     is_collectable — silently diluting every cell with machine noise
  //     either way. Filtering makes both charts human-only, matching
  //     glance.solver.human* below.
  // rlvRaw: recipe_select × customEvent:rlv, raw (no bucketing, #209).
  const rlvHistRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'recipe_select' } } },
    // Raw passthrough (#209) means every distinct rlv value is its own row —
    // a live probe found 103 keys on 7d and 141 on 28d (both already over the
    // old bucket-era limit:100, which would have silently truncated real
    // data). This number is NOT a safe ceiling either — it grows with the
    // window and with every new expansion's recipe levels, so `limit` alone
    // can't be trusted to stay ahead of it. `runReport()` now warns whenever
    // `response.rowCount` exceeds `limit` (GA4 always reports the true
    // matching row count, independent of how many rows it actually
    // returned), so a future truncation is loud instead of silently thinning
    // a chart. Matches selectRlvRes/bomRlvRes below.
    limit: 200,
  }, { soft: true })
  // matrix: solver_start/solver_complete grouped by (is_expert, is_collectable),
  // macroCopies from solver_macro_copy grouped the same way. craft_kind/source
  // are carried but NOT part of the cell key — see isMachineSolveRow() filter
  // in the accumulate() closure below. Limit raised past the plain 4-cell
  // count (2×2) now that craft_kind (~7 values incl. absent forms) × source
  // (~3) multiply the row count — bounded, not a combinatorial blowup.
  const matrixDims = [
    { name: 'customEvent:is_expert' },
    { name: 'customEvent:is_collectable' },
    { name: 'customEvent:craft_kind' },
    { name: 'customEvent:source' },
  ]
  const taxStartsRes = await runReport(client, {
    property, dateRanges,
    dimensions: matrixDims,
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_start' } } },
    limit: 200,
  }, { soft: true })
  const taxCompletesRes = await runReport(client, {
    property, dateRanges,
    dimensions: matrixDims,
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_complete' } } },
    limit: 200,
  }, { soft: true })
  const taxMacroRes = await runReport(client, {
    property, dateRanges,
    dimensions: matrixDims,
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_macro_copy' } } },
    limit: 200,
  }, { soft: true })
  // craftKindBreakdown: solver_start / solver_complete × customEvent:craft_kind,
  // human-filtered via isMachineSolveRow() (#200) — `source` rides along
  // purely for that filter, same reasoning as matrixDims above. Without it,
  // once #198 deploys, machine-loop rows would carry real craft_kind values
  // (quick/normal/expert) and silently inflate those buckets instead of
  // collecting harmlessly under the '(not set)'/'' buckets like they do today.
  const kindStartsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:craft_kind' }, { name: 'customEvent:source' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_start' } } },
    limit: 100,
  }, { soft: true })
  const kindCompletesRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:craft_kind' }, { name: 'customEvent:source' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_complete' } } },
    limit: 100,
  }, { soft: true })
  const rlvHistRows = rlvHistRes?.rows ?? []
  const taxStartsRows = taxStartsRes?.rows ?? []
  const taxCompletesRows = taxCompletesRes?.rows ?? []
  const taxMacroRows = taxMacroRes?.rows ?? []
  const kindStartsRows = kindStartsRes?.rows ?? []
  const kindCompletesRows = kindCompletesRes?.rows ?? []
  const hasTaxonomy = rlvHistRows.length || taxStartsRows.length
    || taxCompletesRows.length || kindStartsRows.length
  if (hasTaxonomy) {
    // rlvRaw (#209 — raw RLV passthrough, no pipeline-side bucketing; the
    // dashboard's dynamic top-8 leaderboard replaces the old wide buckets).
    const rlvRaw = rlvRawCountsToRows(buildRlvRawCounts(
      rlvHistRows.map((r) => ({ rlv: r.dimensionValues[0].value, count: Number(r.metricValues[0].value) })),
    ))

    // macroAttributable (#209 review 2): `solver_macro_copy` has never
    // carried taxonomy in production, so every row in `taxMacroRows` gets
    // filtered out as machine-originated below — see
    // `canAttributeMacroCopies()`'s doc comment above for the full "same
    // shape as #200's humanFails" reasoning. Computed once and reused by
    // BOTH the matrix cells and craftKindBreakdown so a real "there were
    // macro-copy events but we can't attribute any of them" state renders as
    // `undefined` in both places, not a confident 0.0%.
    const macroAttributable = canAttributeMacroCopies(
      taxMacroRows.map((r) => ({ craftKind: r.dimensionValues[2]?.value, count: Number(r.metricValues[0].value) })),
    )

    // matrix — accumulate the 4 (is_expert, is_collectable) cells.
    const cellKey = (e, c) => `${e}|${c}`
    const cells = new Map()
    for (const e of [false, true]) {
      for (const c of [false, true]) {
        cells.set(cellKey(e, c), { isExpert: e, isCollectable: c, starts: 0, completes: 0, macroCopies: 0 })
      }
    }
    // #200: skip machine-originated rows BEFORE bucketing into cells — see the
    // matrixDims comment above. `taxMacroRows` doesn't strictly need this
    // (solver_macro_copy is already 100% human, see glance.solver.macroCopies
    // above), but every row here does carry craft_kind, so it filters through
    // as a no-op rather than needing special-casing.
    const accumulate = (rows, field) => {
      for (const r of rows) {
        const e = gaBool(r.dimensionValues[0].value)
        const c = gaBool(r.dimensionValues[1].value)
        const craftKind = r.dimensionValues[2]?.value
        const source = r.dimensionValues[3]?.value
        if (isMachineSolveRow({ craftKind, source })) continue
        const cell = cells.get(cellKey(e, c))
        if (cell) cell[field] += Number(r.metricValues[0].value)
      }
    }
    accumulate(taxStartsRows, 'starts')
    accumulate(taxCompletesRows, 'completes')
    accumulate(taxMacroRows, 'macroCopies') // no-op today (see macroAttributable above) — self-heals if solver_macro_copy ever starts carrying taxonomy
    const matrix = [...cells.values()].map((cell) => ({
      isExpert: cell.isExpert,
      isCollectable: cell.isCollectable,
      starts: cell.starts,
      completes: cell.completes,
      macroCopies: macroAttributable ? cell.macroCopies : undefined,
      completeRate: cell.starts > 0 ? cell.completes / cell.starts : 0,
      macroCopyRate: macroAttributable ? (cell.completes > 0 ? cell.macroCopies / cell.completes : 0) : undefined,
    }))

    // craftKindBreakdown — same #200 human filter. Filtering out machine rows
    // means the '(not set)'/'' buckets (today's pre-fix machine signature)
    // disappear entirely from the output, leaving only real craft kinds
    // (normal/quick/expert/custom_delivery/company) reported by humans.
    //
    // #209: this bundle now also carries `completes`/`macroCopies`/
    // `macroCopyRate` — RecipeDifficultyKind.vue no longer renders this data
    // (that chart drops the craft_kind column per spec #194 §C3), it moved
    // into ExpertCollectableMatrix.vue as a third row so the matrix stays the
    // dashboard's one macro-copy-rate-bearing structure. `macroCopies` reuses
    // `taxMacroRows` (already fetched for the is_expert × is_collectable
    // matrix above, same matrixDims incl. craft_kind at index 2) — no new
    // GA4 query needed.
    const kindStarts = new Map()
    for (const r of kindStartsRows) {
      const craftKind = r.dimensionValues[0].value
      const source = r.dimensionValues[1]?.value
      if (isMachineSolveRow({ craftKind, source })) continue
      kindStarts.set(craftKind, (kindStarts.get(craftKind) ?? 0) + Number(r.metricValues[0].value))
    }
    const kindCompletes = new Map()
    for (const r of kindCompletesRows) {
      const craftKind = r.dimensionValues[0].value
      const source = r.dimensionValues[1]?.value
      if (isMachineSolveRow({ craftKind, source })) continue
      kindCompletes.set(craftKind, (kindCompletes.get(craftKind) ?? 0) + Number(r.metricValues[0].value))
    }
    const kindMacroCopies = new Map()
    for (const r of taxMacroRows) {
      const craftKind = r.dimensionValues[2]?.value
      const source = r.dimensionValues[3]?.value
      if (isMachineSolveRow({ craftKind, source })) continue
      kindMacroCopies.set(craftKind, (kindMacroCopies.get(craftKind) ?? 0) + Number(r.metricValues[0].value))
    }
    const craftKindBreakdown = [...kindStarts.entries()].map(([kind, starts]) => {
      const completes = kindCompletes.get(kind) ?? 0
      const macroCopies = kindMacroCopies.get(kind) ?? 0
      return {
        kind, starts, completes,
        macroCopies: macroAttributable ? macroCopies : undefined,
        // NOT clamped to [0,1] (#209 review 3 — removed a Math.min(1, …) that
        // was already on main before this ticket): #200's issue body is
        // explicit that a solver completeRate >100% means "GA dropped a
        // start event" and is a signal to open a diagnostic ticket, not
        // something to paper over. `starts`/`completes` come from two
        // separate queries (a session that starts inside the window but
        // completes just after it, or vice versa), so a small overshoot is
        // expected noise — a live probe found `quick` at 101.6%
        // (starts=1310, completes=1331) the day this was fixed; that is the
        // GA-dropped-event phenomenon #200 describes, not a calculation bug.
        completeRate: starts > 0 ? completes / starts : 0,
        macroCopyRate: macroAttributable ? (completes > 0 ? macroCopies / completes : 0) : undefined,
      }
    })

    out.taxonomy = { rlvRaw, matrix, craftKindBreakdown }
  }

  // --- Chart #1: byRegion -------------------------------------------------
  // events by region (eventName × market_region). The activeUsers row used to
  // live here too (per-region totalUsers/newUsers), but #202 removed it: the
  // ledger's other four rows are event-scoped (a solver_start either happened
  // in a cht session or it didn't — safe to bucket and even sum), while
  // market_region is a USER-scoped property. GA dedupes each bucket
  // independently but NOT across buckets, so a user who starts the window
  // unset and later completes onboarding shows up in BOTH 'unset' and
  // 'cht' — the three per-region totals looked plausible (1017+63+685=1765)
  // but didn't reconcile against the (correct) dimension-less total (1311,
  // +35%), and no amount of converting to a percentage rescues it — the
  // denominator itself is the double-counted sum (#180 finding 8). There is
  // no safe per-region split for this metric with the data GA4 exposes
  // today, so the ledger's first row now renders un-split (see
  // RegionSplitLedger.vue).
  const regionEventsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }, { name: 'customUser:market_region' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [
      'solver_start', 'solver_complete',
      'batch_optimization_start', 'batch_optimization_complete',
      'bom_calculate', 'bom_send_to_batch',
      'sab_unavailable', 'wasm_load_failed',
    ] } } },
    limit: 200,
  }, { soft: true })
  const regionEventsRows = regionEventsRes?.rows ?? []
  if (regionEventsRows.length) {
    // Per-region event totals.
    const evAgg = {
      cht: {}, intl: {}, unset: {},
    }
    for (const r of regionEventsRows) {
      const event = r.dimensionValues[0].value
      const bucket = regionBucket(r.dimensionValues[1].value)
      evAgg[bucket][event] = (evAgg[bucket][event] ?? 0) + Number(r.metricValues[0].value)
    }
    const ev = (bucket, name) => evAgg[bucket][name] ?? 0
    const glanceRow = (bucket) => {
      // solver
      const sStarts = ev(bucket, 'solver_start')
      const sCompletes = ev(bucket, 'solver_complete')
      const solver = { value: sStarts, secondary: `${sCompletes} 完成` }
      if (sStarts > 0) solver.sparkPct = sCompletes / sStarts
      // batch
      const bStarts = ev(bucket, 'batch_optimization_start')
      const bCompletes = ev(bucket, 'batch_optimization_complete')
      const batch = { value: bStarts, secondary: `${bCompletes} 完成` }
      if (bStarts > 0) batch.sparkPct = bCompletes / bStarts
      // bom
      const bomCalc = ev(bucket, 'bom_calculate')
      const bomSent = ev(bucket, 'bom_send_to_batch')
      const bom = { value: bomCalc, secondary: `${bomSent} → 批次` }
      if (bomCalc > 0) bom.sparkPct = bomSent / bomCalc
      // infra (sab + wasm warnings)
      const sab = ev(bucket, 'sab_unavailable')
      const wasm = ev(bucket, 'wasm_load_failed')
      const infraValue = sab + wasm
      const infra = { value: infraValue, secondary: `SAB ${sab} · WASM ${wasm}` }
      if (infraValue > 0) infra.tone = infraValue >= 5 ? 'danger' : 'warn'
      return { solver, batch, bom, infra }
    }
    const cht = glanceRow('cht')
    const intl = glanceRow('intl')
    const unset = glanceRow('unset')
    out.byRegion = {
      solver: { cht: cht.solver, intl: intl.solver, unset: unset.solver },
      batch: { cht: cht.batch, intl: intl.batch, unset: unset.batch },
      bom: { cht: cht.bom, intl: intl.bom, unset: unset.bom },
      infra: { cht: cht.infra, intl: intl.infra, unset: unset.infra },
    }
  }

  // --- Chart #3: toolUsageByRlv ------------------------------------------
  // DRAFT — bom/batch RLV attribution is INCOMPLETE pending a recipes.json join.
  // selectCount: recipe_select × rlv. simulatorCount: solver_start × rlv,
  // EXPLICITLY human-filtered (#198/#190) — see isMachineSolveRow() above.
  // Without this filter, the day #198's client taxonomy fix lands, 7725
  // machine-loop solves (batch-optimizer / buff-recommender / meld-advisor,
  // ~52.5% of solver_start) would silently start flowing into this line —
  // today it's clean only because the pre-fix façade never set craft_kind.
  // bomTargetCount: bom_target_add × rlv IF the event carries rlv, else 0.
  // batchTargetCount: 0 (see TODO below).
  const selectRlvRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'recipe_select' } } },
    limit: 200, // raw passthrough (#209) — see rlvHistRes's comment above
  }, { soft: true })
  const simRlvRes = await runReport(client, {
    property, dateRanges,
    // craft_kind + source ride along so isMachineSolveRow() can filter per-row
    // BEFORE bucketing — bucketing first would lose the identity needed to
    // exclude machine rows. Cardinality is rlv × craft_kind × source (bounded,
    // not a combinatorial blowup — solver_start's real craft_kind/source pairs
    // are sparse), but the limit is raised well past the plain-rlv query's 100
    // so the extra dimensions can't silently truncate away either leg.
    dimensions: [
      { name: 'customEvent:rlv' },
      { name: 'customEvent:craft_kind' },
      { name: 'customEvent:source' },
    ],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_start' } } },
    limit: 2000,
  }, { soft: true })
  const bomRlvRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'bom_target_add' } } },
    limit: 200, // raw passthrough (#209) — see rlvHistRes's comment above
  }, { soft: true })
  const selectRlvRows = selectRlvRes?.rows ?? []
  const simRlvRows = simRlvRes?.rows ?? []
  const bomRlvRows = bomRlvRes?.rows ?? []
  if (selectRlvRows.length || simRlvRows.length) {
    // #209: raw per-rlv rows, no pipeline-side bucketing — union the rlv keys
    // seen across all three legs (each event fires independently, so a given
    // rlv may appear in one map but not another) and fill zeros for the rest.
    // The frontend's shared top-8 aggregator (rlv-aggregate.ts) does the
    // grouping, ranked by selectCount, same as taxonomy.rlvRaw above.
    const selectMap = buildRlvRawCounts(
      selectRlvRows.map((r) => ({ rlv: r.dimensionValues[0].value, count: Number(r.metricValues[0].value) })),
    )
    const simMap = buildRlvRawCounts(
      simRlvRows.map((r) => ({
        rlv: r.dimensionValues[0].value,
        craftKind: r.dimensionValues[1]?.value,
        source: r.dimensionValues[2]?.value,
        count: Number(r.metricValues[0].value),
      })),
      { humanOnly: true },
    )
    const bomMap = buildRlvRawCounts(
      bomRlvRows.map((r) => ({ rlv: r.dimensionValues[0].value, count: Number(r.metricValues[0].value) })),
    )
    const allRlvs = new Set([...selectMap.keys(), ...simMap.keys(), ...bomMap.keys()])
    // TODO: batchTargetCount stays 0 — batch_optimization_start carries
    // multi-RLV targets and needs a recipes.json join to attribute (spec
    // #194 item 14), not implemented in this ticket.
    out.toolUsageByRlv = [...allRlvs].sort((a, b) => a - b).map((rlv) => ({
      rlv,
      selectCount: selectMap.get(rlv) ?? 0,
      simulatorCount: simMap.get(rlv) ?? 0,
      batchTargetCount: 0,
      bomTargetCount: bomMap.get(rlv) ?? 0,
    }))
  }

  return out
}

// helpers
async function fetchEventCounts(client, property, dateRanges, eventNames) {
  const res = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: eventNames } } },
    limit: eventNames.length + 5,
  })
  const out = new Map()
  for (const r of res?.rows ?? []) {
    out.set(r.dimensionValues[0].value, Number(r.metricValues[0].value))
  }
  return out
}

async function uniqueUsersForEvent(client, property, dateRanges, eventName) {
  const res = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: eventName } } },
  })
  const row = res?.rows?.[0]
  return row ? Number(row.metricValues[0].value) : 0
}

function mapPageRow(r) {
  const path = r.dimensionValues[0].value
  return {
    path,
    title: r.dimensionValues[1].value,
    family: familyForPath(path),
    views: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
    sessions: Number(r.metricValues[2].value),
    engagement: Number(r.metricValues[4].value),
    bounce: Number(r.metricValues[5].value),
    avgSession: Number(r.metricValues[2].value)
      ? Number(r.metricValues[3].value) / Number(r.metricValues[2].value)
      : 0,
  }
}

function familyForPath(path) {
  if (path === '/') return 'core'
  if (/^\/(batch|gearset|simulator|bom)/.test(path)) return 'craft'
  if (path === '/timer') return 'gather'
  if (path === '/company-craft') return 'company'
  if (path === '/market') return 'market'
  return 'meta'
}

function mapFlip(rows) {
  const init = { new: 0, returning: 0, other: 0 }
  const out = { users: { ...init }, sessions: { ...init } }
  for (const r of rows) {
    const k = r.dimensionValues[0].value
    const bucket = k === 'new' ? 'new' : k === 'returning' ? 'returning' : 'other'
    out.users[bucket] += Number(r.metricValues[0].value)
    out.sessions[bucket] += Number(r.metricValues[1].value)
  }
  return out
}

function buildVitalsRows(rows) {
  const metrics = ['INP', 'TTFB', 'CLS', 'FCP', 'LCP']
  const map = new Map(metrics.map((m) => [m, { metric: m, good: 0, ni: 0, poor: 0 }]))
  for (const r of rows) {
    const metric = r.dimensionValues[0].value.toUpperCase()
    const rating = r.dimensionValues[1].value
    const count = Number(r.metricValues[0].value)
    const target = map.get(metric)
    if (!target) continue
    if (rating === 'good') target.good += count
    else if (rating === 'needs-improvement') target.ni += count
    else if (rating === 'poor') target.poor += count
  }
  return [...map.values()]
}

function buildMarketRegion(rows) {
  const map = new Map()
  for (const r of rows) {
    const event = r.dimensionValues[0].value
    const region = r.dimensionValues[1].value
    if (!map.has(event)) map.set(event, { event, notset: 0, unset: 0, cht: 0, intl: 0 })
    const row = map.get(event)
    const count = Number(r.metricValues[0].value)
    const bucket = marketRegionBucket(region)
    if (bucket) row[bucket] += count
  }
  return [...map.values()]
}

// Only run when invoked as a script — not when imported by tests (#198's
// isMachineSolveRow() unit tests import this module for its pure functions;
// without this guard, importing it would eagerly hit GA4 / die() on missing
// GA_PROPERTY_ID). Mirrors scripts/build-game-data.mjs's existing guard.
const invoked = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (invoked) {
  if (CLI.snapshot) {
    runSnapshot().catch((err) => { console.error(err); process.exit(1) })
  } else {
    main().catch((err) => { console.error(err); process.exit(1) })
  }
}
