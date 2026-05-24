<template>
  <div class="row" @click="$emit('open', shift)">
    <div class="row-main">
      <div class="row-date">{{ formatDate(shift.start_time) }}</div>
      <div class="row-meta">
        {{ formatTime(shift.start_time) }} – {{ formatTime(shift.end_time) }}
        · {{ formatDuration(shift.duration) }}
        · {{ shift.order_count }} заказов
      </div>
    </div>
    <div class="row-amount">
      <span class="amount">{{ formatMoney(shift.total_pay_for_shift, shift.currency) }}</span>
      <span v-if="shift.total_tips > 0" class="tips">
        + {{ formatMoney(shift.total_tips, shift.currency) }} чаев.
      </span>
    </div>
  </div>
</template>

<script setup>
import { formatDate, formatTime, formatDuration, formatMoney } from '@/utils/format'

defineProps({
  shift: { type: Object, required: true },
})
defineEmits(['open'])
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  background-color: #fff;
  padding: 12px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.row:active {
  background-color: #f5f5f5;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-date {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 2px;
}

.row-meta {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-amount {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.amount {
  font-size: 14px;
  font-weight: 600;
  color: #4caf50;
  font-variant-numeric: tabular-nums;
}

.tips {
  font-size: 11px;
  color: #888;
}
</style>