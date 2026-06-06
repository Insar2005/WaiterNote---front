import { createRouter, createWebHashHistory } from 'vue-router'

const router = createRouter({
  history: createWebHashHistory(),
  /**
   * Scroll behavior on every navigation.
   *   - Browser back/forward: restore the saved position (savedPosition is
   *     set by vue-router automatically for popstate-style navigation).
   *   - Everything else (push, replace, programmatic): scroll to top.
   *
   * We scroll the .app-content element directly because that's where the
   * scrollbar lives in this app (.app-shell is fixed-height for layout
   * reasons — see comment in App.vue). Returning {top:0} from this hook
   * would only nudge window/document, which isn't what scrolls.
   */
  scrollBehavior(to, from, savedPosition) {
    // savedPosition only applies to browser-driven (back/forward) nav,
    // and is in document coords. We don't try to restore those — most
    // pages here are stateful (filters, lists) and the user expects the
    // top of the new screen anyway.
    const el = document.querySelector('.app-content')
    if (el) el.scrollTop = 0
    return savedPosition || { top: 0, left: 0 }
  },
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
    {
      path: '/import',
      name: 'import',
      component: () => import('@/views/import/ImportFromCodeView.vue'),
      meta: { hideBottomNav: true },
    },

    // === Profile sub-screens ===
    // Each lives at /profile/* with the bottom nav hidden, so they feel
    // like drill-downs rather than primary tabs. Back goes to /profile.
    {
      path: '/profile/appearance',
      name: 'profile-appearance',
      component: () => import('@/views/profile/AppearanceView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/profile/share',
      name: 'profile-share',
      component: () => import('@/views/profile/ShareView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/profile/workplaces',
      name: 'profile-workplaces',
      component: () => import('@/views/profile/WorkplacesView.vue'),
      meta: { hideBottomNav: true },
    },
    {
      path: '/profile/dev',
      name: 'profile-dev',
      component: () => import('@/views/profile/DevToolsView.vue'),
      meta: { hideBottomNav: true },
    },
  ],
})

export default router