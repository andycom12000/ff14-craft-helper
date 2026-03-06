import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'gearset',
      component: () => import('@/views/GearsetView.vue'),
    },
    {
      path: '/recipe',
      name: 'recipe',
      component: () => import('@/views/RecipeView.vue'),
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
      path: '/market',
      name: 'market',
      component: () => import('@/views/MarketView.vue'),
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

export default router
