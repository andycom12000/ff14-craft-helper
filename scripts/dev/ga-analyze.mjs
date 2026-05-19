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
const WINDOW_DAYS = Number(process.env.GA_WINDOW_DAYS ?? 28)

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

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
