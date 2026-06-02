<template>
  <transition name="fade">
    <div class="overlay" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-header">
          <h3 class="sheet-title">Смена · {{ formatDate(shift.start_time) }}</h3>
          <button class="close-btn" @click="$emit('close')" aria-label="Закрыть">×</button>
        </header>

        <div class="content">
          <div class="block">
            <span class="block-label">Заведение</span>
            <span class="block-value">{{ shift.place_work_title }}</span>
          </div>

          <div class="row-2">
            <div class="block">
              <span class="block-label">Начало</span>
              <span class="block-value">{{ formatTime(shift.start_time) }}</span>
            </div>
            <div class="block">
              <span class="block-label">Конец</span>
              <span class="block-value">
                {{ shift.end_time ? formatTime(shift.end_time) : '—' }}
              </span>
            </div>
          </div>

          <div class="block">
            <span class="block-label">Длительность</span>
            <span class="block-value">{{ formatDuration(shift.duration) }}</span>
          </div>

          <hr class="sep" />

          <div class="block highlight">
            <span class="block-label">Заработано</span>
            <span class="block-value block-value--big">
              {{ formatMoney(shift.total_pay_for_shift, shift.currency) }}
            </span>
            <span class="block-sub">
              {{ shift.shift_type === 'percent'
                ? `${shift.service_percent}% от кассы`
                : 'фиксированная ставка' }}
            </span>
          </div>

          <div class="row-2">
            <div class="block">
              <span class="block-label">Чаевые</span>
              <span class="block-value">{{ formatMoney(shift.total_tips, shift.currency) }}</span>
            </div>
            <div class="block">
              <span class="block-label">Касса</span>
              <span class="block-value">{{ formatMoney(shift.total_cash_register, shift.currency) }}</span>
            </div>
          </div>

          <div class="block">
            <span class="block-label">Заказов</span>
            <span class="block-value">{{ shift.order_count }}</span>
          </div>

          <div v-if="shift.is_closed" class="actions">
            <button class="btn btn--ghost-danger" @click="onDelete" :disabled="busy">
              Удалить смену
            </button>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref } from 'vue'
import { formatDate, formatTime, formatDuration, formatMoney } from '@/utils/format'
import { useShiftStore } from '@/stores/shift'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  shift: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const shiftStore = useShiftStore()
const ui = useUiStore()
const busy = ref(false)

async function onDelete() {
  const ok = await ui.confirm({
    title: 'Удалить смену?',
    message: 'Все заказы и позиции этой смены будут удалены безвозвратно.',
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return

  busy.value = true
  try {
    await shiftStore.remove(props.shift.id)
    ui.toastSuccess('Смена удалена')
    emit('close')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 250;
}

.sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  background-color: #fff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
  /* Pin to viewport bottom — prevents iOS from shifting the modal sideways
     when the on-screen keyboard appears (a well-known bug with flex-end
     centring of fixed elements). Bounded on all sides → nothing to slide. */
}

.sheet-header {
  position: sticky;
  top: 0;
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px 20px;
  border-bottom: 1px solid #eee;
  z-index: 1;
}

.sheet-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: #888;
  cursor: pointer;
  padding: 4px 8px;
}

.content {
  padding: 16px 20px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.block.highlight {
  background-color: #e8f5e9;
  padding: 12px 14px;
  border-radius: 12px;
  margin: 4px 0;
}

.row-2 {
  display: flex;
  gap: 12px;
}

.row-2 .block {
  flex: 1;
}

.block-label {
  font-size: 12px;
  font-weight: 500;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.block-value {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
}

.block-value--big {
  font-size: 24px;
  color: #2e7d32;
}

.block-sub {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

.sep {
  border: none;
  height: 1px;
  background-color: #eee;
  margin: 4px 0;
}

.actions {
  margin-top: 12px;
}

.btn {
  width: 100%;
  padding: 11px 16px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.btn:active {
  opacity: 0.8;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--ghost-danger {
  background-color: transparent;
  color: #c62828;
  border: 1px solid #ffcdd2;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active .sheet,
.fade-leave-active .sheet {
  transition: transform 0.22s ease;
}
.fade-enter-from .sheet,
.fade-leave-to .sheet {
  transform: translateY(100%);
}
</style>