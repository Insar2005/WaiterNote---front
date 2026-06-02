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
          id="ed-grid-minor"
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
          id="ed-grid-major"
          :width="gridStep * 5"
          :height="gridStep * 5"
          patternUnits="userSpaceOnUse"
        >
          <rect :width="gridStep * 5" :height="gridStep * 5" fill="url(#ed-grid-minor)" />
          <path
            :d="`M ${gridStep * 5} 0 L 0 0 0 ${gridStep * 5}`"
            fill="none"
            stroke="#dde2e7"
            stroke-width="1"
          />
        </pattern>
      </defs>

      <!-- Background + grid (this rect catches "empty" pointer events for pan/pinch) -->
      <rect
        class="bg"
        :width="hall.width"
        :height="hall.height"
        fill="#fafbfc"
        @pointerdown="onEmptyPointerDown"
      />
      <rect
        class="bg-grid"
        :width="hall.width"
        :height="hall.height"
        fill="url(#ed-grid-major)"
        pointer-events="none"
      />
      <!-- Border -->
      <rect
        :width="hall.width"
        :height="hall.height"
        fill="none"
        stroke="#cfd8dc"
        stroke-width="2"
        pointer-events="none"
      />

      <!-- Tables -->
      <g
        v-for="t in renderedTables"
        :key="t.id"
        class="table"
        :class="{
          'table--selected': t.id === selectedId,
          'table--dragging': t.id === draggingId,
          'table--pulse': t.id === pulseTableId,
        }"
        :transform="`translate(${t.x} ${t.y}) rotate(${t.rotation || 0} ${t.width/2} ${t.height/2})`"
        @pointerdown="onTablePointerDown($event, t.id)"
      >
        <!-- Pulsing ring drawn behind the rect; only visible for the
             freshly-created table. Sized to roughly match the table so the
             pulse hugs its silhouette. -->
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
          class="table-number"
        >
          {{ t.number }}
        </text>
      </g>
    </svg>

    <!-- Zoom controls -->
    <div class="zoom-controls">
      <button class="zoom-btn" @click="zoomOut" :disabled="!canZoomOut">−</button>
      <button class="zoom-btn zoom-btn--reset" @click="resetView">{{ zoomLabel }}</button>
      <button class="zoom-btn" @click="zoomIn" :disabled="!canZoomIn">+</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useSvgInput } from '@/composables/useSvgInput'

const props = defineProps({
  hall: { type: Object, required: true },
  tables: { type: Array, required: true },
  selectedId: { type: String, default: null },
  /** If set, draws a pulsing ring around the table with this id. Used as a
      "look, here it is" cue for freshly-spawned tables. */
  pulseTableId: { type: String, default: null },
  gridStep: { type: Number, default: 10 },
  /** Whether snap-to-grid is enabled. */
  snap: { type: Boolean, default: true },
})

const emit = defineEmits([
  'table-tap',         // (tableId) — short tap on a table
  'table-drop',        // ({ id, x, y }) — drag finished, commit to store
  'canvas-tap',        // (svgPoint) — tap on empty area (used to deselect)
])

const svgRef = ref(null)

// === Zoom + pan state ===
// `scale` is a free-floating number; ZOOM_LEVELS are used for the +/− buttons
// and as snap targets at the end of pinch gestures. Min/max are enforced by
// the lowest/highest level in ZOOM_LEVELS.
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

/** Find the next zoom level above or below the current scale. */
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
 * Used on mount (default zoom is 200%, so without this the user lands on
 * the top-left corner) and when switching halls.
 */
function centerView() {
  const w = props.hall.width / scale.value
  const h = props.hall.height / scale.value
  panX.value = (props.hall.width - w) / 2
  panY.value = (props.hall.height - h) / 2
}

onMounted(() => {
  centerView()
})

// Re-center when the hall itself changes (user picked a different hall tab).
watch(
  () => props.hall?.id,
  () => centerView(),
)

/**
 * Apply a new scale, keeping the visible center pinned in place
 * (so a +/− button doesn't jerk the canvas to a corner).
 */
function setScaleAroundCenter(newScale) {
  const oldVb = viewBox.value
  const cxRatio = 0.5
  const cyRatio = 0.5
  const centerSvg = {
    x: oldVb.x + oldVb.w * cxRatio,
    y: oldVb.y + oldVb.h * cyRatio,
  }
  const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale))
  scale.value = clamped
  const newW = props.hall.width / clamped
  const newH = props.hall.height / clamped
  panX.value = centerSvg.x - newW * cxRatio
  panY.value = centerSvg.y - newH * cyRatio
}

// === Drag state ===
// During drag we hold a local override of {x, y} so the UI updates instantly
// without writing to the store on every frame.
const draggingId = ref(null)
const dragOverride = ref(null) // { x, y } in SVG units

/**
 * Tables passed to the template — same as input, but with overridden
 * position for the table being dragged. This gives the smooth visual
 * without committing anything to the store yet.
 */
const renderedTables = computed(() => {
  if (!draggingId.value || !dragOverride.value) return props.tables
  return props.tables.map((t) =>
    t.id === draggingId.value ? { ...t, x: dragOverride.value.x, y: dragOverride.value.y } : t,
  )
})

function snapTo(value) {
  if (!props.snap) return value
  return Math.round(value / props.gridStep) * props.gridStep
}

function clampToHall(table, x, y) {
  const maxX = props.hall.width - table.width
  const maxY = props.hall.height - table.height
  return {
    x: Math.max(0, Math.min(x, maxX)),
    y: Math.max(0, Math.min(y, maxY)),
  }
}

// === Pinch state ===
// Snapshot of scale at gesture start; relative scale from useSvgInput
// is multiplied by this to get target scale.
let pinchStartScale = 1

// === Input handler wiring ===
const {
  handlePointerDownTable,
  handlePointerDownEmpty,
} = useSvgInput({
  svgRef,
  getViewBox: () => viewBox.value,
  callbacks: {
    onTableDragStart(tableId) {
      const t = props.tables.find((x) => x.id === tableId)
      if (!t) return
      draggingId.value = tableId
      dragOverride.value = { x: t.x, y: t.y }
    },

    onTableDragMove(tableId, delta) {
      const t = props.tables.find((x) => x.id === tableId)
      if (!t) return
      const rawX = t.x + delta.x
      const rawY = t.y + delta.y
      const { x, y } = clampToHall(t, snapTo(rawX), snapTo(rawY))
      dragOverride.value = { x, y }
    },

    onTableDragEnd(tableId) {
      if (!dragOverride.value) {
        draggingId.value = null
        return
      }
      const t = props.tables.find((x) => x.id === tableId)
      const final = dragOverride.value
      draggingId.value = null
      dragOverride.value = null

      if (!t) return
      if (final.x !== t.x || final.y !== t.y) {
        emit('table-drop', { id: tableId, x: final.x, y: final.y, prevX: t.x, prevY: t.y })
      }
    },

    onTableTap(tableId) {
      emit('table-tap', tableId)
    },

    onCanvasTap(svgPoint) {
      emit('canvas-tap', svgPoint)
    },

    onPan({ x, y }) {
      // useSvgInput sends a positive delta if user dragged the canvas content
      // in that direction (in SVG units, computed against gesture-start viewBox).
      // To follow the finger, viewBox origin must move in the OPPOSITE direction.
      panX.value -= x
      panY.value -= y
    },

    onPinch({ scale: relScale, centerSvg }) {
      // Continuous zoom: target = scale at pinch start * relative scale change.
      const target = clamp(pinchStartScale * relScale, MIN_SCALE, MAX_SCALE)

      // Keep `centerSvg` (midpoint between fingers, captured at pinch start
      // in SVG coords) pinned in place while the viewBox shrinks/grows.
      const newW = props.hall.width / target
      const newH = props.hall.height / target

      // The center should remain at the same screen position. Since we know
      // its SVG coordinates and the new viewBox dimensions, compute origin so
      // that center is at (50%, 50%) of new viewBox.
      // (Using the captured midSvg from gesture start anchors the gesture.)
      panX.value = centerSvg.x - newW * 0.5
      panY.value = centerSvg.y - newH * 0.5
      scale.value = target
    },

    onPinchEnd() {
      // Snap to the nearest zoom level for stable end state.
      const snapped = nearestLevel(scale.value)
      if (Math.abs(snapped - scale.value) > 0.001) {
        setScaleAroundCenter(snapped)
      }
    },
  },
})

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function onTablePointerDown(e, id) {
  pinchStartScale = scale.value
  handlePointerDownTable(e, id)
}

function onEmptyPointerDown(e) {
  pinchStartScale = scale.value
  handlePointerDownEmpty(e)
}

/**
 * Center the SVG viewport on a specific table with smooth animation.
 * `verticalBias`: 0..1, where 0.5 = exact vertical center, 0.35 = slightly
 * above center (leaves room below for a bottom sheet).
 */

let centerAnimRaf = null

function centerOnTable(tableId, { verticalBias = 0.35, duration = 280 } = {}) {
  const t = props.tables.find((x) => x.id === tableId)
  if (!t) return
  const cx = t.x + t.width / 2
  const cy = t.y + t.height / 2

  const vb = viewBox.value
  // Target pan in raw (before clamp) units; viewBox computed clamps anyway.
  const targetX = cx - vb.w / 2
  const targetY = cy - vb.h * verticalBias

  // If we're already very close, skip the animation entirely.
  if (
    Math.abs(targetX - panX.value) < 1 &&
    Math.abs(targetY - panY.value) < 1
  ) {
    return
  }

  // Cancel any in-flight tween before starting a new one.
  if (centerAnimRaf) {
    cancelAnimationFrame(centerAnimRaf)
    centerAnimRaf = null
  }

  const startX = panX.value
  const startY = panY.value
  const t0 = performance.now()

  // ease-out cubic — slow finish, snappy start
  function easeOut(p) {
    return 1 - Math.pow(1 - p, 3)
  }

  function step(now) {
    const elapsed = now - t0
    const p = Math.min(1, elapsed / duration)
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

/**
 * Current center of the visible viewport, in SVG coordinates.
 * Used by callers (e.g. HallEditorView) to spawn new tables where
 * the user is currently looking, instead of at the hall's (0, 0).
 */
function getViewportCenter() {
  const vb = viewBox.value
  return { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 }
}

defineExpose({
  centerOnTable,
  getViewportCenter,
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
  /* Block native scroll/zoom anywhere in the canvas area — pinch+pan are
     handled in JS. Without this, a swipe that starts on the zoom buttons
     (or anywhere in the canvas area, not just the SVG itself) would scroll
     the page. */
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
}

.table {
  cursor: pointer;
  user-select: none;
}

.table-rect {
  fill: #fff;
  stroke: #cfd8dc;
  stroke-width: 2;
  transition: stroke 0.15s ease, stroke-width 0.15s ease;
}

.table-number {
  fill: #455a64;
  font-size: 22px;
  font-weight: 600;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  pointer-events: none;
}

.table--selected .table-rect {
  stroke: #4caf50;
  stroke-width: 3;
}

.table--dragging {
  cursor: grabbing;
  /* During drag, suppress text rendering for performance on slow phones —
     numbers reappear when drag ends. */
}

.table--dragging .table-rect {
  fill: #e8f5e9;
  stroke: #4caf50;
  stroke-width: 3;
  filter: none;
}

.table--dragging .table-number {
  opacity: 0.5;
}

/* Pulse highlight for a freshly created table — a ring that briefly
   expands and fades to draw the eye. The ring sits behind the table
   rect (it's drawn first inside the <g> group). */
.table-pulse {
  stroke: var(--wn-accent, #4caf50);
  stroke-width: 3;
  animation: table-pulse 1.2s ease-out infinite;
  pointer-events: none;
  /* transform-box: fill-box makes `transform-origin: center` resolve to the
     center of the element's own bounding box, not the SVG root. Without
     this Safari scales the ring around the canvas origin. */
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

/* Zoom controls (same as HallCanvas) */
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