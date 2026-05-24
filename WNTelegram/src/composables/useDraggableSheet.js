import { ref, computed, onMounted, onUnmounted } from 'vue'

/**
 * Draggable bottom sheet logic. Pure: doesn't render anything,
 * just tracks position and exposes pointer handlers.
 *
 * snapPoints: array of distances from BOTTOM of screen, in px.
 *   e.g. [80, 360, 720] = peek (80 from bottom), middle, near-top.
 *
 * The sheet's inline style should use `bottom: 0` and `transform: translateY(...)`,
 * because translating from the *expanded* state down is cheaper than animating top.
 *
 * Returns:
 *   currentSnapIdx — which snap point we're at (read-only)
 *   currentHeight — current height in px (reactive, updates during drag)
 *   isDragging — boolean
 *   handlePointerDown(e) — bind on the drag handle
 *   snapTo(idx) — programmatic snap with animation
 *   contentScrollable — whether sheet content should be scrollable
 *     (true only at the topmost snap)
 */
export function useDraggableSheet({
  snapPoints,
  initialIdx = 0,
  onSnapChange,
} = {}) {
  if (!snapPoints || snapPoints.length === 0) {
    throw new Error('useDraggableSheet: snapPoints required')
  }

  const currentSnapIdx = ref(initialIdx)
  const currentHeight = ref(snapPoints[initialIdx])
  const isDragging = ref(false)
  const isAnimating = ref(false)

  const contentScrollable = computed(
    () => currentSnapIdx.value === snapPoints.length - 1,
  )

  // Drag tracking
  let dragStartY = 0
  let dragStartHeight = 0
  let pointerId = null
  let lastDragHeight = 0
  let lastDragTime = 0
  let lastVelocity = 0
  let rafScheduled = false

  function handlePointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    pointerId = e.pointerId
    dragStartY = e.clientY
    dragStartHeight = currentHeight.value
    lastDragHeight = dragStartHeight
    lastDragTime = performance.now()
    lastVelocity = 0
    isDragging.value = true
    isAnimating.value = false

    e.target.setPointerCapture?.(e.pointerId)
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
  }

  function handlePointerMove(e) {
    if (e.pointerId !== pointerId) return
    e.preventDefault()
    if (rafScheduled) return
    rafScheduled = true

    requestAnimationFrame(() => {
      rafScheduled = false
      // Drag UP = clientY decreases = sheet should grow
      const deltaY = dragStartY - e.clientY
      let newHeight = dragStartHeight + deltaY
      // Clamp between min and max snap points
      const minH = snapPoints[0]
      const maxH = snapPoints[snapPoints.length - 1]
      if (newHeight < minH) {
        // Rubber band below minimum
        newHeight = minH - (minH - newHeight) * 0.3
      } else if (newHeight > maxH) {
        newHeight = maxH + (newHeight - maxH) * 0.3
      }

      // Velocity for fling
      const now = performance.now()
      const dt = now - lastDragTime
      if (dt > 0) {
        lastVelocity = (newHeight - lastDragHeight) / dt // px/ms
      }
      lastDragHeight = newHeight
      lastDragTime = now

      currentHeight.value = newHeight
    })
  }

  function handlePointerUp(e) {
    if (e.pointerId !== pointerId) return
    pointerId = null
    isDragging.value = false
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerUp)

    // Choose target snap based on current height + fling velocity
    const targetIdx = pickSnapTarget(currentHeight.value, lastVelocity)
    snapTo(targetIdx)
  }

  /**
   * Pick the snap point we should land on, given current height and
   * vertical velocity. Velocity > 0 means moving up (growing).
   */
  function pickSnapTarget(height, velocity) {
    const FLING_THRESHOLD = 0.4 // px/ms — about 400px/s
    const cur = currentSnapIdx.value
    if (velocity > FLING_THRESHOLD && cur < snapPoints.length - 1) {
      // Strong upward fling — snap one step higher than nearest
      return Math.min(cur + 1, snapPoints.length - 1)
    }
    if (velocity < -FLING_THRESHOLD && cur > 0) {
      return Math.max(cur - 1, 0)
    }
    // No strong fling — snap to nearest
    let bestIdx = 0
    let bestDist = Infinity
    snapPoints.forEach((p, i) => {
      const d = Math.abs(p - height)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    })
    return bestIdx
  }

  /**
   * Animate to specific snap. Triggered by drag-end and programmatically.
   */
  function snapTo(idx) {
    const newIdx = Math.max(0, Math.min(idx, snapPoints.length - 1))
    isAnimating.value = true
    currentHeight.value = snapPoints[newIdx]
    if (newIdx !== currentSnapIdx.value) {
      currentSnapIdx.value = newIdx
      onSnapChange?.(newIdx)
    }
    // Animation duration matches CSS transition; clear flag
    setTimeout(() => { isAnimating.value = false }, 250)
  }

  onUnmounted(() => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerUp)
  })

  return {
    currentSnapIdx,
    currentHeight,
    isDragging,
    isAnimating,
    contentScrollable,
    handlePointerDown,
    snapTo,
  }
}