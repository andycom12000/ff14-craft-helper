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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
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

async function runReport(client, request, opts = {}) {
  try {
    const [response] = await client.runReport(request)
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

async function buildClient() {
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
  })
  const pages = (pagesRes?.rows ?? []).map((r) => mapPageRow(r))

  // --- Q1: channels -------------------------------------------------------
  const channelsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'engagementRate' }],
    orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    limit: 12,
  })
  const channels = (channelsRes?.rows ?? []).map((r) => ({
    channel: r.dimensionValues[0].value,
    source: r.dimensionValues[1].value,
    sessions: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
    engagement: Number(r.metricValues[2].value),
  }))

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
  const failuresRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }, { name: 'customEvent:reason' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: {
      values: ['solver_failed', 'batch_optimization_failed', 'wasm_load_failed'] } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  }, { soft: true })
  const failures = (failuresRes?.rows ?? []).map((r) => ({
    event: r.dimensionValues[0].value.startsWith('solver') ? 'solver'
         : r.dimensionValues[0].value.startsWith('batch')  ? 'batch'
         : 'wasm',
    reason: r.dimensionValues[1].value || '(no reason)',
    count: Number(r.metricValues[0].value),
  }))

  // --- Q2: vitals ---------------------------------------------------------
  const vitalsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:metric' }, { name: 'customEvent:rating' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'web_vitals' } } },
    limit: 60,
  }, { soft: true })
  const vitals = buildVitalsRows(vitalsRes?.rows ?? [])

  // --- Q3: flip -----------------------------------------------------------
  const flipRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'newVsReturning' }],
    metrics: [{ name: 'totalUsers' }, { name: 'sessions' }],
  })
  const flip = mapFlip(flipRes?.rows ?? [])

  // --- Q3: returning events ----------------------------------------------
  const retEvRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 25,
  })
  const returningEvents = (retEvRes?.rows ?? []).map((r) => ({
    event: r.dimensionValues[0].value,
    family: familyForEvent(r.dimensionValues[0].value),
    count: Number(r.metricValues[0].value),
    users: Number(r.metricValues[1].value),
  }))

  // --- Q3: returning pages -----------------------------------------------
  const retPgRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }, { name: 'engagementRate' }],
    dimensionFilter: { filter: { fieldName: 'newVsReturning', stringFilter: { value: 'returning' } } },
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 15,
  })
  const returningPages = (retPgRes?.rows ?? []).map((r) => ({
    path: r.dimensionValues[0].value,
    returningViews: Number(r.metricValues[0].value),
    returningUsers: Number(r.metricValues[1].value),
    engagement: Number(r.metricValues[2].value),
  }))

  // --- Q4: funnel drop rates (reuse existing helpers) ---------------------
  // Only comparable, single-meaning conversions. Dropped:
  //   - Recipe → Solver: solver_start is inflated by the batch optimiser's
  //     per-recipe internal solves, so it exceeds recipe_select (>100% "drop").
  //   - Solver → Macro: better served by the simulator funnel, which uses a
  //     clean /simulator page_view denominator instead of inflated solver_complete.
  const q4Funnels = [
    { name: 'Batch prep → Optimize', label: 'batch_add_recipe → batch_opt_start',
      from: evCounts.get('batch_add_recipe') ?? 0, to: evCounts.get('batch_optimization_start') ?? 0,
      note: 'healthy halfway', flag: 'ok' },
    // "Consumed" = downstream uses of the calculated BOM. bom_target_add is
    // UPSTREAM (you add a target before calculating), so including it pushed the
    // rate over 100%; use aetheryte_tp_copy instead, matching derivePageFunnel.
    { name: 'BOM → Consumed',        label: 'bom_calculate → (any consume)',
      from: evCounts.get('bom_calculate') ?? 0,
      to: ['bom_item_check', 'bom_copy_list', 'bom_send_to_batch', 'aetheryte_tp_copy']
        .map((n) => evCounts.get(n) ?? 0).reduce((a, b) => a + b, 0),
      note: 'low handoff', flag: 'warn' },
  ]

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

  // --- v2 dashboard fields (additive; OMITs unavailable fields) -----------
  const v2 = await buildV2Fields(client, property, dateRanges, { evCounts, flip })

  // --- glance summary -----------------------------------------------------
  const flipUsers = flip.users.new + flip.users.returning + flip.users.other
  const glance = {
    activeUsers: {
      total: flipUsers,
      new: flip.users.new,
      returning: flip.users.returning,
      returningPct: flipUsers ? flip.users.returning / flipUsers : 0,
    },
    solver: {
      starts: evCounts.get('solver_start') ?? 0,
      completes: evCounts.get('solver_complete') ?? 0,
      fails: evCounts.get('solver_failed') ?? 0,
      completePct: (evCounts.get('solver_start') ?? 0)
        ? (evCounts.get('solver_complete') ?? 0) / (evCounts.get('solver_start') ?? 1) : 0,
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
  }

  return {
    window: { days, startDate: fmt(start), endDate: fmt(today) },
    glance, pages, channels, solverFunnel, batchFunnel, simulatorFunnel,
    failures, vitals, flip, returningEvents, returningPages, q4Funnels, marketRegion,
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

const SOURCE_LABELS = {
  search: '搜尋',
  queue: '佇列',
  batch_target: '批量目標',
  bom_drilldown: 'BOM 下鑽',
  company_craft: '公司製作',
  deep_link: '深層連結',
  unknown: '未知 · 待查',
}

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

// Bucket an RLV value into expansion-aligned ranges. Real rlv spans 1–770
// (ARR≈1–300, StB/ShB≈301–510, EW≈511–600, DT≈601–770), so per-100 buckets
// crammed everything pre-endgame into one "< 600" bar and left 700-800/800+
// near-empty. These cuts follow the data-patch boundaries instead.
// n <= 0 (incl. empty-string rlv → Number('') === 0) is treated as unset and
// dropped, so not-set events don't inflate the lowest bucket.
function rlvWideBucket(rlv) {
  const n = Number(rlv)
  if (!Number.isFinite(n) || n <= 0) return null
  if (n <= 300) return '≤300'
  if (n <= 510) return '301–510'
  if (n <= 600) return '511–600'
  if (n <= 680) return '601–680'
  return '681+'
}

// Chart #3 (toolUsageByRlv) shares the same expansion-aligned buckets.
const rlvToolBucket = rlvWideBucket

function gaBool(value) {
  return value === 'true' || value === '1'
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

  // --- Chart #2: onboardingFunnel ----------------------------------------
  // first_session_milestone × customEvent:step (eventCount + totalUsers).
  // Order canonically; map whatever step values exist, skip missing.
  const onboardingRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:step' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'first_session_milestone' } } },
    limit: 20,
  }, { soft: true })
  const onboardingRows = onboardingRes?.rows ?? []
  if (onboardingRows.length) {
    const byStep = new Map()
    for (const r of onboardingRows) {
      byStep.set(r.dimensionValues[0].value, {
        eventCount: Number(r.metricValues[0].value),
        users: Number(r.metricValues[1].value),
      })
    }
    const STEP_ORDER = ['viewed_recipe', 'ran_solver', 'saw_macro', 'used_batch']
    const funnel = []
    let prevUsers = 0
    let first = true
    for (const step of STEP_ORDER) {
      const hit = byStep.get(step)
      if (!hit) continue
      // first_session_milestone steps are independent localStorage flags, not a
      // strict funnel, so a later step can exceed an earlier one. Clamp to >= 0
      // so the chart never renders a nonsensical negative "drop".
      const dropFromPrev = first ? 0 : (prevUsers > 0 ? Math.max(0, 1 - hit.users / prevUsers) : 0)
      funnel.push({ step, users: hit.users, eventCount: hit.eventCount, dropFromPrev })
      prevUsers = hit.users
      first = false
    }
    if (funnel.length) out.onboardingFunnel = funnel
  }

  // --- Chart #6: recipeEntrySource ---------------------------------------
  // recipe_select × customEvent:source (eventCount + totalUsers).
  const sourceRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:source' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'recipe_select' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  }, { soft: true })
  const sourceRows = sourceRes?.rows ?? []
  if (sourceRows.length) {
    out.recipeEntrySource = sourceRows.map((r) => {
      const source = r.dimensionValues[0].value || 'unknown'
      return {
        source,
        label: SOURCE_LABELS[source] ?? source,
        eventCount: Number(r.metricValues[0].value),
        uniqueUsers: Number(r.metricValues[1].value),
      }
    })
  }

  // --- Chart #5: misuseSignals -------------------------------------------
  // page_misuse_hint × customEvent:type (eventCount + totalUsers→affectedUsers).
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
  const apiMatrixRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:api' }, { name: 'customEvent:status' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'api_failure' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 50,
  }, { soft: true })
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
  }, { soft: true })
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

  // --- Chart #8: localeMissTop -------------------------------------------
  // recipe_name_locale_miss × (kind, item_id), top ~30 by occurrences.
  const localeRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:kind' }, { name: 'customEvent:item_id' }],
    metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'recipe_name_locale_miss' } } },
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 30,
  }, { soft: true })
  const localeRows = localeRes?.rows ?? []
  if (localeRows.length) {
    // TODO: join recipes.json/XIVAPI for itemName
    out.localeMissTop = localeRows.map((r) => ({
      kind: r.dimensionValues[0].value,
      itemId: Number(r.dimensionValues[1].value),
      occurrences: Number(r.metricValues[0].value),
      affectedUsers: Number(r.metricValues[1].value),
    }))
  }

  // --- Chart #4: taxonomy -------------------------------------------------
  // Dimension coverage confirmed against live GA:
  //   - rlv lives on recipe_select (NOT solver_start), so rlvHistogram queries
  //     recipe_select — it reads as "recipe difficulty being opened".
  //   - is_expert / is_collectable ARE on solver_start (matrix starts split
  //     correctly) but are largely (not set) on solver_complete, so per-cell
  //     completeRate for the expert/collectable cells is unreliable. TODO:
  //     emit is_expert/is_collectable on solver_complete too.
  //   - craft_kind is largely (not set) on both — craftKind rates are weak.
  // rlvHistogram: recipe_select × customEvent:rlv bucketed wide.
  const rlvHistRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'recipe_select' } } },
    limit: 100,
  }, { soft: true })
  // matrix: solver_start/solver_complete grouped by (is_expert, is_collectable),
  // macroCopies from solver_macro_copy grouped the same way.
  const matrixDims = [{ name: 'customEvent:is_expert' }, { name: 'customEvent:is_collectable' }]
  const taxStartsRes = await runReport(client, {
    property, dateRanges,
    dimensions: matrixDims,
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_start' } } },
    limit: 50,
  }, { soft: true })
  const taxCompletesRes = await runReport(client, {
    property, dateRanges,
    dimensions: matrixDims,
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_complete' } } },
    limit: 50,
  }, { soft: true })
  const taxMacroRes = await runReport(client, {
    property, dateRanges,
    dimensions: matrixDims,
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_macro_copy' } } },
    limit: 50,
  }, { soft: true })
  // craftKindBreakdown: solver_start / solver_complete × customEvent:craft_kind.
  const kindStartsRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:craft_kind' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_start' } } },
    limit: 50,
  }, { soft: true })
  const kindCompletesRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:craft_kind' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_complete' } } },
    limit: 50,
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
    // rlvHistogram
    const histMap = new Map([['≤300', 0], ['301–510', 0], ['511–600', 0], ['601–680', 0], ['681+', 0]])
    for (const r of rlvHistRows) {
      const bucket = rlvWideBucket(r.dimensionValues[0].value)
      if (!bucket) continue
      histMap.set(bucket, histMap.get(bucket) + Number(r.metricValues[0].value))
    }
    const rlvHistogram = [...histMap.entries()].map(([bucket, events]) => ({ bucket, events }))

    // matrix — accumulate the 4 (is_expert, is_collectable) cells.
    const cellKey = (e, c) => `${e}|${c}`
    const cells = new Map()
    for (const e of [false, true]) {
      for (const c of [false, true]) {
        cells.set(cellKey(e, c), { isExpert: e, isCollectable: c, starts: 0, completes: 0, macroCopies: 0 })
      }
    }
    const accumulate = (rows, field) => {
      for (const r of rows) {
        const e = gaBool(r.dimensionValues[0].value)
        const c = gaBool(r.dimensionValues[1].value)
        const cell = cells.get(cellKey(e, c))
        if (cell) cell[field] += Number(r.metricValues[0].value)
      }
    }
    accumulate(taxStartsRows, 'starts')
    accumulate(taxCompletesRows, 'completes')
    accumulate(taxMacroRows, 'macroCopies')
    const matrix = [...cells.values()].map((cell) => ({
      ...cell,
      completeRate: cell.starts > 0 ? cell.completes / cell.starts : 0,
      macroCopyRate: cell.completes > 0 ? cell.macroCopies / cell.completes : 0,
    }))

    // craftKindBreakdown
    const kindStarts = new Map()
    for (const r of kindStartsRows) {
      kindStarts.set(r.dimensionValues[0].value, Number(r.metricValues[0].value))
    }
    const kindCompletes = new Map()
    for (const r of kindCompletesRows) {
      kindCompletes.set(r.dimensionValues[0].value, Number(r.metricValues[0].value))
    }
    const craftKindBreakdown = [...kindStarts.entries()].map(([kind, starts]) => {
      const completes = kindCompletes.get(kind) ?? 0
      // Clamp: completes/starts can exceed 1 because the two counts come from
      // separate queries and craft_kind is unreliable across event types
      // (largely '(not set)' on solver_start/complete — see TODO above).
      return { kind, starts, completeRate: starts > 0 ? Math.min(1, completes / starts) : 0 }
    })

    out.taxonomy = { rlvHistogram, matrix, craftKindBreakdown }
  }

  // --- Chart #1: byRegion -------------------------------------------------
  // (a) users by region; (b) events by region (eventName × market_region).
  const regionUsersRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customUser:market_region' }],
    metrics: [{ name: 'totalUsers' }, { name: 'newUsers' }],
    limit: 50,
  }, { soft: true })
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
  const regionUsersRows = regionUsersRes?.rows ?? []
  const regionEventsRows = regionEventsRes?.rows ?? []
  if (regionUsersRows.length) {
    // Per-region user totals.
    const userAgg = { cht: { total: 0, fresh: 0 }, intl: { total: 0, fresh: 0 }, unset: { total: 0, fresh: 0 } }
    for (const r of regionUsersRows) {
      const bucket = regionBucket(r.dimensionValues[0].value)
      userAgg[bucket].total += Number(r.metricValues[0].value)
      userAgg[bucket].fresh += Number(r.metricValues[1].value)
    }
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
      const u = userAgg[bucket]
      const returning = Math.max(0, u.total - u.fresh)
      // activeUsers
      const activeUsers = { value: u.total }
      if (u.total > 0) activeUsers.sparkPct = returning / u.total
      activeUsers.secondary = `新 ${u.fresh} · 回訪 ${returning}`
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
      return { activeUsers, solver, batch, bom, infra }
    }
    const cht = glanceRow('cht')
    const intl = glanceRow('intl')
    const unset = glanceRow('unset')
    out.byRegion = {
      activeUsers: { cht: cht.activeUsers, intl: intl.activeUsers, unset: unset.activeUsers },
      solver: { cht: cht.solver, intl: intl.solver, unset: unset.solver },
      batch: { cht: cht.batch, intl: intl.batch, unset: unset.batch },
      bom: { cht: cht.bom, intl: intl.bom, unset: unset.bom },
      infra: { cht: cht.infra, intl: intl.infra, unset: unset.infra },
    }
  }

  // --- Chart #3: toolUsageByRlv ------------------------------------------
  // DRAFT — bom/batch RLV attribution is INCOMPLETE pending a recipes.json join.
  // selectCount: recipe_select × rlv. simulatorCount: solver_start × rlv.
  // bomTargetCount: bom_target_add × rlv IF the event carries rlv, else 0.
  // batchTargetCount: 0 (see TODO below).
  const selectRlvRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'recipe_select' } } },
    limit: 100,
  }, { soft: true })
  const simRlvRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'solver_start' } } },
    limit: 100,
  }, { soft: true })
  const bomRlvRes = await runReport(client, {
    property, dateRanges,
    dimensions: [{ name: 'customEvent:rlv' }],
    metrics: [{ name: 'eventCount' }],
    dimensionFilter: { filter: {
      fieldName: 'eventName', stringFilter: { value: 'bom_target_add' } } },
    limit: 100,
  }, { soft: true })
  const selectRlvRows = selectRlvRes?.rows ?? []
  const simRlvRows = simRlvRes?.rows ?? []
  const bomRlvRows = bomRlvRes?.rows ?? []
  if (selectRlvRows.length || simRlvRows.length) {
    const BUCKETS = ['≤300', '301–510', '511–600', '601–680', '681+']
    const mk = () => new Map(BUCKETS.map((b) => [b, 0]))
    const selectMap = mk()
    const simMap = mk()
    const bomMap = mk()
    const fill = (rows, target) => {
      for (const r of rows) {
        const bucket = rlvToolBucket(r.dimensionValues[0].value)
        if (!bucket) continue
        target.set(bucket, target.get(bucket) + Number(r.metricValues[0].value))
      }
    }
    fill(selectRlvRows, selectMap)
    fill(simRlvRows, simMap)
    fill(bomRlvRows, bomMap)
    out.toolUsageByRlv = BUCKETS.map((bucket) => ({
      bucket,
      selectCount: selectMap.get(bucket),
      simulatorCount: simMap.get(bucket),
      // TODO: batch_optimization_start carries multi-RLV targets; needs per-target
      // rlv expansion + recipes.json join — not implemented
      batchTargetCount: 0,
      bomTargetCount: bomMap.get(bucket),
    }))
  }

  // --- Charts #9 & #10: perfProfile / timeToFirstAction ------------------
  // TODO: perfProfile/timeToFirstAction need numeric perf events (wasm_load_ms,
  // worker_pool_init_ms, time_to_first_action) instrumented + percentile
  // aggregation — not available yet; charts show placeholder. OMITTED.

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

function familyForEvent(event) {
  if (event.startsWith('universalis')) return 'market'
  if (event.startsWith('web_vitals') || event === 'page_view' || event === 'recipe_select') return 'meta'
  if (event.startsWith('solver') || event.startsWith('batch') || event.startsWith('bom') || event.startsWith('gearset') || event.startsWith('queue')) return 'craft'
  if (event === 'exception' || event === 'solver_failed' || event === 'batch_optimization_failed') return 'error'
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
    if (region === '(not set)') row.notset += count
    else if (region === 'unset') row.unset += count
    else if (region === 'cht') row.cht += count
    else if (region === 'intl') row.intl += count
  }
  return [...map.values()]
}

if (CLI.snapshot) {
  runSnapshot().catch((err) => { console.error(err); process.exit(1) })
} else {
  main().catch((err) => { console.error(err); process.exit(1) })
}
