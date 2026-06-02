<template>
  <div class="block">
    <div class="content">
      <h3 class="block-title">Смена не открыта</h3>
      <p class="block-text">
        Откройте смену, чтобы принимать заказы.<br />
        Все настройки заведения будут зафиксированы в момент открытия.
      </p>
      <div v-if="workplace.current" class="snapshot">
        <div class="snapshot-row">
          <span class="snapshot-label">Тип оплаты</span>
          <span class="snapshot-value">
            {{ workplace.shiftTypeDefault === 'percent' ? 'Процент' : 'Фикс' }}
          </span>
        </div>
        <div v-if="workplace.shiftTypeDefault === 'percent'" class="snapshot-row">
          <span class="snapshot-label">Процент</span>
          <span class="snapshot-value">{{ workplace.serviceDefault }}%</span>
        </div>
        <div v-else class="snapshot-row">
          <span class="snapshot-label">Ставка</span>
          <span class="snapshot-value">
            {{ formatMoney(workplace.payDefault, workplace.currency) }}
          </span>
        </div>
      </div>
      <button class="btn-open" :disabled="opening" @click="$emit('open-shift')">
        {{ opening ? 'Открываем…' : '▶ Открыть смену' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { useWorkplaceStore } from '@/stores/workplace'
import { formatMoney } from '@/utils/format'

defineProps({
  opening: { type: Boolean, default: false },
})
defineEmits(['open-shift'])

const workplace = useWorkplaceStore()
</script>

<style scoped>
.block {
  background-color: var(--wn-bg-elevated);
  border-radius: 16px;
  padding: 24px 20px;
  text-align: center;
}

.content {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.block-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--wn-ink);
}

.block-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--wn-ink-soft);
}

.snapshot {
  background-color: var(--wn-bg);
  border-radius: 10px;
  padding: 10px 14px;
  margin: 4px 0 8px 0;
}

.snapshot-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 3px 0;
}

.snapshot-label {
  color: var(--wn-ink-mute);
}

.snapshot-value {
  color: var(--wn-ink);
  font-weight: 500;
}

.btn-open {
  background-color: var(--wn-accent);
  color: #fff;
  border: none;
  padding: 14px 24px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn-open:not(:disabled):active {
  opacity: 0.85;
}

.btn-open:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>