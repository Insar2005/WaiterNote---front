<template>
  <transition name="fade">
    <div class="overlay" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-header">
          <h3 class="sheet-title">
            {{ isEdit ? 'Редактировать заведение' : 'Новое заведение' }}
          </h3>
          <button class="close-btn" @click="$emit('close')" aria-label="Закрыть">×</button>
        </header>

        <form class="form" @submit.prevent="onSubmit">
          <label class="field">
            <span class="field-label">Название</span>
            <input
              v-model.trim="form.title"
              type="text"
              class="field-input"
              placeholder="Например: Кофейня на углу"
              maxlength="255"
              required
            />
          </label>

          <div class="row">
            <label class="field field--half">
              <span class="field-label">Валюта</span>
              <select v-model="form.currency" class="field-input">
                <option value="RUB">RUB</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="KZT">KZT</option>
                <option value="KGS">KGS</option>
                <option value="UAH">UAH</option>
              </select>
            </label>
          </div>

          <label class="field">
            <span class="field-label">Часовой пояс</span>
            <select v-model="form.timezone" class="field-input">
              <option
                v-for="tz in TIMEZONES"
                :key="tz.id"
                :value="tz.id"
              >
                {{ formatTimezoneOption(tz) }}
              </option>
            </select>
          </label>

          <fieldset class="fieldset">
            <legend class="fieldset-legend">Тип оплаты смены</legend>
            <div class="radio-row">
              <label class="radio">
                <input
                  v-model="form.shift_type_default"
                  type="radio"
                  value="fixed"
                />
                <span>Фикс. ставка</span>
              </label>
              <label class="radio">
                <input
                  v-model="form.shift_type_default"
                  type="radio"
                  value="percent"
                />
                <span>Процент с продаж</span>
              </label>
            </div>
          </fieldset>

          <label v-if="form.shift_type_default === 'fixed'" class="field">
            <span class="field-label">Оплата за смену</span>
            <input
              v-model.number="form.pay_for_shift_default"
              type="number"
              min="0"
              step="100"
              placeholder="0"
              class="field-input"
            />
          </label>

          <label v-else class="field">
            <span class="field-label">Процент с продаж (0–100)</span>
            <input
              v-model.number="form.service_percent_default"
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="0"
              class="field-input"
            />
          </label>

          <div class="actions">
            <button
              v-if="isEdit && workplace.isCurrentOwner"
              type="button"
              class="btn btn--danger-ghost"
              @click="onDelete"
            >
              Удалить
            </button>
            <div class="actions-spacer" />
            <button type="button" class="btn btn--ghost" @click="$emit('close')">
              Отмена
            </button>
            <button type="submit" class="btn btn--primary" :disabled="saving">
              {{ saving ? 'Сохранение…' : 'Сохранить' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useWorkplaceStore } from '@/stores/workplace'
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'
import { TIMEZONES, formatTimezoneOption } from '@/utils/timezones'

const props = defineProps({
  initial: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const workplace = useWorkplaceStore()
const ui = useUiStore()

const isEdit = computed(() => !!props.initial)
const saving = ref(false)

/**
 * Pick the most plausible timezone from our list for a brand-new workplace.
 * Uses the browser's resolved IANA id if it's in our curated list; otherwise
 * matches by current UTC offset; otherwise falls back to Europe/Moscow.
 */
function detectInitialTimezone() {
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (browserTz && TIMEZONES.some((t) => t.id === browserTz)) {
      return browserTz
    }
    // Match by offset (in minutes — note: getTimezoneOffset returns inverted sign)
    const browserOffset = -new Date().getTimezoneOffset()
    const match = TIMEZONES.find((t) => t.offsetMin === browserOffset)
    if (match) return match.id
  } catch (_) { /* fallthrough */ }
  return 'Europe/Moscow'
}

const form = reactive({
  title: props.initial?.title || '',
  timezone: props.initial?.timezone || detectInitialTimezone(),
  currency: props.initial?.currency || 'RUB',
  service_percent_default: props.initial?.service_percent_default ?? 0,
  shift_type_default: props.initial?.shift_type_default || 'fixed',
  pay_for_shift_default: props.initial?.pay_for_shift_default ?? 0,
})

async function onSubmit() {
  if (saving.value) return
  saving.value = true
  try {
    if (isEdit.value) {
      await workplace.update(props.initial.id, { ...form })
      ui.toastSuccess('Изменения сохранены')
    } else {
      await workplace.create({ id: newId(), ...form })
      ui.toastSuccess('Заведение создано')
    }
    emit('saved')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  const ok = await ui.confirm({
    title: 'Удалить заведение?',
    message: 'Все залы, столы, меню, смены и заказы будут удалены безвозвратно.',
    confirmText: 'Удалить',
    cancelText: 'Отмена',
    danger: true,
  })
  if (!ok) return

  saving.value = true
  try {
    await workplace.remove(props.initial.id)
    ui.toastSuccess('Удалено')
    emit('saved')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 250;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  background-color: #fff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
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
  font-size: 17px;
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

.form {
  padding: 16px 20px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field--half {
  flex: 1;
}

.row {
  display: flex;
  gap: 12px;
}

.field-label {
  font-size: 12px;
  font-weight: 500;
  color: #666;
}

.field-input {
  font-size: 15px;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background-color: #fafafa;
  outline: none;
  transition: border-color 0.15s ease;
}

.field-input:focus {
  border-color: #4caf50;
  background-color: #fff;
}

.fieldset {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fieldset-legend {
  font-size: 12px;
  font-weight: 500;
  color: #666;
  padding: 0;
}

.radio-row {
  display: flex;
  gap: 12px;
}

.radio {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 10px;
  cursor: pointer;
  background-color: #fafafa;
  font-size: 14px;
}

.radio input {
  accent-color: #4caf50;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}

.actions-spacer {
  flex: 1;
}

.btn {
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn:active {
  opacity: 0.8;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--ghost {
  background-color: transparent;
  color: #666;
}

.btn--primary {
  background-color: #4caf50;
  color: #fff;
}

.btn--danger-ghost {
  background-color: transparent;
  color: #c62828;
  padding: 10px 0;
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