<template>
  <div class="page">
    <header class="header">
      <div class="header-left">
        <h1 class="title">Карта</h1>
        <span v-if="workplace.current" class="subtitle">
          {{ workplace.current.title }}
        </span>
      </div>
      <WorkplaceSwitcher />
    </header>

    <!-- Banner: shift not open -->
    <div v-if="workplace.currentId && !shift.isOpen" class="banner">
      <span class="banner-icon">⏸</span>
      <span class="banner-text">
        Смена не открыта — приём заказов недоступен.
        <router-link class="banner-link" :to="{ name: 'shifts' }">Открыть</router-link>
      </span>
    </div>

    <!-- States -->
    <div v-if="!workplace.currentId" class="empty-screen">
      <p>Выберите заведение в Профиле</p>
    </div>

    <div v-else-if="hall.isEmpty" class="empty-screen">
      <p class="empty-title">В этом заведении ещё нет ни одного зала</p>
      <p class="empty-text">Добавьте зал в Профиле, чтобы расставить столы.</p>
      <button class="btn-primary" @click="goToHallEditor">Открыть редактор карты</button>
    </div>

    <template v-else>
      <HallSwitcher
        v-if="hall.sortedHalls.length > 1"
        :halls="hall.sortedHalls"
        :active-id="hall.activeHallId"
        @select="hall.setActiveHall"
      />

      <div class="canvas-area">
        <HallCanvas
          v-if="hall.activeHall"
          ref="canvasRef"
          :hall="hall.activeHall"
          :tables="hall.tablesOfActive"
          :pulse-table-id="highlightTableId"
          @table-click="onTableClick"
        />
      </div>
    </template>

    <OrderDetailsSheet
      :visible="!!detailsOrder"
      :order="detailsOrder"
      @close="detailsOrder = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkplaceStore } from '@/stores/workplace'
import { useShiftStore } from '@/stores/shift'
import { useHallStore } from '@/stores/hall'
import { useOrderStore } from '@/stores/order'
import { useUiStore } from '@/stores/ui'
import WorkplaceSwitcher from '@/components/WorkplaceSwitcher.vue'
import HallSwitcher from './HallSwitcher.vue'
import HallCanvas from './HallCanvas.vue'
import OrderDetailsSheet from '@/views/order/OrderDetailsSheet.vue'

const route = useRoute()
const router = useRouter()
const workplace = useWorkplaceStore()
const shift = useShiftStore()
const hall = useHallStore()
const order = useOrderStore()
const ui = useUiStore()

const canvasRef = ref(null)
const detailsOrder = ref(null)
const highlightTableId = ref(null)

// === Query-driven side effects ===
// OrderBuilder → ?highlight_table=ID  (transient pulse)
// Main page    → ?show_order=ID       (auto-open details sheet)
onMounted(() => {
  applyQueryEffects()
})

watch(
  () => [route.query.highlight_table, route.query.show_order],
  () => applyQueryEffects(),
)

function applyQueryEffects() {
  let needClear = false

  const tableId = route.query.highlight_table
  if (tableId) {
    // Same hall-switching concern as show_order below: highlighting a
    // table that's not in the active hall would otherwise pulse silently
    // out of view.
    const tableHallId = hall.tableById(tableId)?.hall_id
    if (tableHallId && tableHallId !== hall.activeHallId) {
      hall.setActiveHall(tableHallId)
    }
    highlightTableId.value = tableId
    setTimeout(() => { highlightTableId.value = null }, 2000)
    nextTick(() => canvasRef.value?.centerOnTable(tableId))
    needClear = true
  }

  const orderId = route.query.show_order
  if (orderId) {
    const o = order.orderById(orderId)
    if (o) {
      detailsOrder.value = o
      // Switch to the hall that owns this order's table BEFORE centring.
      // Without this the order would open visually in whatever hall is
      // currently active, while the actual table (and its highlight) is
      // in a different hall — looking like "wrong hall" to the user.
      // Order.hall_id is the source of truth; fall back via the table
      // lookup in case it's missing on an older record.
      const targetHallId =
        o.hall_id || (o.table_id ? hall.tableById(o.table_id)?.hall_id : null)
      if (targetHallId && targetHallId !== hall.activeHallId) {
        hall.setActiveHall(targetHallId)
      }
      if (o.table_id) {
        // nextTick so the hall switch (and its DOM update) lands first,
        // then the canvas has the right tables to centre on.
        nextTick(() => canvasRef.value?.centerOnTable(o.table_id))
      }
    }
    needClear = true
  }

  if (needClear) {
    router.replace({ name: 'map' })
  }
}

// === Table tap handler ===
function onTableClick(table) {
  if (!shift.isOpen) {
    ui.toastInfo('Откройте смену, чтобы работать с заказами')
    return
  }

  // Find an active order for this table
  let existingOrder = order.orderByTable(table.id)

  // Recovery: if the table is marked occupied (it has an order_id) but we
  // can't find that order locally, look it up by id directly. This can
  // happen after a force-close of a previous shift, or any state-rehydration
  // race. Without this, the user would be silently sent to "new order".
  if (!existingOrder && table.order_id) {
    const candidate = order.orderById(table.order_id)
    if (candidate && !candidate.is_paid) {
      existingOrder = candidate
    }
  }

  if (existingOrder) {
    // Show details — center on the table so it's visible above the sheet
    detailsOrder.value = existingOrder
    nextTick(() => canvasRef.value?.centerOnTable(table.id))
  } else {
    // Free (or stale red state) → start new order pre-filled with this table
    router.push({
      name: 'order-builder',
      query: { table_id: table.id },
    })
  }
}

function goToHallEditor() {
  router.push({ name: 'hall-editor' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--wn-bg);
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 12px 16px;
  background-color: var(--wn-bg-elevated);
  border-bottom: 1px solid var(--wn-glass-border-subtle);
  /* Same reasoning as on the canvas: block native scroll for swipes that
     start in this header strip. Buttons inside still receive their clicks. */
  touch-action: none;
  overscroll-behavior: contain;
}

.header-left {
  flex: 1;
  min-width: 0;
}

.title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--wn-ink);
}

.subtitle {
  font-size: 12px;
  color: var(--wn-ink-mute);
}

.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #fff8e1;
  border-bottom: 1px solid #ffe0b2;
  padding: 8px 16px;
  font-size: 13px;
  color: #ef6c00;
}

.banner-icon {
  font-size: 14px;
}

.banner-text {
  flex: 1;
}

.banner-link {
  color: #ef6c00;
  text-decoration: underline;
  font-weight: 500;
  margin-left: 4px;
}

.empty-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 32px 24px;
  text-align: center;
  gap: 12px;
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--wn-ink);
}

.empty-text {
  margin: 0;
  color: var(--wn-ink-mute);
  font-size: 14px;
}

.btn-primary {
  background-color: var(--wn-accent);
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 8px;
}

.canvas-area {
  flex: 1;
  position: relative;
  padding-bottom: calc(76px + env(safe-area-inset-bottom));
}

.canvas-area > * {
  position: absolute;
  inset: 0;
  bottom: calc(76px + env(safe-area-inset-bottom));
}
</style>