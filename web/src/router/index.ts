import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/translate',
      name: 'translate',
      component: () => import('../views/TranslateView.vue'),
      meta: {
        keepAlive: true,
      },
    },
    {
      path: '/glossary',
      name: 'glossary',
      component: () => import('../views/GlossaryView.vue')
    },
    {
      path: '/config',
      name: 'config',
      component: () => import('../views/ConfigView.vue')
    }
  ]
})

export default router
