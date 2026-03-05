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
  ],
})

export default router
