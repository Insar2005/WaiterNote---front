<template>
  <transition name="fade">
    <div class="overlay" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-header">
          <h3 class="sheet-title">
            {{ isEdit ? 'Редактировать заметку' : 'Новая заметка' }}
          </h3>
          <button
            v-if="isEdit"
            class="pin-btn"
            :class="{ 'pin-btn--active': form.pinned }"
            @click="form.pinned = !form.pinned"
            :title="form.pinned ? 'Открепить' : 'Закрепить'"
          >
            📌
          </button>
          <button class="close-btn" @click="$emit('close')" aria-label="Закрыть">×</button>
        </header>

        <form class="form" @submit.prevent="onSubmit">
          <input
            ref="titleInput"
            v-model.trim="form.header"
            type="text"
            class="title-input"
            placeholder="Заголовок"
            maxlength="255"
            required
          />

          <textarea
            v-model="form.content"
            class="content-input"
            placeholder="Текст заметки…"
            rows="8"
            maxlength="20000"
          />

          <!-- Scope selector — only when creating, not when editing -->
          <fieldset v-if="!isEdit" class="scope-field">
            <legend class="scope-label">Привязать к</legend>
            <div class="scope-options">
              <label class="scope-option">
                <input v-model="form.scope" type="radio" value="global" />
                <span>Личное</span>
              </label>
              <label
                class="scope-option"
                :class="{ 'scope-option--disabled': !workplace.currentId }"
              >
                <input
                  v-model="form.scope"
                  type="radio"
                  value="workplace"
                  :disabled="!workplace.currentId"
                />
                <span>
                  Заведение
                  <small v-if="workplace.current">({{ workplace.current.title }})</small>
                </span>
              </label>
              <label
                class="scope-option"
                :class="{ 'scope-option--disabled': !shift.current }"
              >
                <input
                  v-model="form.scope"
                  type="radio"
                  value="shift"
                  :disabled="!shift.current"
                />
                <span>
                  Текущая смена
                  <small v-if="!shift.current">(нет открытой)</small>
                </span>
              </label>
            </div>
          </fieldset>

          <!-- For existing notes show scope as read-only badge -->
          <div v-else class="scope-readonly">
            <span class="scope-badge" :class="`scope-badge--${initial.scope}`">
              {{ scopeLabel }}
            </span>
            <small class="scope-hint">
              Привязку нельзя изменить — создайте новую заметку при необходимости
            </small>
          </div>

          <div class="actions">
            <button
              v-if="isEdit"
              type="button"
              class="btn btn--ghost-danger"
              @click="onDelete"
              :disabled="busy"
            >
              Удалить
            </button>
            <button
              v-if="isEdit"
              type="button"
              class="btn btn--ghost"
              @click="onArchive"
              :disabled="busy"
            >
              {{ form.is_archived ? 'Из архива' : 'В архив' }}
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
import { useNotesStore } from '@/stores/notes'
import { useWorkplaceStore } from '@/stores/workplace'
import { useShiftStore } from '@/stores/shift'
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'

const props = defineProps({
  initial: { type: Object, default: null },
  /** Pre-select scope when creating from a context (e.g. from current shift). */
  defaultScope: { type: String, default: 'global' },
})
const emit = defineEmits(['close', 'saved'])

const notes = useNotesStore()
const workplace = useWorkplaceStore()
const shift = useShiftStore()
const ui = useUiStore()

const isEdit = computed(() => !!props.initial)
const busy = ref(false)
const titleInput = ref(null)

const form = reactive({
  header: props.initial?.header || '',
  content: props.initial?.content || '',
  pinned: props.initial?.pinned ?? false,
  is_archived: props.initial?.is_archived ?? false,
  scope: props.initial?.scope || props.defaultScope || 'global',
})

const scopeLabel = computed(() => {
  switch (props.initial?.scope) {
    case 'shift': return 'Привязана к смене'
    case 'workplace': return `Привязана к: ${workplaceTitleFor(props.initial?.workplace_id)}`
    case 'global': return 'Личная заметка'
    default: return ''
  }
})

function workplaceTitleFor(id) {
  return workplace.items.find((w) => w.id === id)?.title || 'заведению'
}

onMounted(async () => {
  await nextTick()
  titleInput.value?.focus()
})

async function onSubmit() {
  if (busy.value) return
  busy.value = true
  try {
    if (isEdit.value) {
      await notes.update(props.initial.id, {
        header: form.header,
        content: form.content || null,
        pinned: form.pinned,
      })
      ui.toastSuccess('Сохранено')
    } else {
      // Build body based on scope
      const body = {
        id: newId(),
        scope: form.scope,
        header: form.header,
        content: form.content || null,
        pinned: form.pinned,
      }
      if (form.scope === 'workplace') {
        if (!workplace.currentId) {
          ui.toastError('Нет текущего заведения')
          return
        }
        body.workplace_id = workplace.currentId
      } else if (form.scope === 'shift') {
        if (!shift.current) {
          ui.toastError('Нет открытой смены')
          return
        }
        body.shift_id = shift.current.id
        // For shift-scoped notes, also attach the workplace for easier filtering.
        body.workplace_id = shift.current.workplace_id
      }
      await notes.create(body)
      ui.toastSuccess('Заметка создана')
    }
    emit('saved')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

async function onArchive() {
  if (!props.initial) return
  busy.value = true
  try {
    await notes.toggleArchive(props.initial.id)
    ui.toastSuccess(form.is_archived ? 'Восстановлено' : 'В архиве')
    emit('saved')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

async function onDelete() {
  const ok = await ui.confirm({
    title: 'Удалить заметку?',
    message: 'Действие нельзя отменить.',
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await notes.remove(props.initial.id)
    ui.toastSuccess('Удалено')
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
  background-color: var(--wn-bg-elevated);
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 92vh;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet-header {
  position: sticky;
  top: 0;
  background-color: var(--wn-bg-elevated);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px 12px 20px;
  border-bottom: 1px solid var(--wn-glass-border-subtle);
  z-index: 1;
}

.sheet-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  flex: 1;
}

.pin-btn {
  background: none;
  border: none;
  font-size: 16px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  opacity: 0.4;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}

.pin-btn--active {
  opacity: 1;
  background-color: color-mix(in srgb, var(--wn-warn) 18%, var(--wn-bg-elevated));
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: var(--wn-ink-mute);
  cursor: pointer;
  padding: 4px 8px;
}

.form {
  padding: 14px 20px 24px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.title-input {
  font-size: 17px;
  font-weight: 600;
  padding: 10px 12px;
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 10px;
  background-color: var(--wn-bg-recessed);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.title-input:focus {
  border-color: var(--wn-accent-text);
  background-color: var(--wn-bg-elevated);
}

.content-input {
  font-size: 14px;
  line-height: 1.5;
  padding: 10px 12px;
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 10px;
  background-color: var(--wn-bg-recessed);
  outline: none;
  font-family: inherit;
  resize: vertical;
  min-height: 140px;
  transition: border-color 0.15s ease;
}

.content-input:focus {
  border-color: var(--wn-accent-text);
  background-color: var(--wn-bg-elevated);
}

.scope-field {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scope-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--wn-ink-soft);
  padding: 0;
}

.scope-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.scope-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 10px;
  cursor: pointer;
  background-color: var(--wn-bg-recessed);
  font-size: 14px;
  color: var(--wn-ink);
}

.scope-option--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scope-option input {
  accent-color: var(--wn-accent-text);
}

.scope-option small {
  color: var(--wn-ink-mute);
  font-size: 12px;
}

.scope-readonly {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background-color: var(--wn-bg-recessed);
  border-radius: 10px;
}

.scope-badge {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.scope-badge--global {
  background-color: color-mix(in srgb, var(--wn-info) 16%, var(--wn-bg-elevated));
  color: color-mix(in srgb, var(--wn-info) 72%, var(--wn-ink));
}

.scope-badge--workplace {
  background-color: var(--wn-accent-fill);
  color: var(--wn-accent-text);
}

.scope-badge--shift {
  background-color: color-mix(in srgb, var(--wn-warn) 16%, var(--wn-bg-elevated));
  color: color-mix(in srgb, var(--wn-warn) 72%, var(--wn-ink));
}

.scope-hint {
  font-size: 11px;
  color: var(--wn-ink-mute);
  line-height: 1.4;
}

.actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.actions-spacer {
  flex: 1;
}

.btn {
  padding: 10px 14px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
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
  color: var(--wn-ink-soft);
}

.btn--primary {
  background-color: var(--wn-accent);
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