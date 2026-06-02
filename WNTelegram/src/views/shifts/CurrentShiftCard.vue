<template>
  <div class="card">
    <div class="card-top">
      <div class="status-dot" />
      <span class="status-text">Смена идёт</span>
      <button class="close-btn" @click="$emit('close-shift')" :disabled="closing">
        Закрыть
      </button>
    </div>

    <div class="duration">{{ durationText }}</div>
    <div class="started-at">
      Начало в {{ formatTime(shift.start_time, shift.currency === 'RUB' ? 'Europe/Moscow' : undefined) }}
    </div>

    <div class="stats">
      <div class="stat">
        <span class="stat-label">Заработано</span>
        <span class="stat-value stat-value--accent">
          {{ formatMoney(shift.total_pay_for_shift, shift.currency) }}
        </span>
        <span v-if="shift.shift_type === 'percent'" class="stat-sub">
          {{ shift.service_percent }}% от кассы
        </span>
        <span v-else class="stat-sub">фикс. ставка</span>
      </div>

      <div class="stat">
        <span class="stat-label">Чаевые</span>
        <span class="stat-value">
          {{ formatMoney(shift.total_tips, shift.currency) }}
        </span>
      </div>

      <div class="stat">
        <span class="stat-label">Касса</span>
        <span class="stat-value">
          {{ formatMoney(shift.total_cash_register, shift.currency) }}
        </span>
      </div>

      <div class="stat">
        <span class="stat-label">Заказов</span>
        <span class="stat-value">{{ shift.order_count }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { formatMoney, formatTime, formatDuration } from '@/utils/format'
import { useLiveDuration } from '@/composables/useLiveDuration'

const props = defineProps({
  shift: { type: Object, required: true },
  closing: { type: Boolean, default: false },
})
defineEmits(['close-shift'])

const liveDuration = useLiveDuration(() => props.shift?.start_time)
const durationText = computed(() => formatDuration(liveDuration.value))
</script>

<style scoped>
.card {
  background: linear-gradient(135deg, var(--wn-accent) 0%, color-mix(in srgb, var(--wn-accent) 85%, #000) 100%);
  color: #fff;
  border-radius: 16px;
  padding: 18px 18px 16px 18px;
  box-shadow: 0 4px 14px color-mix(in srgb, var(--wn-accent) 30%, transparent);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  background-color: #fff;
  border-radius: 50%;
  animation: pulse 1.6s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}

.status-text {
  font-size: 13px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.close-btn {
  background-color: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.close-btn:not(:disabled):active {
  background-color: rgba(255, 255, 255, 0.3);
}

.close-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.duration {
  font-size: 36px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: -1px;
  margin-top: 4px;
}

.started-at {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 16px;
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat {
  background-color: rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  opacity: 0.8;
}

.stat-value {
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-value--accent {
  font-size: 19px;
}

.stat-sub {
  font-size: 11px;
  opacity: 0.75;
}
</style>