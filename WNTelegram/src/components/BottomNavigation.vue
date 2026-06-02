<template>
  <nav class="bottom-nav" :class="{ 'bottom-nav--no-blur': noBlurFallback }">
    <div class="nav-content">
      <!-- Sliding pill indicator. Position is computed from the active tab index. -->
      <span
        class="indicator"
        :style="{
          left: `${indicatorLeft}%`,
          opacity: activeIdx >= 0 ? 1 : 0,
        }"
        aria-hidden="true"
      />

      <router-link
        v-for="(item, idx) in items"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ 'nav-item--active': idx === activeIdx }"
      >
        <span class="nav-icon-wrap">
          <component :is="item.icon" class="nav-icon" />
        </span>
        <span class="nav-label">{{ item.label }}</span>
      </router-link>
    </div>
  </nav>
</template>

<script setup>
import { computed, ref, onMounted, h } from 'vue'
import { useRoute } from 'vue-router'

// ============================================================
// Icons — inline SVG components, all 24x24, stroke-based,
// using currentColor so we can recolor via CSS.
// ============================================================

const baseIconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 1.8,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
}

const HomeIcon = {
  render: () => h('svg', baseIconProps, [
    // House outline
    h('path', { d: 'M3 11.5 12 4l9 7.5' }),
    h('path', { d: 'M5 10v9.5a.5.5 0 0 0 .5.5H9v-6h6v6h3.5a.5.5 0 0 0 .5-.5V10' }),
  ]),
}

// Table between two chairs (top-down view)
// Center rectangle = table, two short rectangles on the sides = chair backs.
const TableIcon = {
  render: () => h('svg', baseIconProps, [
    // Left chair (back rail + seat hint)
    h('rect', { x: 3, y: 9, width: 3, height: 6, rx: 0.8 }),
    // Right chair
    h('rect', { x: 18, y: 9, width: 3, height: 6, rx: 0.8 }),
    // Table in the middle (slightly taller than chairs to read as "table")
    h('rect', { x: 7.5, y: 6, width: 9, height: 12, rx: 1.5 }),
  ]),
}

// Stopwatch — round face with a tick + crown on top
const ShiftIcon = {
  render: () => h('svg', baseIconProps, [
    // Crown / button on top
    h('path', { d: 'M10 3h4' }),
    h('path', { d: 'M12 3v2.5' }),
    // Body
    h('circle', { cx: 12, cy: 13, r: 7.5 }),
    // Hands — pointing to roughly 1 o'clock to feel "active"
    h('path', { d: 'M12 13 15 11' }),
    h('path', { d: 'M12 13v-3' }),
  ]),
}

// Note — paper sheet with a folded corner and a couple of lines
const NoteIcon = {
  render: () => h('svg', baseIconProps, [
    h('path', { d: 'M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z' }),
    h('path', { d: 'M14 3v4h4' }),
    h('path', { d: 'M9 13h6' }),
    h('path', { d: 'M9 17h4' }),
  ]),
}

// Profile — user silhouette
const ProfileIcon = {
  render: () => h('svg', baseIconProps, [
    h('circle', { cx: 12, cy: 8, r: 3.5 }),
    h('path', { d: 'M5 20c1.5-3.8 4-5.5 7-5.5s5.5 1.7 7 5.5' }),
  ]),
}

const items = [
  { to: '/',        icon: HomeIcon,    label: 'Главная' },
  { to: '/map',     icon: TableIcon,   label: 'Карта' },
  { to: '/notes',   icon: NoteIcon,    label: 'Заметки' },
  { to: '/shifts',  icon: ShiftIcon,   label: 'Смены' },
  
  { to: '/profile', icon: ProfileIcon, label: 'Профиль' },
]

// ============================================================
// Active tab tracking
// ============================================================

const route = useRoute()

/**
 * Match the deepest path that's a prefix of the current route.
 * Sub-routes like /order-builder fall back to /map (they have hideBottomNav,
 * but the indicator stays where the user came from anyway).
 */
const activeIdx = computed(() => {
  const path = route.path
  // Exact match first
  for (let i = 0; i < items.length; i++) {
    if (items[i].to === path) return i
  }
  // Prefix match (longest wins)
  let bestIdx = -1
  let bestLen = 0
  for (let i = 0; i < items.length; i++) {
    const to = items[i].to
    if (to === '/') continue // root is too greedy as a prefix
    if (path.startsWith(to) && to.length > bestLen) {
      bestIdx = i
      bestLen = to.length
    }
  }
  if (bestIdx >= 0) return bestIdx
  // Default: home if path is '/'
  return path === '/' ? 0 : -1
})

const indicatorLeft = computed(() => {
  if (activeIdx.value < 0) return 0
  // Each tab is (100% / N) wide; indicator is 50% of that and centered.
  const tabPct = 100 / items.length
  return activeIdx.value * tabPct + tabPct / 2 - tabPct / 4
})

// ============================================================
// Browser capability check
// ============================================================

const noBlurFallback = ref(false)
onMounted(() => {
  const supports = CSS.supports?.('backdrop-filter', 'blur(10px)')
    || CSS.supports?.('-webkit-backdrop-filter', 'blur(10px)')
  noBlurFallback.value = !supports
})
</script>

<style scoped>
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 76px;
  padding-bottom: env(safe-area-inset-bottom);
  z-index: 100;

  background: var(--wn-glass-light);
  -webkit-backdrop-filter: blur(var(--wn-blur-md)) saturate(180%);
  backdrop-filter: blur(var(--wn-blur-md)) saturate(180%);
  border-top: 1px solid var(--wn-glass-border);
  box-shadow: var(--wn-shadow-glass);
}

.bottom-nav--no-blur {
  background: var(--wn-glass-strong);
}

/* Inner grid that hosts both the sliding indicator and the tabs.
   Keeping it padding-free at the sides ensures the indicator's % math
   aligns exactly with tab centers. */
.nav-content {
  position: relative;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: space-around;
}

/* === Sliding indicator pill === */
.indicator {
  position: absolute;
  top: 9px;
  /* Width = 50% of one tab, positioned centered via the inline `left` */
  width: 10%;
  height: 30px;
  border-radius: var(--wn-radius-pill);
  background-color: var(--wn-accent-fill);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 1px 2px color-mix(in srgb, var(--wn-accent) 18%, transparent);
  transition:
    left 0.32s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.18s ease;
  pointer-events: none;
}

.nav-item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-decoration: none;
  color: var(--wn-ink-mute);
  z-index: 1;
  transition: transform 0.18s ease;
}

.nav-item:active {
  transform: scale(0.92);
}

.nav-icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 30px;
  /* Match indicator height; icon will appear inside the pill when active */
}

.nav-icon {
  width: 22px;
  height: 22px;
  transition: color 0.22s ease, transform 0.22s ease;
}

.nav-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.2px;
  line-height: 1;
  transition: color 0.22s ease, font-weight 0.22s ease;
}

/* Active state: icon and label adopt mint-ink color. The pill comes from
   the .indicator element, which is shared and slides between tabs. */
.nav-item--active {
  color: var(--wn-accent-text);
}

.nav-item--active .nav-icon {
  /* Slight emphasis: icon gets a hair thicker via stroke (not possible
     directly, so we use scale to imply weight) */
  transform: scale(1.05);
}

.nav-item--active .nav-label {
  font-weight: 600;
}
</style>