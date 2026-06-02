<template>
  <BottomSheet
    :visible="visible"
    :snap-points="[280, 0.55]"
    @close="$emit('close')"
  >
    <template #header>
      <div class="header">
        <h2 class="title">Шаблоны расстановки</h2>
        <button class="close-btn" @click="$emit('close')" aria-label="Закрыть">×</button>
      </div>
    </template>

    <div class="body">
      <!-- Save-current as new layout -->
      <button
        class="action-btn action-btn--save"
        :disabled="busy"
        @click="onSaveCurrent"
      >
        💾 Сохранить текущую расстановку
      </button>

      <p v-if="hall.layouts.length === 0" class="empty">
        Сохранённых шаблонов нет. Расставьте столы как нужно
        и сохраните — потом можно будет вернуть в один тап.
      </p>

      <ul v-else class="layout-list">
        <li v-for="l in hall.layouts" :key="l.id" class="layout-item">
          <div class="layout-info">
            <div class="layout-name">{{ l.name }}</div>
            <div class="layout-meta">
              {{ l.positions?.length || 0 }} {{ pluralize(l.positions?.length || 0, ['стол', 'стола', 'столов']) }}
              · сохранён {{ formatDate(l.created_at) }}
            </div>
          </div>
          <div class="layout-actions">
            <button
              class="apply-btn"
              :disabled="busy"
              @click="onApply(l)"
            >
              Применить
            </button>
            <button
              class="icon-btn"
              :disabled="busy"
              aria-label="Переименовать"
              @click="onRename(l)"
            >
              ✏️
            </button>
            <button
              class="icon-btn icon-btn--danger"
              :disabled="busy"
              aria-label="Удалить"
              @click="onDelete(l)"
            >
              🗑
            </button>
          </div>
        </li>
      </ul>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref } from 'vue'
import { useHallStore } from '@/stores/hall'
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'
import BottomSheet from '@/components/BottomSheet.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'applied'])

const hall = useHallStore()
const ui = useUiStore()

const busy = ref(false)

/**
 * Save the hall's current arrangement as a new template. Asks the user
 * for a name via the central PromptModal (which sits above the keyboard).
 */
async function onSaveCurrent() {
  if (!hall.activeHallId) return
  const name = await ui.prompt({
    title: 'Название шаблона',
    placeholder: 'Например: Стандарт, Банкет, Вечер',
    confirmText: 'Сохранить',
    required: true,
    maxLength: 60,
  })
  if (!name) return
  busy.value = true
  try {
    await hall.createLayout(hall.activeHallId, { id: newId(), name: name.trim() })
    ui.toastSuccess(`Шаблон «${name.trim()}» сохранён`)
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

/**
 * Apply a template. Two-step flow when there are tables in the hall whose
 * numbers AREN'T in the template ("extras"):
 *   1. Ask the user: keep them or delete them?
 *   2. Call applyLayout with the chosen flag.
 * The server enforces a safety rule — extras with active orders are kept
 * regardless and reported back so we can surface a warning toast.
 */
async function onApply(layout) {
  // Find numbers in the layout
  const layoutNumbers = new Set((layout.positions || []).map((p) => p.table_number))
  // Find numbers currently in the hall but NOT in the layout
  const currentExtras = hall
    .tablesOfHall(hall.activeHallId)
    .filter((t) => !layoutNumbers.has(t.number))

  let deleteExtras = false
  if (currentExtras.length > 0) {
    const ok = await ui.confirm({
      title: `В зале есть «лишние» столы (${currentExtras.length})`,
      message:
        `Столы ${currentExtras.map((t) => '№' + t.number).join(', ')} не входят в шаблон. ` +
        'Удалить их? Столы с активными заказами не будут удалены.',
      confirmText: 'Удалить',
      cancelText: 'Оставить',
      danger: true,
    })
    deleteExtras = !!ok
  }

  busy.value = true
  try {
    const result = await hall.applyLayout(layout.id, {
      delete_extras: deleteExtras,
      // We pre-generate ids on the client for any new tables — see the
      // mock's `new_table_ids` param; the live backend will use the same
      // contract once it's deployed.
      new_table_ids: Object.fromEntries(
        (layout.positions || [])
          .filter((p) => !hall.tablesOfHall(hall.activeHallId).some((t) => t.number === p.table_number))
          .map((p) => [p.table_number, newId()]),
      ),
    })
    // Surface what happened: number changed/created/kept
    const msgs = []
    if (result.created.length > 0) msgs.push(`+${result.created.length} новых`)
    if (result.moved.length > 0) msgs.push(`${result.moved.length} переставлены`)
    if (result.deleted_extras.length > 0) msgs.push(`-${result.deleted_extras.length} удалены`)
    if (result.kept_extras.length > 0) {
      const blockedNums = result.kept_extras
        .map((e) => `№${e.number}`)
        .join(', ')
      ui.toastWarning(
        `Шаблон применён, но столы ${blockedNums} не удалены — на них активные заказы`,
      )
    } else {
      ui.toastSuccess(`Шаблон «${layout.name}» применён · ${msgs.join(', ') || 'без изменений'}`)
    }
    // Let the parent pulse the changed tables.
    emit('applied', { layoutId: layout.id, ...result })
    emit('close')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

async function onRename(layout) {
  const name = await ui.prompt({
    title: 'Новое название',
    initial: layout.name,
    confirmText: 'Сохранить',
    required: true,
    maxLength: 60,
  })
  if (!name || name.trim() === layout.name) return
  busy.value = true
  try {
    await hall.renameLayout(layout.id, name.trim())
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

async function onDelete(layout) {
  const ok = await ui.confirm({
    title: `Удалить шаблон «${layout.name}»?`,
    message: 'Расстановка столов в зале не изменится.',
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await hall.removeLayout(layout.id)
    ui.toastSuccess('Шаблон удалён')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

function pluralize(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

function formatDate(ts) {
  if (!ts) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(ts * 1000))
}
</script>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--wn-ink);
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  line-height: 1;
  color: var(--wn-ink-mute);
  cursor: pointer;
  padding: 4px 8px;
}

.body {
  padding: 12px 4px 24px 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-btn {
  width: 100%;
  padding: 12px 16px;
  border: 1px dashed var(--wn-accent, #4caf50);
  border-radius: 12px;
  background-color: #f5fcf6;
  color: var(--wn-mint-ink, #2e7d32);
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: background-color 0.15s ease;
}

.action-btn:active {
  background-color: var(--wn-accent-fill);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty {
  margin: 8px 4px;
  padding: 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--wn-ink-mute);
  background-color: var(--wn-bg-recessed);
  border-radius: 10px;
  text-align: center;
}

.layout-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.layout-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 12px;
}

.layout-info {
  flex: 1;
  min-width: 0;
}

.layout-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--wn-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.layout-meta {
  font-size: 12px;
  color: var(--wn-ink-mute);
  margin-top: 2px;
}

.layout-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.apply-btn {
  background-color: var(--wn-accent, #4caf50);
  color: #fff;
  border: none;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.apply-btn:active {
  background-color: #3d8b40;
}

.apply-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-btn {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background-color: var(--wn-bg);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.icon-btn:active {
  background-color: var(--wn-bg-recessed);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>