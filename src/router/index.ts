import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/gearset',
      name: 'gearset',
      component: () => import('@/views/GearsetView.vue'),
    },
    {
      path: '/simulator',
      name: 'simulator',
      component: () => import('@/views/SimulatorView.vue'),
    },
    {
      path: '/bom',
      name: 'bom',
      component: () => import('@/views/BomView.vue'),
    },
    {
      path: '/batch',
      name: 'batch',
      component: () => import('@/views/BatchView.vue'),
    },
    {
      path: '/timer',
      name: 'timer',
      component: () => import('@/views/TimerView.vue'),
    },
    {
      path: '/market',
      name: 'market',
      component: () => import('@/views/MarketView.vue'),
    },
    {
      path: '/changelog',
      name: 'changelog',
      component: () => import('@/views/ChangelogView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

export default router
