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

export default router
