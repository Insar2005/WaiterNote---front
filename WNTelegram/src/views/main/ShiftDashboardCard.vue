<template>
  <div class="card" @click="$emit('click')">
    <div class="top">
      <div class="status">
        <span class="dot" />
        <span class="status-text">Смена идёт</span>
      </div>
      <span class="duration">{{ durationText }}</span>
    </div>

    <div class="amount">
      {{ formatMoney(shift.total_pay_for_shift, shift.currency) }}
    </div>
    <div class="amount-label">заработано на этой смене</div>

    <div class="grid">
      <div class="cell">
        <span class="cell-value">{{ formatMoney(shift.total_tips, shift.currency) }}</span>
        <span class="cell-label">чаевые</span>
      </div>
      <div class="cell">
        <span class="cell-value">{{ formatMoney(shift.total_cash_register, shift.currency) }}</span>
        <span class="cell-label">касса</span>
      </div>
      <div class="cell">
        <span class="cell-value">{{ shift.order_count }}</span>
        <span class="cell-label">заказов</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatMoney, formatDuration } from '@/utils/format'
import { useLiveDuration } from '@/composables/useLiveDuration'

const props = defineProps({
  shift: { type: Object, required: true },
})
defineEmits(['click'])

const liveDuration = useLiveDuration(() => props.shift?.start_time)
const durationText = computed(() => formatDuration(liveDuration.value))
</script>

<style scoped>
.card {
  background: linear-gradient(135deg, var(--wn-accent) 0%, color-mix(in srgb, var(--wn-accent) 85%, #000) 100%);
  color: #fff;
  border-radius: 16px;
  padding: 16px 18px;
  cursor: pointer;
  transition: transform 0.15s ease;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--wn-accent) 28%, transparent);
}

.card:active {
  transform: scale(0.99);
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #fff;
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.duration {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  opacity: 0.95;
}

.amount {
  font-size: 30px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.amount-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.85;
  margin-top: 2px;
  margin-bottom: 14px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 8px;
}

.cell {
  background-color: rgba(255, 255, 255, 0.13);
  border-radius: 10px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: center;
}

.cell-value {
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.cell-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  opacity: 0.85;
}
</style>