<template>
  <div class="canvas-wrap">
    <svg
      ref="svgRef"
      class="canvas"
      :viewBox="viewBoxStr"
      preserveAspectRatio="xMidYMid meet"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="vw-grid-minor"
          :width="gridStep"
          :height="gridStep"
          patternUnits="userSpaceOnUse"
        >
          <path
            :d="`M ${gridStep} 0 L 0 0 0 ${gridStep}`"
            fill="none"
            stroke="#eef0f2"
            stroke-width="1"
          />
        </pattern>
        <pattern
          id="vw-grid-major"
          :width="gridStep * 5"
          :height="gridStep * 5"
          patternUnits="userSpaceOnUse"
        >
          <rect :width="gridStep * 5" :height="gridStep * 5" fill="url(#vw-grid-minor)" />
          <path
            :d="`M ${gridStep * 5} 0 L 0 0 0 ${gridStep * 5}`"
            fill="none"
            stroke="#dde2e7"
            stroke-width="1"
          />
        </pattern>
      </defs>

      <!-- Background catches "empty" pointers for pan/pinch -->
      <rect
        class="bg"
        :width="hall.width"
        :height="hall.height"
        fill="#fafbfc"
        @pointerdown="onEmptyPointerDown"
      />
      <rect
        :width="hall.width"
        :height="hall.height"
        fill="url(#vw-grid-major)"
        pointer-events="none"
      />
      <rect
        :width="hall.width"
        :height="hall.height"
        fill="none"
        stroke="#cfd8dc"
        stroke-width="2"
        pointer-events="none"
      />

      <!-- Tables — inlined here so pointerdown/up are managed by useSvgInput.
           A regular `click` listener would race with the gesture handler. -->
      <g
        v-for="t in tables"
        :key="t.id"
        class="table"
        :class="[
          `table--${t.status}`,
          { 'table--pulse': t.id === pulseTableId },
        ]"
        :transform="`translate(${t.x} ${t.y}) rotate(${t.rotation || 0} ${t.width/2} ${t.height/2})`"
        @pointerdown="onTablePointerDown($event, t.id)"
      >
        <!-- Pulsing ring for the "just-placed" table — draws the eye to a
             newly created order's table when we land back on the map. -->
        <rect
          v-if="t.id === pulseTableId"
          class="table-pulse"
          :x="-10"
          :y="-10"
          :width="t.width + 20"
          :height="t.height + 20"
          :rx="(t.border_radius || 0) + 10"
          fill="none"
        />
        <rect
          :width="t.width"
          :height="t.height"
          :rx="t.border_radius"
          :ry="t.border_radius"
          class="table-rect"
        />
        <text
          :x="t.width / 2"
          :y="t.height / 2"
          text-anchor="middle"
          dominant-baseline="central"
          class="table-num"
        >
          {{ t.number }}
        </text>
      </g>
    </svg>

    <!-- Zoom controls -->
    <div class="zoom-controls">
      <button class="zoom-btn" @click="zoomOut" :disabled="!canZoomOut" aria-label="Уменьшить">−</button>
      <button class="zoom-btn zoom-btn--reset" @click="resetView" :title="zoomLabel">
        {{ zoomLabel }}
      </button>
      <button class="zoom-btn" @click="zoomIn" :disabled="!canZoomIn" aria-label="Увеличить">+</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useSvgInput } from '@/composables/useSvgInput'
import { loadHallViewport, saveHallViewport } from '@/utils/hallViewport'

const props = defineProps({
  hall: { type: Object, required: true },
  tables: { type: Array, required: true },
  /** If set, draws a pulsing ring around the table with this id. Used to
      cue the user that a newly placed order is on this specific table. */
  pulseTableId: { type: String, default: null },
  gridStep: { type: Number, default: 10 },
})

const emit = defineEmits(['table-click'])

const svgRef = ref(null)

// === Zoom + pan state ===
// View mode allows 100% (full hall fits) up to 400%.
// Below 100% would shrink the hall under the visible viewport — disallowed.
const ZOOM_LEVELS = [1, 1.25, 1.5, 2, 3, 4]
const MIN_SCALE = ZOOM_LEVELS[0]
const MAX_SCALE = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]

const scale = ref(2)
const panX = ref(0)
const panY = ref(0)

const canZoomIn = computed(() => scale.value < MAX_SCALE - 0.001)
const canZoomOut = computed(() => scale.value > MIN_SCALE + 0.001)
const zoomLabel = computed(() => `${Math.round(scale.value * 100)}%`)

const viewBox = computed(() => {
  const w = props.hall.width / scale.value
  const h = props.hall.height / scale.value
  const maxPanX = Math.max(0, props.hall.width - w)
  const maxPanY = Math.max(0, props.hall.height - h)
  const px = Math.max(0, Math.min(panX.value, maxPanX))
  const py = Math.max(0, Math.min(panY.value, maxPanY))
  return { x: px, y: py, w, h }
})

const viewBoxStr = computed(
  () => `${viewBox.value.x} ${viewBox.value.y} ${viewBox.value.w} ${viewBox.value.h}`,
)

function nextLevelAbove(s) {
  return ZOOM_LEVELS.find((lv) => lv > s + 0.001) ?? MAX_SCALE
}
function nextLevelBelow(s) {
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < s - 0.001) return ZOOM_LEVELS[i]
  }
  return MIN_SCALE
}
function nearestLevel(s) {
  let best = ZOOM_LEVELS[0]
  let bestDiff = Math.abs(best - s)
  for (const lv of ZOOM_LEVELS) {
    const d = Math.abs(lv - s)
    if (d < bestDiff) { best = lv; bestDiff = d }
  }
  return best
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function setScaleAroundCenter(newScale) {
  const oldVb = viewBox.value
  const cxRatio = 0.5
  const cyRatio = 0.5
  const centerSvg = {
    x: oldVb.x + oldVb.w * cxRatio,
    y: oldVb.y + oldVb.h * cyRatio,
  }
  const clamped = clamp(newScale, MIN_SCALE, MAX_SCALE)
  scale.value = clamped
  const newW = props.hall.width / clamped
  const newH = props.hall.height / clamped
  panX.value = centerSvg.x - newW * cxRatio
  panY.value = centerSvg.y - newH * cyRatio
}

function zoomIn() {
  if (canZoomIn.value) setScaleAroundCenter(nextLevelAbove(scale.value))
}
function zoomOut() {
  if (canZoomOut.value) setScaleAroundCenter(nextLevelBelow(scale.value))
}
function resetView() {
  scale.value = 1
  panX.value = 0
  panY.value = 0
}

/**
 * Center the viewport on the hall middle at the current scale.
 * The default zoom is 200%, so without explicit centering the user would
 * land on the top-left corner of a 1000×1000 hall.
 */
function centerView() {
  const w = props.hall.width / scale.value
  const h = props.hall.height / scale.value
  panX.value = (props.hall.width - w) / 2
  panY.value = (props.hall.height - h) / 2
}

/**
 * Try to restore the viewport for the current hall from localStorage.
 * Falls back to a centered default if nothing was saved. Called on mount
 * and whenever the active hall changes — returning to a hall the user
 * worked with before should land them back at "their" view.
 */
function restoreOrCenter() {
  const saved = loadHallViewport(props.hall?.id)
  if (saved) {
    scale.value = clamp(saved.scale, MIN_SCALE, MAX_SCALE)
    panX.value = saved.panX
    panY.value = saved.panY
    // The viewBox computed will clamp pan into [0, maxPan] automatically,
    // so we don't need to clamp here even if hall dimensions changed.
    return
  }
  centerView()
}

onMounted(() => {
  restoreOrCenter()
})

watch(
  () => props.hall?.id,
  () => restoreOrCenter(),
)

/**
 * Persist viewport state for the active hall. Debounced so a continuous
 * pan/pinch gesture only writes once it settles — without this, every
 * pointermove during a drag would trigger a localStorage write.
 */
let persistTimer = null
function schedulePersist() {
  if (!props.hall?.id) return
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    saveHallViewport(props.hall.id, {
      scale: scale.value,
      panX: panX.value,
      panY: panY.value,
    })
  }, 300)
}

watch([scale, panX, panY], schedulePersist)

// === Gesture handlers via useSvgInput ===
let pinchStartScale = 1

const {
  handlePointerDownTable,
  handlePointerDownEmpty,
} = useSvgInput({
  svgRef,
  getViewBox: () => viewBox.value,
  callbacks: {
    onTableTap(tableId) {
      const t = props.tables.find((x) => x.id === tableId)
      if (t) emit('table-click', t)
    },

    onPan({ x, y }) {
      panX.value -= x
      panY.value -= y
    },

    onPinch({ scale: rel, centerSvg }) {
      const target = clamp(pinchStartScale * rel, MIN_SCALE, MAX_SCALE)
      const newW = props.hall.width / target
      const newH = props.hall.height / target
      panX.value = centerSvg.x - newW * 0.5
      panY.value = centerSvg.y - newH * 0.5
      scale.value = target
    },

    onPinchEnd() {
      const snapped = nearestLevel(scale.value)
      if (Math.abs(snapped - scale.value) > 0.001) {
        setScaleAroundCenter(snapped)
      }
    },
  },
})

function onTablePointerDown(e, id) {
  pinchStartScale = scale.value
  handlePointerDownTable(e, id)
}

function onEmptyPointerDown(e) {
  pinchStartScale = scale.value
  handlePointerDownEmpty(e)
}

// === Smooth focus on a table (animated centerOnTable) ===
let centerAnimRaf = null

function centerOnTable(tableId, { verticalBias = 0.4, duration = 280 } = {}) {
  const t = props.tables.find((x) => x.id === tableId)
  if (!t) return
  const cx = t.x + t.width / 2
  const cy = t.y + t.height / 2

  const vb = viewBox.value
  const targetX = cx - vb.w / 2
  const targetY = cy - vb.h * verticalBias

  if (Math.abs(targetX - panX.value) < 1 && Math.abs(targetY - panY.value) < 1) return

  if (centerAnimRaf) {
    cancelAnimationFrame(centerAnimRaf)
    centerAnimRaf = null
  }

  const startX = panX.value
  const startY = panY.value
  const t0 = performance.now()
  const easeOut = (p) => 1 - Math.pow(1 - p, 3)

  function step(now) {
    const p = Math.min(1, (now - t0) / duration)
    const eased = easeOut(p)
    panX.value = startX + (targetX - startX) * eased
    panY.value = startY + (targetY - startY) * eased
    if (p < 1) {
      centerAnimRaf = requestAnimationFrame(step)
    } else {
      centerAnimRaf = null
    }
  }

  centerAnimRaf = requestAnimationFrame(step)
}

defineExpose({
  centerOnTable,
})
</script>

<style scoped>
.canvas-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  background-color: var(--wn-bg-elevated);
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  overscroll-behavior: contain;
}

.canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.bg {
  cursor: grab;
  fill: var(--wn-bg);
}

/* Floor-map grid lines follow the theme */
.canvas pattern path {
  stroke: var(--wn-grid-line);
}

.table {
  cursor: pointer;
}

.table-rect {
  fill: var(--wn-bg-elevated);
  stroke: var(--wn-glass-border-subtle);
  stroke-width: 2;
  transition: fill 0.15s ease, stroke 0.15s ease;
}

.table-num {
  fill: var(--wn-ink-soft);
  font-size: 22px;
  font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  pointer-events: none;
}

.table--free .table-rect {
  fill: var(--wn-bg-elevated);
  stroke: var(--wn-glass-border-subtle);
}

/* Не подано — акцентный неон */
.table--waiting .table-rect {
  fill: color-mix(in srgb, var(--wn-accent) 16%, var(--wn-bg-elevated));
  stroke: var(--wn-accent);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--wn-accent) 65%, transparent));
}
.table--waiting .table-num {
  fill: var(--wn-accent-text);
}

/* Ждёт оплаты — всегда красный неон */
.table--occupied .table-rect {
  fill: color-mix(in srgb, var(--wn-danger) 16%, var(--wn-bg-elevated));
  stroke: var(--wn-danger);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--wn-danger) 65%, transparent));
}
.table--occupied .table-num {
  fill: var(--wn-danger);
}

.table--reserved .table-rect {
  fill: color-mix(in srgb, #42a5f5 15%, var(--wn-bg-elevated));
  stroke: #42a5f5;
}
.table--reserved .table-num {
  fill: #42a5f5;
}

.table:active .table-rect {
  filter: brightness(0.95);
}

/* Pulsing ring for the just-placed table — visual cue when the user lands
   on the map after creating a new order. See HallEditorCanvas for the same
   pattern; transform-box is required for SVG transform-origin to resolve
   to the element's own bbox in Safari. */
.table-pulse {
  stroke: var(--wn-accent, #4caf50);
  stroke-width: 3;
  animation: table-pulse 1.2s ease-out infinite;
  pointer-events: none;
  transform-box: fill-box;
  transform-origin: center;
}

@keyframes table-pulse {
  0% {
    opacity: 0.9;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.25);
  }
}
.zoom-controls {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  background-color: var(--wn-bg-elevated);
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.zoom-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  font-size: 20px;
  font-weight: 500;
  color: var(--wn-ink-soft);
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.12s ease;
}

.zoom-btn:not(:disabled):active {
  background-color: var(--wn-bg-recessed);
}

.zoom-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.zoom-btn--reset {
  font-size: 11px;
  color: var(--wn-ink-soft);
  border-top: 1px solid var(--wn-glass-border-subtle);
  border-bottom: 1px solid var(--wn-glass-border-subtle);
}
</style>