<template>
  <div v-if="orders.length === 0" class="empty">
    <span class="empty-icon">✓</span>
    <span class="empty-text">Все столы свободны</span>
  </div>
  <div v-else class="list">
    <button
      v-for="o in orders"
      :key="o.id"
      class="row"
      @click="$emit('open', o)"
    >
      <div class="row-table">
        <span class="row-table-label">№</span>
        <span class="row-table-num">{{ o.table_number || '—' }}</span>
      </div>

      <div class="row-main">
        <div class="row-title">
          <template v-if="o.table_number">
            Стол №{{ o.table_number }}<template v-if="o.hall_name"> · {{ o.hall_name }}</template>
          </template>
          <template v-else>Без стола</template>
        </div>
        <div class="row-meta">
          <span class="row-time">⏱ {{ formatDuration(durationFor(o)) }}</span>
          <span class="row-dot">·</span>
          <span
            class="row-items"
            :class="{ 'row-items--all-served': allServed(o) }"
          >
            <template v-if="servedCount(o) > 0">
              {{ servedCount(o) }}/{{ itemCount(o) }} подано
            </template>
            <template v-else>
              {{ itemCount(o) }} {{ pluralize(itemCount(o), ['позиция', 'позиции', 'позиций']) }}
            </template>
          </span>
        </div>
        <div v-if="o.comments" class="row-comment">
          💬 {{ o.comments }}
        </div>
      </div>

      <div class="row-amount">
        {{ formatMoney(o.total_price, currency) }}
      </div>
    </button>
  </div>
</template>

<script setup>
import { useNow } from '@vueuse/core'
import { formatMoney, formatDuration } from '@/utils/format'

defineProps({
  orders: { type: Array, required: true },
  currency: { type: String, default: 'RUB' },
})
defineEmits(['open'])

// Single ticking clock for all rows — better than per-row useNow
const now = useNow({ interval: 30_000 }) // 30s — no need for 1s on a list

function durationFor(o) {
  if (!o?.created_at) return 0
  return Math.max(0, Math.floor(now.value.getTime() / 1000) - Number(o.created_at))
}

function itemCount(o) {
  return (o.items || []).reduce((s, i) => s + (i.quantity || 0), 0)
}

/** How many *units* have been carried to the table (sums quantity, not items). */
function servedCount(o) {
  return (o.items || [])
    .filter((i) => i.served)
    .reduce((s, i) => s + (i.quantity || 0), 0)
}

function allServed(o) {
  const total = itemCount(o)
  return total > 0 && servedCount(o) === total
}

function pluralize(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}
</script>

<style scoped>
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: #fff;
  border-radius: 12px;
  padding: 16px;
  color: #888;
  font-size: 13px;
}

.empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background-color: #e8f5e9;
  color: #2e7d32;
  font-size: 13px;
  font-weight: 700;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: #fff;
  border: none;
  border-radius: 12px;
  padding: 10px 14px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  width: 100%;
  transition: background-color 0.15s ease;
}

.row:active {
  background-color: #f5f5f5;
}

.row-table {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  background-color: #fff3e0;
  border-radius: 10px;
  color: #ef6c00;
}

.row-table-label {
  font-size: 9px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  line-height: 1;
  margin-bottom: 1px;
}

.row-table-num {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #888;
}

.row-time {
  font-variant-numeric: tabular-nums;
}

.row-dot {
  color: #ccc;
}

.row-items {
  font-variant-numeric: tabular-nums;
}

.row-items--all-served {
  color: var(--wn-mint-ink, #2e7d32);
  font-weight: 600;
}

.row-comment {
  font-size: 12px;
  color: var(--wn-peach-ink, #c25e1a);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-style: italic;
}

.row-amount {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>