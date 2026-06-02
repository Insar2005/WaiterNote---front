<template>
  <div class="page">
    <!-- Top bar -->
    <header class="topbar">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">Карта столов</h1>
      <div class="topbar-actions">
        <button
          class="icon-btn"
          @click="goToImport"
          title="Импортировать"
          aria-label="Импортировать"
        >
          ⤓
        </button>
        <button
          class="icon-btn"
          :disabled="!undoStack.canUndo.value"
          @click="onUndo"
          title="Отменить (Ctrl+Z)"
        >
          ↶
        </button>
        <button
          class="icon-btn"
          :disabled="!undoStack.canRedo.value"
          @click="onRedo"
          title="Повторить (Ctrl+Shift+Z)"
        >
          ↷
        </button>
      </div>
    </header>

    <!-- No workplace -->
    <div v-if="!workplace.currentId" class="empty-screen">
      <p>Выберите заведение в Профиле</p>
    </div>

    <template v-else>
      <!-- Hall switcher / create -->
      <div class="halls-bar">
        <div class="halls-tabs">
          <button
            v-for="h in hall.sortedHalls"
            :key="h.id"
            class="hall-tab"
            :class="{ 'hall-tab--active': h.id === hall.activeHallId }"
            @click="hall.setActiveHall(h.id)"
          >
            {{ h.name }}
          </button>
          <button class="hall-tab hall-tab--add" @click="openHallCreate">+ Зал</button>
        </div>
        <button
          v-if="hall.activeHall"
          class="hall-edit-btn"
          @click="openLayouts"
          aria-label="Шаблоны расстановки"
          title="Шаблоны расстановки"
        >
          📋
        </button>
        <button
          v-if="hall.activeHall"
          class="hall-edit-btn"
          @click="openHallEdit(hall.activeHall)"
          aria-label="Настройки зала"
        >
          ⚙
        </button>
      </div>

      <!-- No halls -->
      <div v-if="hall.isEmpty" class="empty-screen">
        <p class="empty-title">Залов пока нет</p>
        <p class="empty-text">Создайте первый зал, чтобы расставлять столы.</p>
        <button class="btn-primary" @click="openHallCreate">Создать зал</button>
      </div>

      <!-- Canvas -->
      <div v-else class="canvas-area">
        <HallEditorCanvas
          v-if="hall.activeHall"
          ref="canvasRef"
          :hall="hall.activeHall"
          :tables="hall.tablesOfActive"
          :selected-id="editingTableId"
          :pulse-table-id="pulseTableId"
          @table-tap="onTableTap"
          @table-drop="onTableDrop"
          @canvas-tap="onCanvasTap"
        />

        <!-- FAB: add table to current hall (hidden during edit) -->
        <button
          v-if="hall.activeHall && !editingTableId"
          class="fab"
          @click="openTableCreate"
          aria-label="Добавить стол"
        >
          +
        </button>
      </div>
    </template>

    <HallFormModal
      v-if="hallFormVisible"
      :initial="editingHall"
      @close="closeHallForm"
      @saved="closeHallForm"
    />

    <!-- Live editing of an existing table — auto-centers viewport on it -->
    <TableEditPanel
      :visible="!!editingTableId"
      :table="editingTablePanel"
      @close="onCloseEditPanel"
      @commit="onCommitEdit"
      @delete="onDeleteFromPanel"
      @duplicate="onDuplicateFromPanel"
    />

    <!-- Saved table arrangements (templates) for the active hall -->
    <HallLayoutsPanel
      :visible="layoutsPanelVisible"
      @close="layoutsPanelVisible = false"
      @applied="onLayoutApplied"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkplaceStore } from '@/stores/workplace'
import { useShiftStore } from '@/stores/shift'
import { useOrderStore } from '@/stores/order'
import { useHallStore } from '@/stores/hall'
import { useUiStore } from '@/stores/ui'
import { useUndoStack } from '@/composables/useUndoStack'
import { newId } from '@/utils/nanoid'
import HallEditorCanvas from './HallEditorCanvas.vue'
import HallFormModal from './HallFormModal.vue'
import TableEditPanel from './TableEditPanel.vue'
import HallLayoutsPanel from './HallLayoutsPanel.vue'

const router = useRouter()
const workplace = useWorkplaceStore()
const shift = useShiftStore()
const order = useOrderStore()
const hall = useHallStore()
const ui = useUiStore()
const undoStack = useUndoStack({ limit: 50 })

const canvasRef = ref(null)

// Currently-edited table id (panel is visible when set).
// Live edits propagate through hall.patchTableLocal — committed on close.
const editingTableId = ref(null)
const editingTablePanel = computed(() =>
  editingTableId.value ? hall.tableById(editingTableId.value) : null,
)

const hallFormVisible = ref(false)
const editingHall = ref(null)

/** Controls the layouts (templates) bottom sheet. Loaded lazily — we
 *  fetch the layouts list only when the user opens the panel. */
const layoutsPanelVisible = ref(false)

/**
 * Id of the table that was just created, used to draw a pulsing highlight
 * around it for a couple of seconds so the user immediately sees where the
 * new table appeared (the viewport may be zoomed, so a silent spawn is
 * easy to miss). Cleared by a timer.
 */
const pulseTableId = ref(null)
let pulseTimer = null

function goBack() {
  router.back()
}

function goToImport() {
  router.push({ name: 'import' })
}

// === Hall form ===
function openHallCreate() {
  editingHall.value = null
  hallFormVisible.value = true
}

function openHallEdit(h) {
  editingHall.value = h
  hallFormVisible.value = true
}

function closeHallForm() {
  hallFormVisible.value = false
  editingHall.value = null
}

// === Layouts (templates) ===
/**
 * Open the layouts bottom sheet. We refetch layouts on each open so the
 * list reflects deletions/renames made elsewhere (currently impossible
 * but free insurance for the future).
 */
async function openLayouts() {
  if (!hall.activeHallId) return
  layoutsPanelVisible.value = true
  try {
    await hall.fetchLayouts(hall.activeHallId)
  } catch (e) {
    ui.toastError(e.message)
  }
}

/**
 * After a template applies, pulse every table that was moved or created
 * so the user can see what changed without scanning the whole hall.
 * The summary comes from the apply endpoint:
 *   { moved: [id...], created: [id...], kept_extras: [...], deleted_extras: [...] }
 */
function onLayoutApplied({ moved, created }) {
  const all = [...(moved || []), ...(created || [])]
  if (all.length === 0) return
  // Pulse the first changed table specifically (only one ring at a time)
  // and center on it so the user sees the action took effect.
  const firstId = all[0]
  nextTick(() => canvasRef.value?.centerOnTable(firstId))
  pulseTableId.value = firstId
  clearTimeout(pulseTimer)
  pulseTimer = setTimeout(() => {
    if (pulseTableId.value === firstId) pulseTableId.value = null
  }, 2000)
}

// === Table creation ===
/**
 * One-tap table creation. We skip a form modal entirely: a sensible default
 * table (100×100, rounded rectangle, next free number) appears at the
 * center of the current viewport and pulses for a moment to draw the eye.
 * The user can then tap it to fine-tune via TableEditPanel — or just leave
 * it alone if the defaults are good enough.
 */
async function openTableCreate() {
  if (!hall.activeHall) return

  // Suggest the next free number in this hall
  const existing = hall.tablesOfHall(hall.activeHallId).map((t) => t.number)
  let nextNum = 1
  while (existing.includes(nextNum)) nextNum++

  // Spawn at the center of what the user is currently looking at.
  // Default size is 100×100; we offset so the table's center matches.
  const center = canvasRef.value?.getViewportCenter?.() || { x: 0, y: 0 }
  const w = 100
  const h = 100
  const activeHall = hall.activeHall
  let x = Math.round(center.x - w / 2)
  let y = Math.round(center.y - h / 2)
  // Clamp into hall bounds so we never spawn off-canvas at the edges.
  x = Math.max(0, Math.min(x, activeHall.width - w))
  y = Math.max(0, Math.min(y, activeHall.height - h))

  const id = newId()
  const body = {
    id,
    number: nextNum,
    x,
    y,
    width: w,
    height: h,
    rotation: 0,
    border_radius: 16, // rounded by default — softer look than a sharp rectangle
  }

  try {
    await hall.createTable(hall.activeHallId, body)
    undoStack.push({
      label: 'Создать стол',
      undo: async () => { await hall.removeTable(id) },
      redo: async () => { await hall.createTable(hall.activeHallId, body) },
    })

    // Pulse the new table for a moment so the user spots it on the canvas.
    pulseTableId.value = id
    clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => {
      if (pulseTableId.value === id) pulseTableId.value = null
    }, 2000)
  } catch (e) {
    ui.toastError(e.message)
  }
}

// === Table interactions on canvas ===

/**
 * Tap on a table → open the edit panel for it.
 * Also centers viewport so the table is visible above the bottom sheet.
 */
async function onTableTap(tableId) {
  // Toggling: tap the same table twice = close
  if (editingTableId.value === tableId) {
    editingTableId.value = null
    return
  }
  editingTableId.value = tableId
  // Wait for DOM update so the canvas exists, then center.
  await nextTick()
  canvasRef.value?.centerOnTable(tableId)
}

function onCanvasTap() {
  // Tap on empty area = close edit panel (if open)
  if (editingTableId.value) {
    onCloseEditPanel()
  }
}

/**
 * Drag finished. Apply patch + record into undo stack.
 * The canvas already showed the new position locally — we just sync with store.
 */
async function onTableDrop({ id, x, y, prevX, prevY }) {
  try {
    await hall.updateTable(id, { x, y })
    undoStack.push({
      label: 'Передвинуть стол',
      undo: async () => {
        await hall.updateTable(id, { x: prevX, y: prevY })
      },
      redo: async () => {
        await hall.updateTable(id, { x, y })
      },
    })
  } catch (e) {
    ui.toastError(e.message)
  }
}

// === Edit panel callbacks ===

/**
 * Panel emits 'commit' when user closes after changing fields.
 * `patch` is the diff vs initial; `prevSnapshot` lets us undo cleanly.
 */
async function onCommitEdit(tableId, patch, prevSnapshot) {
  try {
    await hall.updateTable(tableId, patch)
    // Build undo patch: only fields present in `patch`
    const undoPatch = {}
    for (const key of Object.keys(patch)) {
      undoPatch[key] = prevSnapshot[key]
    }
    undoStack.push({
      label: 'Изменить стол',
      undo: async () => {
        await hall.updateTable(tableId, undoPatch)
      },
      redo: async () => {
        await hall.updateTable(tableId, patch)
      },
    })
  } catch (e) {
    ui.toastError(e.message)
  }
}

function onCloseEditPanel() {
  editingTableId.value = null
}

async function onDeleteFromPanel(tableId, snapshot) {
  editingTableId.value = null

  // If a shift is open and this table has an active (unpaid) order on it,
  // warn the user: removing the table doesn't delete the order — the
  // backend nulls table_id (ON DELETE SET NULL), so the order is kept
  // but becomes "detached" and has to be reassigned manually later.
  if (shift.isOpen) {
    const activeOrder = order.orderByTable(tableId)
    if (activeOrder) {
      const ok = await ui.confirm({
        title: 'Удалить стол с активным заказом?',
        message:
          'На этом столе есть незакрытый заказ. Если удалить стол, ' +
          'заказ останется в смене, но без привязки к столу — ' +
          'его нужно будет переназначить вручную.',
        confirmText: 'Удалить',
        cancelText: 'Отмена',
        danger: true,
      })
      if (!ok) {
        // Re-open the edit panel so the user lands back where they were.
        editingTableId.value = tableId
        return
      }
    }
  }

  try {
    await hall.removeTable(tableId)
    undoStack.push({
      label: 'Удалить стол',
      undo: async () => {
        await hall.createTable(snapshot.hall_id, {
          id: snapshot.id,
          number: snapshot.number,
          x: snapshot.x,
          y: snapshot.y,
          width: snapshot.width,
          height: snapshot.height,
          rotation: snapshot.rotation,
          border_radius: snapshot.border_radius,
        })
      },
      redo: async () => {
        await hall.removeTable(snapshot.id)
      },
    })
    ui.toastSuccess('Стол удалён')
  } catch (e) {
    ui.toastError(e.message)
  }
}

/**
 * Create a copy of a table near the original with the next free number.
 * The copy is offset by (24, 24) px so it doesn't sit exactly on top.
 * If that position is outside the hall, clamp into bounds.
 */
async function onDuplicateFromPanel(snapshot) {
  editingTableId.value = null

  // Next free number in this hall
  const existing = hall.tablesOfHall(snapshot.hall_id).map((t) => t.number)
  let nextNum = 1
  while (existing.includes(nextNum)) nextNum++

  // Offset and clamp into hall bounds
  const activeHall = hall.activeHall
  const offset = 24
  let newX = snapshot.x + offset
  let newY = snapshot.y + offset
  if (activeHall) {
    newX = Math.max(0, Math.min(newX, activeHall.width - snapshot.width))
    newY = Math.max(0, Math.min(newY, activeHall.height - snapshot.height))
  }

  const id = newId()
  const body = {
    id,
    number: nextNum,
    x: newX,
    y: newY,
    width: snapshot.width,
    height: snapshot.height,
    rotation: snapshot.rotation,
    border_radius: snapshot.border_radius,
  }

  try {
    await hall.createTable(snapshot.hall_id, body)
    undoStack.push({
      label: 'Дублировать стол',
      undo: async () => { await hall.removeTable(id) },
      redo: async () => { await hall.createTable(snapshot.hall_id, body) },
    })
    ui.toastSuccess(`Создан стол №${nextNum}`)

    // Center on the copy and pulse it — same cue as for fresh table creation,
    // so the user instantly sees where it appeared. We don't auto-open the
    // edit panel: if the user wants to tweak the copy, they can tap it.
    await nextTick()
    canvasRef.value?.centerOnTable(id)
    pulseTableId.value = id
    clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => {
      if (pulseTableId.value === id) pulseTableId.value = null
    }, 2000)
  } catch (e) {
    ui.toastError(e.message)
  }
}

// === Undo/Redo ===
async function onUndo() {
  try {
    await undoStack.undo()
  } catch (e) {
    ui.toastError(`Не удалось отменить: ${e.message}`)
  }
}

async function onRedo() {
  try {
    await undoStack.redo()
  } catch (e) {
    ui.toastError(`Не удалось повторить: ${e.message}`)
  }
}

// === Keyboard shortcuts (desktop) ===
function onKey(e) {
  const isUndo = (e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey
  const isRedo =
    (e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))
  if (isUndo) {
    e.preventDefault()
    onUndo()
  } else if (isRedo) {
    e.preventDefault()
    onRedo()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  undoStack.clear()
  clearTimeout(pulseTimer)
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f5f7;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background-color: #fff;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 0;
  z-index: 10;
  touch-action: none;
  overscroll-behavior: contain;
}

.back-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: #333;
  cursor: pointer;
  padding: 4px 8px;
}

.title {
  flex: 1;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.topbar-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  background: none;
  border: 1px solid #e0e0e0;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  font-size: 18px;
  color: #555;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  transition: background-color 0.12s ease;
}

.icon-btn:not(:disabled):active {
  background-color: #f0f0f0;
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.halls-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: #fff;
  border-bottom: 1px solid #eee;
}

.halls-tabs {
  flex: 1;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  /* Mirror HallSwitcher: explicit pan-x so native horizontal scroll wins
     over any ancestor touch-action overrides. */
  touch-action: pan-x;
  overscroll-behavior-x: contain;
}

.halls-tabs::-webkit-scrollbar {
  display: none;
}

.hall-tab {
  flex-shrink: 0;
  background: none;
  border: 1px solid #e0e0e0;
  padding: 7px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.hall-tab--active {
  background-color: #4caf50;
  border-color: #4caf50;
  color: #fff;
}

.hall-tab--add {
  border-style: dashed;
  color: #4caf50;
  border-color: #4caf50;
}

.hall-edit-btn {
  flex-shrink: 0;
  background: none;
  border: 1px solid #e0e0e0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-size: 16px;
  cursor: pointer;
  font-family: inherit;
}

.hall-edit-btn:active {
  background-color: #f0f0f0;
}

.empty-screen {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 32px 24px;
  text-align: center;
  gap: 12px;
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.empty-text {
  margin: 0;
  color: #888;
  font-size: 14px;
}

.btn-primary {
  background-color: #4caf50;
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 8px;
}

.canvas-area {
  flex: 1;
  position: relative;
}

.canvas-area > :first-child {
  position: absolute;
  inset: 0;
}

.fab {
  position: absolute;
  right: 12px;
  bottom: 12px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background-color: #4caf50;
  color: #fff;
  border: none;
  font-size: 26px;
  line-height: 1;
  box-shadow: 0 4px 14px rgba(76, 175, 80, 0.4);
  cursor: pointer;
  z-index: 5;
}

.fab:active {
  transform: scale(0.92);
}
</style>