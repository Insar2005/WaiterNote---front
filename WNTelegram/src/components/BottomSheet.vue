<template>
  <transition name="sheet-fade">
    <div v-if="visible" class="sheet-overlay" @click.self="onBackdropClick">
      <div
        class="sheet"
        :class="{
          'sheet--dragging': sheet.isDragging.value,
          'sheet--animating': sheet.isAnimating.value,
        }"
        :style="sheetStyle"
        @pointerdown.stop
      >
        <!-- Drag handle: bound to pointer events; whole header is draggable -->
        <div
          class="sheet-handle-area"
          @pointerdown="sheet.handlePointerDown"
        >
          <div class="sheet-handle" />
          <div v-if="$slots.header" class="sheet-header">
            <slot name="header" />
          </div>
        </div>

        <!-- Scrollable content area -->
        <div
          class="sheet-content"
          :class="{ 'sheet-content--scrollable': sheet.contentScrollable.value }"
        >
          <slot />
        </div>

        <!-- Sticky footer (optional) -->
        <div v-if="$slots.footer" class="sheet-footer">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useDraggableSheet } from '@/composables/useDraggableSheet'

const props = defineProps({
  /** v-model: visible toggle */
  visible: { type: Boolean, default: false },

  /**
   * Snap-point distances from bottom in px.
   * Default: peek (90), middle (~half), full (~90vh).
   * Can be overridden, e.g. [60, 0.5, 0.9] — numbers > 1 are absolute px,
   * numbers <= 1 are fractions of viewport height.
   */
  snapPoints: {
    type: Array,
    default: () => [90, 0.5, 0.9],
  },

  /** Initial snap index. */
  initialSnap: { type: Number, default: 1 },

  /** Whether tapping backdrop dismisses (closes to peek or fully). */
  dismissOnBackdrop: { type: Boolean, default: false },

  /** Whether to show backdrop overlay. peek mode usually has no backdrop. */
  showBackdrop: { type: Boolean, default: true },
})

const emit = defineEmits(['update:visible', 'snap-change', 'close'])

// Resolve snap points (fractions → px)
const resolvedSnaps = computed(() =>
  props.snapPoints.map((p) =>
    p > 1 ? p : window.innerHeight * p,
  ),
)

const sheet = useDraggableSheet({
  snapPoints: resolvedSnaps.value,
  initialIdx: props.initialSnap,
  onSnapChange: (idx) => emit('snap-change', idx),
})

const sheetStyle = computed(() => ({
  height: `${sheet.currentHeight.value}px`,
}))

function onBackdropClick() {
  if (!props.dismissOnBackdrop) return
  // Close to lowest snap (peek) instead of removing — keeps the sheet pinned
  sheet.snapTo(0)
  emit('close')
}

// Window resize: recalculate snap points (in case viewport changed)
watch(() => props.snapPoints, () => {
  // Re-snap to current index with new heights
  sheet.snapTo(sheet.currentSnapIdx.value)
})

// Expose imperative API (snap to specific point) to parents.
defineExpose({
  snapTo: sheet.snapTo,
  currentSnapIdx: sheet.currentSnapIdx,
})
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 250;
  pointer-events: none;
}

.sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
  pointer-events: auto;
  /* During drag, transitions disabled; during animation back to snap, enabled */
  will-change: height;
}

.sheet--animating {
  transition: height 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Disable transition during active drag for instant feedback */
.sheet--dragging {
  transition: none;
}

.sheet-handle-area {
  flex-shrink: 0;
  padding: 8px 16px 4px 16px;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.sheet-handle-area:active {
  cursor: grabbing;
}

.sheet-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background-color: #d0d0d0;
  margin: 0 auto 8px auto;
}

.sheet-header {
  /* Project-specific header content goes here via slot */
}

.sheet-content {
  flex: 1;
  overflow: hidden;
  padding: 0 16px;
}

.sheet-content--scrollable {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.sheet-footer {
  flex-shrink: 0;
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
  background-color: #fff;
}

.sheet-fade-enter-active,
.sheet-fade-leave-active {
  transition: opacity 0.25s ease;
}

.sheet-fade-enter-active .sheet,
.sheet-fade-leave-active .sheet {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.sheet-fade-enter-from .sheet,
.sheet-fade-leave-to .sheet {
  transform: translateY(100%);
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}
</style>