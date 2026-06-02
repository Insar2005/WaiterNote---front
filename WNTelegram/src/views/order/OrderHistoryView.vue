<template>
  <div class="page">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">История заказов</h1>
    </header>

    <!-- States -->
    <div v-if="!shift.isOpen" class="empty">
      <p>Смена не открыта</p>
      <p class="empty-sub">История доступна только во время текущей смены</p>
      <button class="btn-primary" @click="goTo('shifts')">К сменам</button>
    </div>

    <div v-else-if="paidOrders.length === 0" class="empty">
      <p>В этой смене ещё нет завершённых заказов</p>
      <p class="empty-sub">Закрытые заказы появятся здесь</p>
    </div>

    <template v-else>
      <!-- Summary header -->
      <div class="summary">
        <div class="summary-row">
          <span class="summary-label">Заказов</span>
          <span class="summary-value">{{ paidOrders.length }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Касса</span>
          <span class="summary-value summary-value--accent">
            {{ formatMoney(totalCash, currency) }}
          </span>
        </div>
        <div v-if="totalTips > 0" class="summary-row">
          <span class="summary-label">Чаевые</span>
          <span class="summary-value">
            {{ formatMoney(totalTips, currency) }}
          </span>
        </div>
      </div>

      <!-- Order list -->
      <ul class="list">
        <li v-for="o in sortedPaid" :key="o.id" class="row" @click="onOpen(o)">
          <div class="row-time">
            {{ formatTimeOnly(o.closed_at) }}
          </div>
          <div class="row-main">
            <div class="row-title">
              <template v-if="o.table_number">Стол №{{ o.table_number }}</template>
              <template v-else>Без стола</template>
              <span v-if="o.hall_name" class="row-hall">· {{ o.hall_name }}</span>
            </div>
            <div class="row-meta">
              {{ itemCount(o) }} {{ pluralize(itemCount(o), ['позиция', 'позиции', 'позиций']) }}
              <template v-if="o.tips > 0">
                · чаевые {{ formatMoney(o.tips, currency) }}
              </template>
            </div>
          </div>
          <div class="row-amount">
            {{ formatMoney(o.total_price, currency) }}
          </div>
        </li>
      </ul>
    </template>

    <!-- Details / actions sheet — reuse OrderDetailsSheet in "paid" mode -->
    <OrderDetailsSheet
      :visible="!!detailsOrder"
      :order="detailsOrder"
      :paid-mode="true"
      @close="detailsOrder = null"
      @reopen="onReopen"
      @edit="onEdit"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useOrderStore } from '@/stores/order'
import { useShiftStore } from '@/stores/shift'
import { useWorkplaceStore } from '@/stores/workplace'
import { useUiStore } from '@/stores/ui'
import { formatMoney } from '@/utils/format'
import OrderDetailsSheet from './OrderDetailsSheet.vue'

const router = useRouter()
const order = useOrderStore()
const shift = useShiftStore()
const workplace = useWorkplaceStore()
const ui = useUiStore()

const detailsOrder = ref(null)

const paidOrders = computed(() => order.paidOrders || [])
const sortedPaid = computed(() =>
  [...paidOrders.value].sort((a, b) => (b.closed_at || 0) - (a.closed_at || 0)),
)
const currency = computed(() => workplace.currency)

const totalCash = computed(() =>
  paidOrders.value.reduce((s, o) => s + (Number(o.total_price) || 0), 0),
)
const totalTips = computed(() =>
  paidOrders.value.reduce((s, o) => s + (Number(o.tips) || 0), 0),
)

function itemCount(o) {
  return (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0)
}

function pluralize(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

/** Closed-at timestamp → "14:32" in user's locale. */
function formatTimeOnly(ts) {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts * 1000))
}

function onOpen(o) {
  detailsOrder.value = o
}

async function onReopen(o) {
  const ok = await ui.confirm({
    title: 'Вернуть заказ в активные?',
    message: 'Заказ снова станет активным, стол будет занят. ' +
             'Касса смены пересчитается.',
    confirmText: 'Вернуть',
  })
  if (!ok) return
  try {
    await order.reopenOrder(o.id)
    ui.toastSuccess('Заказ возвращён в активные')
    detailsOrder.value = null
    // Send the user to the table on the map so they can continue.
    if (o.table_id) {
      router.push({ name: 'map', query: { show_order: o.id } })
    }
  } catch (e) {
    ui.toastError(e.message)
  }
}

function onEdit(o) {
  // Edit flow opens OrderBuilder in "edit existing paid order" mode via query.
  detailsOrder.value = null
  router.push({
    name: 'order-builder',
    query: { edit_paid: o.id },
  })
}

function goBack() {
  router.back()
}
function goTo(name) {
  router.push({ name })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: var(--wn-bg, #f5f5f7);
  padding-bottom: 24px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  background-color: var(--wn-bg-elevated, #fff);
  border-bottom: 1px solid var(--wn-glass-border-subtle);
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--wn-ink-soft);
  cursor: pointer;
  padding: 4px 8px;
}

.title {
  flex: 1;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.empty {
  text-align: center;
  padding: 60px 24px 32px;
}

.empty p {
  margin: 0 0 4px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--wn-ink, #1a1a1a);
}

.empty-sub {
  font-size: 13px !important;
  font-weight: 400 !important;
  color: var(--wn-ink-mute, #888);
  margin-bottom: 20px !important;
}

.btn-primary {
  background-color: var(--wn-accent, #4caf50);
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: var(--wn-radius-md, 12px);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.summary {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  flex-wrap: wrap;
}

.summary-row {
  flex: 1;
  min-width: 100px;
  background-color: var(--wn-bg-elevated, #fff);
  border-radius: var(--wn-radius-md, 12px);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  box-shadow: var(--wn-shadow-sm);
}

.summary-label {
  font-size: 11px;
  color: var(--wn-ink-mute, #888);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 500;
}

.summary-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--wn-ink, #1a1a1a);
  font-variant-numeric: tabular-nums;
}

.summary-value--accent {
  color: var(--wn-mint-ink, #2e7d32);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background-color: var(--wn-bg-elevated, #fff);
  border-radius: var(--wn-radius-md, 12px);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.row:active {
  background-color: var(--wn-bg-recessed);
}

.row-time {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--wn-ink-soft, #555);
  font-variant-numeric: tabular-nums;
  width: 44px;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wn-ink, #1a1a1a);
  margin-bottom: 2px;
}

.row-hall {
  font-weight: 400;
  color: var(--wn-ink-mute, #888);
  font-size: 12px;
  margin-left: 4px;
}

.row-meta {
  font-size: 12px;
  color: var(--wn-ink-mute, #888);
}

.row-amount {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--wn-ink, #1a1a1a);
  font-variant-numeric: tabular-nums;
}
</style>