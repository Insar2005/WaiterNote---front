<template>
  <div class="app-shell">
    <div v-if="!ready && !bootError" class="boot">
      <div class="spinner" />
      <p class="boot-text">Загрузка…</p>
    </div>

    <div v-else-if="bootError" class="boot">
      <p class="boot-error">⚠️ {{ bootError }}</p>
      <button class="boot-retry" @click="boot">Попробовать снова</button>
      <button class="boot-logs" @click="ui.openDiagnostics">
        Показать логи
      </button>
    </div>

    <template v-else>
      <main class="app-content" :class="{ 'app-content--full': hideBottomNav }">
        <router-view />
      </main>
      <BottomNavigation v-if="!hideBottomNav" />
      <PrimaryAction v-if="!hideBottomNav" />
    </template>

    <ToastContainer />
    <ConfirmDialog />
    <PromptHost />
    <DiagnosticsPanel
      v-if="ui.diagnosticsOpen"
      @close="ui.closeDiagnostics"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BottomNavigation from '@/components/BottomNavigation.vue'
import PrimaryAction from '@/components/PrimaryAction.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PromptHost from '@/components/PromptHost.vue'
import DiagnosticsPanel from '@/components/DiagnosticsPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useWorkplaceStore } from '@/stores/workplace'
import { useMenuStore } from '@/stores/menu'
import { useShiftStore } from '@/stores/shift'
import { useUiStore } from '@/stores/ui'
import { useNotesStore } from '@/stores/notes'
import { useHallStore } from '@/stores/hall'
import { useOrderStore } from '@/stores/order'
import { useSettingsStore } from '@/stores/settings'

const route = useRoute()
const router = useRouter()
const hideBottomNav = computed(() => route.meta?.hideBottomNav === true)

const ready = ref(false)
const bootError = ref(null)

const auth = useAuthStore()
const workplace = useWorkplaceStore()
const menu = useMenuStore()
const shift = useShiftStore()
const notes = useNotesStore()
const hall = useHallStore()
const order = useOrderStore()
const ui = useUiStore()
const settings = useSettingsStore()

// Paint the cached appearance (accent + theme) from localStorage as
// early as possible — this happens before any network I/O so the user
// never sees a light-themed flash on a dark device while /me loads.
// The server's prefs (if any) are applied later in boot(), once auth
// has populated the user object.
settings.init()

/**
 * Telegram passes a string in initDataUnsafe.start_param when the Mini App
 * is opened via a deep link like `t.me/<bot>?startapp=<value>`. We use
 * this for "import-share" links — `import_<code>` should land the user
 * directly on the import screen with the code prefilled. Other start_params
 * (or no start_param at all) → returns null and boot routes normally.
 *
 * Read inside boot() so we always see the freshest value — Telegram sets
 * it before our scripts run, but reading it lazily keeps this resilient
 * to any future API timing changes.
 */
function deepLinkImportCode() {
  const param = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  if (typeof param !== 'string') return null
  if (!param.startsWith('import_')) return null
  const code = param.slice('import_'.length).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return code.length >= 4 ? code : null
}

/**
 * Navigation memory: remembers which screen the user was on, so a page
 * reload (F5, swipe-down-to-refresh in Telegram, etc.) brings them back
 * to where they were instead of dumping them on /home. A fresh launch
 * of the Mini App (no remembered route) still defaults to /home — the
 * expected entry point.
 *
 * Why sessionStorage, not localStorage:
 *   - sessionStorage is wiped when the tab / Mini App closes, which is
 *     exactly the "fresh launch" boundary we want.
 *   - localStorage would persist forever — a user who closed the app
 *     three days ago in /shifts shouldn't reopen there now.
 *
 * Why we still confirm with the Performance API:
 *   - Some Telegram WebView versions on Android keep sessionStorage
 *     alive across full closes (treating it like a long-lived tab).
 *     Cross-checking against navigation.type === 'reload' makes restore
 *     conditional on this load actually being a reload.
 */
const NAV_MEMORY_KEY = 'wn:lastRoute'

// Routes that should NEVER be auto-restored on reload — they're either
// transient (deep-link landing pages, gates) or unsafe to land on cold
// (e.g. order-builder needs an in-progress draft to make sense).
const NON_RESTORABLE_ROUTES = new Set([
  'onboarding',
  'bot-required',
  'import',          // deep-link only — fresh code or back to home
  'order-builder',   // needs a draft; cold-restore would show empty cart
])

function rememberRoute(routeObj) {
  try {
    if (!routeObj?.name) return
    if (NON_RESTORABLE_ROUTES.has(routeObj.name)) return
    sessionStorage.setItem(
      NAV_MEMORY_KEY,
      JSON.stringify({
        name: routeObj.name,
        params: routeObj.params || {},
        query: routeObj.query || {},
      }),
    )
  } catch { /* storage unavailable — silent no-op */ }
}

/**
 * Is the current page load a reload (vs a fresh navigation)?
 * Performance API gives a definitive answer; we treat absence of the
 * data as "not a reload" to err on the conservative side (default to
 * home rather than surprise the user with a stale screen).
 */
function isPageReload() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0]
    return nav?.type === 'reload'
  } catch {
    return false
  }
}

function readRememberedRoute() {
  try {
    const raw = sessionStorage.getItem(NAV_MEMORY_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data?.name || NON_RESTORABLE_ROUTES.has(data.name)) return null
    return data
  } catch {
    return null
  }
}

// Track every route change to keep the "where I was" memory fresh.
// Skip the very first navigation triggered by boot() routing the user —
// that gets stored on its own once boot completes. Subsequent normal
// router-view changes all flow through this watcher.
watch(
  () => route.fullPath,
  () => {
    if (ready.value) rememberRoute(route)
  },
)

async function boot() {
  bootError.value = null
  ready.value = false
  try {
    await auth.init()

    // Reconcile appearance with what the server knows about this user.
    // If they switched accent/theme on another device, that choice now
    // overrides the local cache. No-op for fresh users — they'll keep
    // whatever the local cache had until they make their first change.
    settings.applyFromUser(auth.user)

    // Bot-access gate. We only block the app on an explicit "blocked"
    // from Telegram — meaning the user definitely hasn't pressed /start
    // (or has actively blocked the bot). On "unreachable" we fail OPEN:
    // some hosting environments (incl. ours) can't reach api.telegram.org
    // reliably, and locking everyone out because of a backend network
    // hiccup is worse than silently skipping a notification later.
    // Once we get a clean "ok" we cache it server-side for a minute, so
    // a single successful probe unsticks the gate for the rest of the
    // session.
    const botStatus = await auth.checkBotAccess()
    if (botStatus === 'blocked') {
      if (route.name !== 'bot-required') {
        router.replace({ name: 'bot-required' })
      }
      ready.value = true
      return
    }
    // 'ok' or 'unreachable' — continue booting.

    await workplace.fetchAll()
    notes.fetchAll().catch(() => {})
    if (workplace.currentId) {
      await Promise.all([
        menu.fetchAll(workplace.currentId),
        shift.fetchCurrent(workplace.currentId),
        hall.fetchAll(workplace.currentId),
      ])
      // Reconcile the persisted draft against the freshly loaded menu.
      // A draft can outlive a menu item — e.g. user tried the demo build
      // (which had its own seed menu IDs) and later switched to the real
      // backend, or simply deleted a menu item. Submitting such a draft
      // raises a FK violation server-side, so we drop the stale items
      // here and tell the user what happened.
      const removed = order.reconcileDraftWithMenu(
        menu.items.map((i) => i.id),
      )
      if (removed > 0) {
        ui.toastWarning(
          removed === 1
            ? 'Одной позиции больше нет в меню — убрали из заказа'
            : `${removed} позиций больше нет в меню — убрали из заказа`,
        )
      }
      // Orders depend on shift — fetch after shift loaded
      if (shift.current?.id) {
        order.fetchForCurrentShift().catch(() => {})
      }
    }

    // ===== Routing decision at app start =====
    // Priority order:
    //   1. Onboarding incomplete → onboarding flow (everything else waits).
    //   2. Deep-linked import (Telegram start_param) → /import with code.
    //   3. Page reload + remembered route → restore where the user was.
    //   4. Fresh launch (or no memory) → /home, the predictable entry point.
    if (!auth.isOnboardingCompleted) {
      if (route.name !== 'onboarding') {
        router.replace({ name: 'onboarding' })
      }
    } else if (deepLinkImportCode()) {
      // start_param "import_XYZ" → /import?code=XYZ (overrides memory —
      // a deep link is an explicit user intent we shouldn't shadow).
      router.replace({
        name: 'import',
        query: { code: deepLinkImportCode() },
      })
    } else {
      const remembered = isPageReload() ? readRememberedRoute() : null
      if (remembered) {
        // Restore. router.resolve verifies the remembered name still
        // exists in the route table — if a route was removed in a code
        // update the user just lands on home instead of seeing a blank
        // page.
        const target = {
          name: remembered.name,
          params: remembered.params,
          query: remembered.query,
        }
        if (router.hasRoute(remembered.name)) {
          router.replace(target)
        } else if (route.name !== 'home') {
          router.replace({ name: 'home' })
        }
      } else if (route.name !== 'home') {
        router.replace({ name: 'home' })
      }
    }
    ready.value = true
    // Persist whatever route boot() ended up on, so an immediate reload
    // before the user navigates anywhere keeps the same screen.
    rememberRoute(route)
  } catch (e) {
    bootError.value = e.message || 'Не удалось загрузить данные'
  }
}

// When the bot-access gate clears (user pressed Start in the bot,
// or Telegram came back online), we need to actually load the data
// that the early-returned boot() didn't load. Just navigating to /home
// from the gate would leave the app empty (no workplaces, no menu);
// re-running boot() is the clean way to pick up where we left off.
watch(
  () => auth.botStatus,
  (newStatus, oldStatus) => {
    if (newStatus === 'ok' && oldStatus && oldStatus !== 'ok') {
      boot()
    }
  },
)

watch(
  () => workplace.currentId,
  (newId, oldId) => {
    if (newId === oldId) return
    if (!newId) {
      menu.reset()
      shift.reset()
      hall.reset()
      order.reset()
      return
    }
    menu.fetchAll(newId).catch(() => {})
    hall.fetchAll(newId).catch(() => {})
    shift.fetchCurrent(newId).then(() => {
      order.fetchForCurrentShift().catch(() => {})
    }).catch(() => {})
    shift.fetchHistory(newId, { reset: true }).catch(() => {})
  },
)

// Reload orders when shift changes (open/close)
watch(
  () => shift.current?.id,
  (newShiftId, oldShiftId) => {
    if (newShiftId === oldShiftId) return
    if (newShiftId) {
      order.fetchForCurrentShift().catch(() => {})
    } else {
      order.orders = []
    }
  },
)

onMounted(boot)
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--wn-bg);
  color: var(--wn-ink);
}

.app-content {
  flex: 1;
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.app-content--full {
  padding-bottom: 0;
}

.boot {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 32px;
  text-align: center;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--wn-bg-recessed);
  border-top-color: var(--wn-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.boot-text {
  color: var(--wn-ink-mute);
  font-size: 14px;
  margin: 0;
}

.boot-error {
  color: var(--wn-danger);
  font-size: 15px;
  margin: 0;
}

.boot-retry {
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  background-color: var(--wn-accent);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.boot-logs {
  margin-top: 8px;
  padding: 8px 16px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--wn-ink-mute);
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}
</style>