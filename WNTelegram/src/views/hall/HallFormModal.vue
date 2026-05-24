<template>
  <transition name="fade">
    <div class="overlay" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-header">
          <h3 class="sheet-title">
            {{ isEdit ? 'Настройки зала' : 'Новый зал' }}
          </h3>
          <button class="close-btn" @click="$emit('close')">×</button>
        </header>

        <form class="form" @submit.prevent="onSubmit">
          <label class="field">
            <span class="field-label">Название</span>
            <input
              ref="nameInput"
              v-model.trim="form.name"
              type="text"
              class="field-input"
              placeholder="Например: Основной зал"
              maxlength="100"
              required
            />
          </label>

          <div class="row">
            <label class="field field--half">
              <span class="field-label">Ширина (px)</span>
              <input
                v-model.number="form.width"
                type="number"
                min="100"
                max="10000"
                step="50"
                class="field-input"
                required
              />
            </label>
            <label class="field field--half">
              <span class="field-label">Высота (px)</span>
              <input
                v-model.number="form.height"
                type="number"
                min="100"
                max="10000"
                step="50"
                class="field-input"
                required
              />
            </label>
          </div>
          <p class="field-hint">
            Размер задаёт «холст», на котором будут расставлены столы.
            Шаг сетки — 10px (~ 1 см).
          </p>

          <div class="actions">
            <button
              v-if="isEdit"
              type="button"
              class="btn btn--ghost-danger"
              @click="onDelete"
              :disabled="busy"
            >
              Удалить зал
            </button>
            <div class="actions-spacer" />
            <button type="button" class="btn btn--ghost" @click="$emit('close')">
              Отмена
            </button>
            <button type="submit" class="btn btn--primary" :disabled="busy">
              {{ busy ? '…' : 'Сохранить' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useHallStore } from '@/stores/hall'
import { useWorkplaceStore } from '@/stores/workplace'
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'

const props = defineProps({
  initial: { type: Object, default: null },
})
const emit = defineEmits(['close', 'saved'])

const hall = useHallStore()
const workplace = useWorkplaceStore()
const ui = useUiStore()

const isEdit = computed(() => !!props.initial)
const busy = ref(false)
const nameInput = ref(null)

const form = reactive({
  name: props.initial?.name || '',
  width: props.initial?.width || 1000,
  height: props.initial?.height || 1000,
})

onMounted(async () => {
  await nextTick()
  nameInput.value?.focus()
})

async function onSubmit() {
  if (busy.value) return
  busy.value = true
  try {
    if (isEdit.value) {
      await hall.updateHall(props.initial.id, {
        name: form.name,
        width: form.width,
        height: form.height,
      })
      ui.toastSuccess('Сохранено')
    } else {
      if (!workplace.currentId) {
        ui.toastError('Нет выбранного заведения')
        return
      }
      await hall.createHall(workplace.currentId, {
        id: newId(),
        name: form.name,
        width: form.width,
        height: form.height,
        scale: 1.0,
      })
      ui.toastSuccess('Зал создан')
    }
    emit('saved')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

async function onDelete() {
  const tableCount = hall.tablesOfHall(props.initial.id).length
  const message = tableCount
    ? `В зале ${tableCount} столов — они тоже будут удалены.`
    : 'Зал пустой.'
  const ok = await ui.confirm({
    title: 'Удалить зал?',
    message,
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return

  busy.value = true
  try {
    await hall.removeHall(props.initial.id)
    ui.toastSuccess('Зал удалён')
    emit('saved')
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
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.field-input:focus {
  border-color: #4caf50;
  background-color: #fff;
}

.field-hint {
  margin: -4px 0 0 0;
  font-size: 12px;
  color: #888;
  line-height: 1.45;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  align-items: center;
}

.actions-spacer {
  flex: 1;
}

.btn {
  padding: 10px 14px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
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

.btn--ghost-danger {
  background-color: transparent;
  color: #c62828;
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