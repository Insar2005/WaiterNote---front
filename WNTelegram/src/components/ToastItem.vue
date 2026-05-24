<template>
  <div
    class="toast"
    :class="`toast--${toast.type}`"
    role="status"
    :style="dragStyle"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @click="onClick"
  >
    {{ toast.message }}
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  toast: { type: Object, required: true },
})
const emit = defineEmits(['dismiss'])

/** Swipe-to-dismiss threshold: how many pixels of horizontal drag must
 *  accumulate before we treat it as a dismiss gesture. Below this we snap
 *  back. Tuned for a confident swipe but not an accidental finger slide. */
const DISMISS_THRESHOLD = 80

const dragX = ref(0)
const dragging = ref(false)
let pointerId = null
let startX = 0
let startY = 0
let horizontal = null // null = undecided, true = horizontal, false = vertical

function onPointerDown(e) {
  if (e.button !== undefined && e.button !== 0) return
  pointerId = e.pointerId
  startX = e.clientX
  startY = e.clientY
  dragging.value = true
  horizontal = null
  e.currentTarget.setPointerCapture?.(e.pointerId)
}

function onPointerMove(e) {
  if (e.pointerId !== pointerId) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY

  // Decide axis on first significant movement; if the user's swipe is
  // primarily vertical (page scroll intent) we don't hijack it.
  if (horizontal === null) {
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)
    if (absX < 4 && absY < 4) return
    horizontal = absX > absY
    if (!horizontal) {
      // Vertical intent — release pointer, let native handlers run.
      e.currentTarget.releasePointerCapture?.(pointerId)
      dragging.value = false
      pointerId = null
      return
    }
  }
  dragX.value = dx
}

function onPointerUp(e) {
  if (e.pointerId !== pointerId) return
  pointerId = null
  const shouldDismiss = Math.abs(dragX.value) >= DISMISS_THRESHOLD
  dragging.value = false
  if (shouldDismiss) {
    emit('dismiss')
  } else {
    dragX.value = 0
  }
}

/**
 * Tap (not swipe) also dismisses, matching the previous click-to-dismiss
 * behavior. We suppress this when a swipe just ended, since a swipe ending
 * back at zero would otherwise fire a click too.
 */
function onClick() {
  if (Math.abs(dragX.value) > 4) return
  emit('dismiss')
}

const dragStyle = computed(() => {
  if (dragX.value === 0 && !dragging.value) return {}
  // Fade out as the toast moves further from center — gives a clear
  // "I'm dismissing" feeling instead of just a slide.
  const opacity = Math.max(0.2, 1 - Math.abs(dragX.value) / 200)
  return {
    transform: `translateX(${dragX.value}px)`,
    opacity,
    transition: dragging.value ? 'none' : 'transform 0.2s ease, opacity 0.2s ease',
  }
})
</script>

<style scoped>
.toast {
  pointer-events: auto;
  padding: 12px 16px;
  border-radius: 12px;
  background-color: #333;
  color: #fff;
  font-size: 14px;
  line-height: 1.35;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  word-wrap: break-word;
  touch-action: pan-y;
  user-select: none;
}

.toast--success {
  background-color: #2e7d32;
}
.toast--error {
  background-color: #c62828;
}
.toast--warning {
  background-color: #ef6c00;
}
.toast--info {
  background-color: #455a64;
}
</style>