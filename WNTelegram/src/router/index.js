import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/main/Main.vue'),
    },
    {
      path: '/map',
      name: 'map',
      component: () => import('@/views/hall/map.vue'),
    },
    {
      path: '/shifts',
      name: 'shifts',
      component: () => import('@/views/shifts/shift.vue'),
    },
    {
      path: '/notes',
      name: 'notes',
      component: () => import('@/views/notes/Notes.vue'),
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/profile/ProfileView.vue'),
    },
    {
      path: '/menu',
      name: 'menu',
      component: () => import('@/views/menu/MenuEditorView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/hall-editor',
      name: 'hall-editor',
      component: () => import('@/views/hall/HallEditorView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/order-builder',
      name: 'order-builder',
      component: () => import('@/views/order/OrderBuilderView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('@/views/onboarding/OnboardingView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/bot-required',
      name: 'bot-required',
      component: () => import('@/views/auth/BotRequiredView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/order-history',
      name: 'order-history',
      component: () => import('@/views/order/OrderHistoryView.vue'),
      meta: { hideBottomNav: true },
    },
  ],
})

export default router