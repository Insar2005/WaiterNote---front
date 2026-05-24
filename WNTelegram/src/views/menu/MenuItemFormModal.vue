<template>
  <transition name="fade">
    <div class="overlay" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-header">
          <h3 class="sheet-title">
            {{ isEdit ? 'Редактировать позицию' : 'Новая позиция' }}
          </h3>
          <button class="close-btn" @click="$emit('close')" aria-label="Закрыть">×</button>
        </header>

        <form class="form" @submit.prevent="onSubmit">
          <label class="field">
            <span class="field-label">Название</span>
            <input
              ref="titleInput"
              v-model.trim="form.title"
              type="text"
              class="field-input"
              placeholder="Например: Капучино"
              maxlength="150"
              required
            />
          </label>

          <div class="row">
            <label class="field field--price">
              <span class="field-label">Цена</span>
              <input
                v-model.number="form.price"
                type="number"
                min="0"
                step="0.01"
                class="field-input"
                required
              />
            </label>

            <label class="field field--portion">
              <span class="field-label">Порция</span>
              <input
                v-model.trim="form.portion"
                type="text"
                class="field-input"
                placeholder="200 мл"
                maxlength="50"
              />
            </label>
          </div>

          <label class="field">
            <span class="field-label">Описание (необязательно)</span>
            <textarea
              v-model.trim="form.description"
              class="field-input field-textarea"
              rows="3"
              maxlength="2000"
              placeholder="Состав, ингредиенты, особенности"
            />
          </label>

          <label class="field">
            <span class="field-label">Категория</span>
            <select v-model="form.category_id" class="field-input">
              <option
                v-for="cat in menu.allCategories"
                :key="cat.id"
                :value="cat.id"
              >
                {{ cat.title }}
              </option>
            </select>
          </label>

          <label v-if="isEdit" class="checkbox">
            <input v-model="form.is_active" type="checkbox" />
            <span>Позиция активна (видна в меню заказа)</span>
          </label>

          <div class="actions">
            <button
              v-if="isEdit"
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
              {{ saving ? '…' : 'Сохранить' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { useMenuStore } from '@/stores/menu'
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'

const props = defineProps({
  initial: { type: Object, default: null },
  /** Required when creating: which category the item is created in. */
  defaultCategoryId: { type: String, default: null },
})
const emit = defineEmits(['close', 'saved'])

const menu = useMenuStore()
const ui = useUiStore()

const isEdit = computed(() => !!props.initial)
const saving = ref(false)
const titleInput = ref(null)

const form = reactive({
  title: props.initial?.title || '',
  price: props.initial?.price ?? 0,
  portion: props.initial?.portion || '',
  description: props.initial?.description || '',
  is_active: props.initial?.is_active ?? true,
  category_id: props.initial?.category_id || props.defaultCategoryId || '',
})

onMounted(async () => {
  await nextTick()
  titleInput.value?.focus()
})

async function onSubmit() {
  if (saving.value) return
  if (!form.category_id) {
    ui.toastError('Выберите категорию')
    return
  }
  saving.value = true
  try {
    const body = {
      title: form.title,
      price: Number(form.price) || 0,
      portion: form.portion || null,
      description: form.description || null,
    }
    if (isEdit.value) {
      const patch = { ...body, is_active: form.is_active }
      // category change is allowed by API; include only if differs
      if (form.category_id !== props.initial.category_id) {
        patch.category_id = form.category_id
      }
      await menu.updateItem(props.initial.id, patch)
      ui.toastSuccess('Позиция обновлена')
    } else {
      await menu.createItem(form.category_id, { id: newId(), ...body })
      ui.toastSuccess('Позиция добавлена')
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
    title: 'Удалить позицию?',
    message: 'Действие нельзя отменить.',
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return

  saving.value = true
  try {
    await menu.removeItem(props.initial.id)
    ui.toastSuccess('Позиция удалена')
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

.row {
  display: flex;
  gap: 12px;
}

.field--price {
  flex: 1;
}

.field--portion {
  flex: 1;
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
  font-family: inherit;
}

.field-input:focus {
  border-color: #4caf50;
  background-color: #fff;
}

.field-textarea {
  resize: vertical;
  min-height: 80px;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: #333;
  cursor: pointer;
}

.checkbox input {
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