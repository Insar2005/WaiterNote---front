<template>
  <BottomSheet
    :visible="visible"
    :snap-points="snapPoints"
    :initial-snap="0"
    :show-backdrop="false"
  >
    <template #header>
      <div class="header">
        <h3 class="title">
          <span>Стол №</span>
          <input
            v-model.number="localTable.number"
            type="number"
            min="1"
            class="title-input"
            aria-label="Номер стола"
          />
        </h3>
        <button class="close-btn" @click="onClose" aria-label="Закрыть">×</button>
      </div>
    </template>

    <div class="form">
      <!-- Width -->
      <div class="field">
        <div class="field-row">
          <span class="field-label">Ширина</span>
          <span class="field-value">{{ localTable.width }} px</span>
        </div>
        <input
          v-model.number="localTable.width"
          type="range"
          :min="40"
          :max="300"
          step="10"
          class="slider"
        />
      </div>

      <!-- Height -->
      <div class="field">
        <div class="field-row">
          <span class="field-label">Высота</span>
          <span class="field-value">{{ localTable.height }} px</span>
        </div>
        <input
          v-model.number="localTable.height"
          type="range"
          :min="40"
          :max="300"
          step="10"
          class="slider"
        />
      </div>

      <!-- Shape: presets + slider -->
      <div class="field">
        <div class="field-row">
          <span class="field-label">Форма</span>
          <span class="field-value">{{ roundnessPercent }}%</span>
        </div>
        <div class="shape-presets">
          <button
            type="button"
            class="preset-btn"
            :class="{ 'preset-btn--active': roundnessPercent === 0 }"
            @click="setRoundness(0)"
          >
            <span class="preset-icon" style="border-radius: 0" />
            <span>Прямоугольник</span>
          </button>
          <button
            type="button"
            class="preset-btn"
            :class="{ 'preset-btn--active': roundnessPercent === 100 }"
            @click="setRoundness(100)"
          >
            <span class="preset-icon" style="border-radius: 50%" />
            <span>Овал/Круг</span>
          </button>
        </div>
        <input
          :value="roundnessPercent"
          @input="(e) => setRoundness(Number(e.target.value))"
          type="range"
          min="0"
          max="100"
          step="5"
          class="slider"
        />
      </div>

      <!-- Rotation -->
      <div class="field">
        <div class="field-row">
          <span class="field-label">Поворот</span>
          <span class="field-value">{{ formatRotation(localTable.rotation) }}</span>
        </div>
        <input
          v-model.number="localTable.rotation"
          type="range"
          :min="-180"
          :max="180"
          step="5"
          class="slider"
        />
        <button
          v-if="localTable.rotation !== 0"
          type="button"
          class="reset-link"
          @click="localTable.rotation = 0"
        >
          Сбросить поворот
        </button>
      </div>
    </div>

    <template #footer>
      <div class="footer-row">
        <button class="btn btn--danger" @click="onDelete" :disabled="busy">
          🗑 Удалить
        </button>
        <button class="btn btn--ghost" @click="onDuplicate" :disabled="busy">
          📋 Копия
        </button>
        <button class="btn btn--primary" @click="onClose" :disabled="busy">
          Готово
        </button>
      </div>
    </template>
  </BottomSheet>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import BottomSheet from '@/components/BottomSheet.vue'
import { useHallStore } from '@/stores/hall'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /**
   * Table being edited. The panel mirrors its fields locally; on every change
   * we patch the hall store *locally* so the canvas updates instantly.
   * Server commit happens once on close (via @commit emit to parent).
   */
  table: { type: Object, default: null },
})

const emit = defineEmits([
  'close',         // sheet should be closed (parent sets visible=false)
  'commit',        // (id, patch) — parent persists changes + records in undo
  'delete',        // (id, snapshot) — parent removes + records in undo
  'duplicate',     // (snapshot) — parent creates a copy near the original
])

const hall = useHallStore()
const ui = useUiStore()

// Sheet snap points: peek-ish (260px shows all key controls), middle, top
// Two-level sheet: compact peek and a half-screen view.
// We deliberately don't go full-screen — the whole point of live editing
// is seeing the table in context on the map. If content doesn't fit at 0.55,
// the sheet body scrolls (overflow-y: auto in BottomSheet).
const snapPoints = ref([280, 0.55])

const busy = ref(false)

// === Local mutable copy ===
// We mirror the table fields locally and patch hall store on each tweak,
// so the canvas updates in real time as user moves sliders.
const localTable = reactive({
  number: 1,
  width: 100,
  height: 100,
  rotation: 0,
  border_radius: 16,
})

// Initial snapshot, used to compute the patch on commit and as undo target.
let initialSnapshot = null

// When `table` prop changes (different table being edited), reset local state
watch(
  () => props.table?.id,
  (id) => {
    if (!id || !props.table) return
    Object.assign(localTable, {
      number: props.table.number,
      width: props.table.width,
      height: props.table.height,
      rotation: props.table.rotation || 0,
      border_radius: props.table.border_radius ?? 16,
    })
    initialSnapshot = { ...localTable }
  },
  { immediate: true },
)

// === Live updates: patch the hall store on every local change ===
// This makes the canvas reflect the changes immediately.
watch(
  () => ({ ...localTable }),
  (cur, prev) => {
    if (!props.table) return
    // Only patch fields that actually changed
    const patch = {}
    for (const key of Object.keys(cur)) {
      if (cur[key] !== prev?.[key]) patch[key] = cur[key]
    }
    if (Object.keys(patch).length > 0) {
      hall.patchTableLocal(props.table.id, patch)
    }
  },
  { deep: true },
)

// === Roundness: percentage 0-100 mapped to actual border_radius in px ===
// border_radius = (min(width, height) / 2) * (percent / 100)
// At 100%, circle/oval is achieved. At 0%, sharp corners.
const roundnessPercent = computed(() => {
  const minSide = Math.min(localTable.width, localTable.height)
  if (minSide <= 0) return 0
  const max = minSide / 2
  if (max <= 0) return 0
  return Math.round((localTable.border_radius / max) * 100)
})

function setRoundness(percent) {
  const clamped = Math.max(0, Math.min(100, percent))
  const minSide = Math.min(localTable.width, localTable.height)
  localTable.border_radius = Math.round((minSide / 2) * (clamped / 100))
}

// When width/height changes and at "preset" extremes, keep the preset visually
// (e.g., circle stays circle when resizing).
watch(
  () => [localTable.width, localTable.height],
  () => {
    // If user is at 100% (oval), keep at 100% by recalculating border_radius
    // from the *current* min side. Same for sharp corners (0%).
    // We snap to nearest preset only if user was within 2% of it.
    const cur = roundnessPercent.value
    if (cur === 0) {
      localTable.border_radius = 0
    } else if (cur >= 98) {
      const minSide = Math.min(localTable.width, localTable.height)
      localTable.border_radius = Math.round(minSide / 2)
    }
  },
)

function formatRotation(deg) {
  const sign = deg > 0 ? '+' : ''
  return `${sign}${deg}°`
}

// === Actions ===

function onClose() {
  if (!props.table || !initialSnapshot) {
    emit('close')
    return
  }

  // Compute final patch vs initial; emit commit only if anything actually changed.
  const patch = {}
  for (const key of Object.keys(localTable)) {
    if (localTable[key] !== initialSnapshot[key]) {
      patch[key] = localTable[key]
    }
  }

  if (Object.keys(patch).length > 0) {
    emit('commit', props.table.id, patch, { ...initialSnapshot })
  }
  emit('close')
}

async function onDelete() {
  if (!props.table) return
  const ok = await ui.confirm({
    title: `Удалить стол №${localTable.number}?`,
    message: 'Действие можно отменить кнопкой ↶',
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return

  // Restore original values in store before delete (otherwise undo would
  // re-create with the half-edited values from this session).
  if (initialSnapshot) {
    hall.patchTableLocal(props.table.id, initialSnapshot)
  }
  emit('delete', props.table.id, props.table)
  emit('close')
}

/**
 * Duplicate this table: create a copy slightly offset from the original
 * (so it doesn't sit on top) with the next available number. Parent
 * handles creation + undo bookkeeping.
 */
function onDuplicate() {
  if (!props.table) return
  // First commit any pending edits to the original so the copy mirrors
  // exactly what's on screen, not a stale snapshot.
  const patch = {}
  for (const key of Object.keys(localTable)) {
    if (initialSnapshot && localTable[key] !== initialSnapshot[key]) {
      patch[key] = localTable[key]
    }
  }
  if (Object.keys(patch).length > 0) {
    emit('commit', props.table.id, patch, { ...initialSnapshot })
  }

  // Build a snapshot of *current visible state* (localTable) for the parent
  // to use as the seed of the copy.
  const snapshot = {
    hall_id: props.table.hall_id,
    width: localTable.width,
    height: localTable.height,
    rotation: localTable.rotation,
    border_radius: localTable.border_radius,
    x: props.table.x,
    y: props.table.y,
  }
  emit('duplicate', snapshot)
  emit('close')
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
  font-size: 16px;
  font-weight: 600;
  color: var(--wn-ink);
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-input {
  width: 60px;
  font-size: 16px;
  font-weight: 600;
  color: var(--wn-ink);
  padding: 4px 8px;
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 8px;
  background-color: var(--wn-bg-recessed);
  outline: none;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  /* Hide spin buttons */
  -moz-appearance: textfield;
}

.title-input::-webkit-outer-spin-button,
.title-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.title-input:focus {
  border-color: var(--wn-accent-text);
  background-color: var(--wn-bg-elevated);
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
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 0 16px 0;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.field-label {
  font-size: 12px;
  color: var(--wn-ink-soft);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.field-value {
  font-size: 13px;
  color: var(--wn-ink);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.field-input {
  font-size: 15px;
  padding: 9px 12px;
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 10px;
  background-color: var(--wn-bg-recessed);
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.field-input:focus {
  border-color: var(--wn-accent-text);
  background-color: var(--wn-bg-elevated);
}

.slider {
  width: 100%;
  accent-color: var(--wn-accent-text);
  height: 28px;
  margin: 0;
}

.shape-presets {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.preset-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: var(--wn-bg-recessed);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 10px;
  padding: 9px 10px;
  font-size: 12px;
  color: var(--wn-ink-soft);
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

.preset-btn--active {
  background-color: var(--wn-accent-fill);
  border-color: var(--wn-accent-text);
  color: var(--wn-accent-text);
  font-weight: 500;
}

.preset-icon {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid currentColor;
  background-color: var(--wn-bg-elevated);
}

.reset-link {
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--wn-ink-mute);
  font-size: 12px;
  padding: 2px 0;
  cursor: pointer;
  font-family: inherit;
  text-decoration: underline;
}

.reset-link:active {
  color: var(--wn-ink-soft);
}

.btn {
  padding: 11px 16px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.btn:active {
  opacity: 0.85;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--danger {
  background-color: #ffebee;
  color: #c62828;
}

.btn--ghost {
  background-color: var(--wn-bg);
  color: var(--wn-ink);
}

.btn--primary {
  background-color: var(--wn-accent);
  color: #fff;
  flex: 1;
}

.footer-row {
  display: flex;
  gap: 8px;
}
</style>