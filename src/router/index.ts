import { createRouter, createWebHashHistory } from 'vue-router'
import { trackEvent, trackPageView } from '@/utils/analytics'

const STALE_CHUNK_PATTERNS = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError|Unable to preload CSS/i
const RELOAD_GUARD_KEY = 'ff14ch.stale_chunk_reload_at'
const RELOAD_GUARD_MS = 10_000

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
      meta: { title: '吐司工坊' },
    },
    {
      path: '/gearset',
      name: 'gearset',
      component: () => import('@/views/GearsetView.vue'),
      meta: { title: '配裝管理' },
    },
    {
      path: '/simulator',
      name: 'simulator',
      component: () => import('@/views/SimulatorView.vue'),
      meta: { title: '製作模擬' },
      beforeEnter: (to, from) => {
        let source: 'recipe_auto' | 'manual_nav' | 'queue_jump' | 'share_url' | 'unknown' = 'unknown'
        if (to.query.macro || to.hash.includes('macro')) source = 'share_url'
        else if (to.query.from === 'queue') source = 'queue_jump'
        else if (from.name === 'dashboard' || from.name === 'batch') source = 'recipe_auto'
        else if (from.name) source = 'manual_nav'
        trackEvent('simulator_entry_source', { source })
      },
    },
    {
      path: '/bom',
      name: 'bom',
      component: () => import('@/views/BomView.vue'),
      meta: { title: '購物清單' },
    },
    {
      path: '/company-craft',
      name: 'companyCraft',
      component: () => import('@/views/CompanyCraftView.vue'),
      meta: { title: '部隊工坊' },
    },
    {
      path: '/batch',
      name: 'batch',
      component: () => import('@/views/BatchView.vue'),
      meta: { title: '批量製作' },
    },
    {
      path: '/timer',
      name: 'timer',
      component: () => import('@/views/TimerView.vue'),
      meta: { title: '採集計時器' },
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('@/views/MarketView.vue'),
      meta: { title: '市場查價' },
    },
    {
      path: '/changelog',
      name: 'changelog',
      component: () => import('@/views/ChangelogView.vue'),
      meta: { title: '更新日誌' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: '設定' },
    },
    {
      path: '/admin/ga',
      name: 'admin-ga',
      component: () => import('@/views/admin/GaDashboardView.vue'),
      meta: { title: 'GA Analytics', layout: 'bare' },
    },
  ],
})

router.afterEach((to) => {
  trackPageView(to.fullPath, to.meta.title as string | undefined)
})

// After a deploy, content-hashed chunks for the previous build disappear from
// the host. Old sessions hitting a lazy route then 404 — router promise hangs,
// UI freezes. Detect that signature and reload onto the new build.
// The 10s guard prevents a tight loop if a deploy is mid-flight and chunks
// are still inconsistent.
router.onError((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  if (!STALE_CHUNK_PATTERNS.test(msg)) return
  const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0)
  if (Date.now() - last < RELOAD_GUARD_MS) return
  sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()))
  trackEvent('stale_chunk_reload', { path: location.hash })
  location.reload()
})

router.isReady().then(() => {
  const url = new URL(window.location.href)
  const hash = url.hash || ''
  const referrerHost = (() => {
    try { return new URL(document.referrer).host } catch { return '' }
  })()

  // Hash-based deep-link detection (app uses createWebHashHistory)
  // Patterns derived from share-link conventions in this codebase
  const hasRecipe = /[?&]recipeId=/.test(hash) || /[?&]recipe=/.test(hash)
  const hasBatch = /[?&]targets=/.test(hash) || /[?&]batch=/.test(hash)
  const hasMacro = /[?&]macro=/.test(hash)

  let payload_kind: 'recipe' | 'batch' | 'macro' | 'mixed' | null = null
  const kinds = [hasRecipe, hasBatch, hasMacro].filter(Boolean).length
  if (kinds > 1) payload_kind = 'mixed'
  else if (hasRecipe) payload_kind = 'recipe'
  else if (hasBatch) payload_kind = 'batch'
  else if (hasMacro) payload_kind = 'macro'

  if (payload_kind) {
    trackEvent('share_link_inbound', { payload_kind, referrer_host: referrerHost })
  }
})

export default router
