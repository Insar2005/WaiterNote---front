<template>
  <div class="page">
    <header class="header">
      <div class="header-left">
        <h1 class="greeting">{{ greeting }}{{ userName ? `, ${userName}` : '' }}</h1>
        <p class="date">{{ todayLabel }}</p>
      </div>
      <WorkplaceSwitcher />
    </header>

    <!-- No workplace at all -->
    <section v-if="workplace.isEmpty" class="empty-block">
      <p class="empty-title">Сначала создайте заведение</p>
      <p class="empty-text">
        Заведение — это место работы. Можно настроить меню, столы, начислять смены.
      </p>
      <button class="btn-primary" @click="goTo('profile')">Перейти в профиль</button>
    </section>

    <template v-else>
      <!-- CTA when shift is closed; nothing visible when shift is open
           (live shift status lives in the Shifts tab) -->
      <section v-if="!shift.isOpen" class="section">
        <div class="cta">
          <div class="cta-text">
            <p class="cta-title">Смена не открыта</p>
            <p class="cta-sub">Откройте смену, чтобы принимать заказы</p>
          </div>
          <button class="btn-primary btn-primary--small" @click="goTo('shifts')">
            Открыть
          </button>
        </div>
      </section>

      <!-- Active orders -->
      <section v-if="shift.isOpen" class="section">
        <div class="section-header">
          <h2 class="section-title">
            Активные заказы
            <span v-if="order.activeOrders.length > 0" class="section-counter">
              {{ order.activeOrders.length }}
            </span>
          </h2>
          <button class="history-btn" @click="goTo('order-history')">
            История <span aria-hidden="true">→</span>
          </button>
        </div>
        <div v-if="order.activeOrders.length > 0" class="section-subline">
          На столах: {{ formatMoney(order.activeRevenue, workplace.currency) }}
        </div>
        <ActiveOrdersList
          :orders="order.activeOrders"
          :currency="workplace.currency"
          @open="openOrderOnMap"
        />
      </section>

    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWorkplaceStore } from '@/stores/workplace'
import { useShiftStore } from '@/stores/shift'
import { useOrderStore } from '@/stores/order'
import { formatMoney } from '@/utils/format'
import WorkplaceSwitcher from '@/components/WorkplaceSwitcher.vue'
import ActiveOrdersList from './ActiveOrdersList.vue'

const router = useRouter()
const auth = useAuthStore()
const workplace = useWorkplaceStore()
const order = useOrderStore()
const shift = useShiftStore()

const userName = computed(() => auth.user?.username || '')

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 17) return 'Добрый день'
  return 'Добрый вечер'
})

const todayLabel = computed(() => {
  const d = new Date()
  return new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
})

function goTo(name) {
  router.push({ name })
}

/**
 * Open the map with this order's details sheet auto-shown.
 * The map reads `?show_order=ID` from query and opens the sheet.
 */
function openOrderOnMap(o) {
  router.push({ name: 'map', query: { show_order: o.id } })
}
</script>

<style scoped>
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 20px;
}

.header-left {
  flex: 1;
  min-width: 0;
}

.greeting {
  margin: 0 0 2px 0;
  font-size: 22px;
  font-weight: 700;
  color: var(--wn-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.date {
  margin: 0;
  font-size: 13px;
  color: var(--wn-ink-mute);
  text-transform: capitalize;
}

.section {
  margin-bottom: 22px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--wn-ink-mute);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
}

/* Empty state when no workplace */
.empty-block {
  background-color: var(--wn-bg-elevated);
  border-radius: 16px;
  padding: 28px 20px;
  text-align: center;
}

.empty-title {
  margin: 0 0 6px 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--wn-ink);
}

.empty-text {
  margin: 0 0 16px 0;
  font-size: 14px;
  color: var(--wn-ink-soft);
  line-height: 1.45;
}

.btn-primary {
  background-color: var(--wn-accent);
  color: #fff;
  border: none;
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary--small {
  padding: 9px 16px;
  font-size: 13px;
}

.btn-primary:active {
  opacity: 0.85;
}

/* No-shift CTA */
.cta {
  background-color: var(--wn-bg-elevated);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.cta-text {
  flex: 1;
}

.cta-title {
  margin: 0 0 2px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--wn-ink);
}

.cta-sub {
  margin: 0;
  font-size: 12px;
  color: var(--wn-ink-mute);
}

/* Active orders section header */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 8px;
}

.section-header .section-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-counter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
  padding: 0 6px;
  border-radius: 9px;
  background-color: #ef6c00;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-transform: none;
  letter-spacing: 0;
}

.section-amount {
  font-size: 13px;
  font-weight: 600;
  color: var(--wn-accent-text);
  font-variant-numeric: tabular-nums;
}

.history-btn {
  background: none;
  border: 1px solid var(--wn-glass-border-subtle, rgba(0, 0, 0, 0.08));
  color: var(--wn-ink-soft, #555);
  padding: 6px 10px;
  border-radius: var(--wn-radius-pill, 999px);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: background-color 0.15s ease;
}

.history-btn:active {
  background-color: var(--wn-bg-recessed, #ebebef);
}

.section-subline {
  font-size: 12px;
  color: var(--wn-ink-mute, #888);
  margin: -4px 0 8px 0;
  font-variant-numeric: tabular-nums;
}
</style>