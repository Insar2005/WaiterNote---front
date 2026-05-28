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

async function boot() {
  bootError.value = null
  ready.value = false
  try {
    await auth.init()

    // Bot-access gate. Before loading workplaces/menus we check whether
    // our bot can actually message this user — if not, the whole app is
    // unusable (we send order/booking/import notifications via the bot).
    // 'ok' falls through to normal boot; anything else routes to a gate
    // screen and stops boot early, so we don't pay for data we won't show.
    const botStatus = await auth.checkBotAccess()
    if (botStatus !== 'ok') {
      if (route.name !== 'bot-required') {
        router.replace({ name: 'bot-required' })
      }
      ready.value = true
      return
    }

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
    // Routing decision at app start:
    //  - First-time users (onboarding not completed) → onboarding flow.
    //  - Everyone else → home screen, regardless of the route the Telegram
    //    hash remembers from a previous session (predictable entry point).
    if (!auth.isOnboardingCompleted) {
      if (route.name !== 'onboarding') {
        router.replace({ name: 'onboarding' })
      }
    } else if (route.name !== 'home') {
      router.replace({ name: 'home' })
    }
    ready.value = true
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
  background-color: #f5f5f7;
  color: #1a1a1a;
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
  border: 3px solid #d8d8d8;
  border-top-color: #4caf50;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.boot-text {
  color: #888;
  font-size: 14px;
  margin: 0;
}

.boot-error {
  color: #c62828;
  font-size: 15px;
  margin: 0;
}

.boot-retry {
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  background-color: #4caf50;
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
  color: #888;
  font-size: 13px;
  text-decoration: underline;
  cursor: pointer;
}
</style>