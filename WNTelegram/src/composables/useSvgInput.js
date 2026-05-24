import { ref, onUnmounted } from 'vue'

/**
 * Pointer-events based interaction handler for SVG-based editors.
 *
 * Inputs:
 *   - svgRef: ref to the <svg> element
 *   - getViewBox: () => { x, y, w, h } — current viewBox in SVG coords
 *   - callbacks: see below
 *
 * Callbacks (any may be omitted):
 *   onTableDragStart(tableId, svgPoint)
 *   onTableDragMove(tableId, deltaSvg, currentSvg)
 *   onTableDragEnd(tableId)
 *   onPan(deltaSvg)            -- delta from previous frame (rAF throttled)
 *   onPanEnd()
 *   onPinch({ scale, centerSvg })  -- continuous, scale relative to gesture start
 *   onPinchEnd({ scale })          -- final scale; consumer decides snap
 *   onTableTap(tableId)
 *   onCanvasTap(svgPoint)
 *
 * Key correctness trick: pan and pinch math uses a snapshot of the viewBox
 * taken at gesture start. The consumer is expected to mutate the viewBox in
 * response to our callbacks, so re-reading the viewBox each frame would
 * compound errors. Instead, we always convert client-pixel deltas through the
 * snapshot, giving stable kinematics regardless of consumer state changes.
 */
const TAP_THRESHOLD = 5 // pixels

export function useSvgInput({ svgRef, getViewBox, callbacks = {} }) {
  const pointers = new Map()

  // Drag state for tables (single pointer past threshold).
  let activeDrag = null // { tableId, startSvg, lastSvg }

  // Pan state: snapshot of viewBox + last client position to compute deltas.
  let panState = null // { lastClientX, lastClientY, vbAtStart }

  // Pinch state: snapshot of distance, midpoint, and viewBox at gesture start.
  let pinchState = null // { startDist, midSvg, vbAtStart }

  // rAF throttling
  let rafScheduled = false
  let pendingPanDelta = null
  let pendingDragSvg = null
  let pendingPinch = null

  function clientToSvg(clientX, clientY, vb = null) {
    const svg = svgRef.value
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    const box = vb || getViewBox()
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return {
      x: box.x + ((clientX - rect.left) / rect.width) * box.w,
      y: box.y + ((clientY - rect.top) / rect.height) * box.h,
    }
  }

  /**
   * Convert a client-pixel delta to SVG units, given a viewBox snapshot.
   * Critically, uses the snapshot, not getViewBox(), to keep math stable.
   */
  function clientDeltaToSvg(dx, dy, vb) {
    const svg = svgRef.value
    if (!svg) return { x: 0, y: 0 }
    const rect = svg.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return {
      x: (dx / rect.width) * vb.w,
      y: (dy / rect.height) * vb.h,
    }
  }

  function dist(p1, p2) {
    const dx = p1.x - p2.x
    const dy = p1.y - p2.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  function flushFrame() {
    rafScheduled = false

    if (pendingPanDelta && callbacks.onPan) {
      const d = pendingPanDelta
      pendingPanDelta = null
      callbacks.onPan(d)
    }

    if (activeDrag && pendingDragSvg && callbacks.onTableDragMove) {
      const delta = {
        x: pendingDragSvg.x - activeDrag.startSvg.x,
        y: pendingDragSvg.y - activeDrag.startSvg.y,
      }
      callbacks.onTableDragMove(activeDrag.tableId, delta, pendingDragSvg)
      pendingDragSvg = null
    }

    if (pendingPinch && callbacks.onPinch) {
      callbacks.onPinch(pendingPinch)
      pendingPinch = null
    }
  }

  function scheduleFrame() {
    if (!rafScheduled) {
      rafScheduled = true
      requestAnimationFrame(flushFrame)
    }
  }

  // ---- pointer down ----

  function handlePointerDownTable(e, tableId) {
    e.stopPropagation()
    if (e.button !== undefined && e.button !== 0) return

    const svgPoint = clientToSvg(e.clientX, e.clientY)
    pointers.set(e.pointerId, {
      id: e.pointerId,
      type: 'table',
      tableId,
      startClient: { x: e.clientX, y: e.clientY },
      startSvg: svgPoint,
      lastClient: { x: e.clientX, y: e.clientY },
      moved: false,
    })

    if (pointers.size === 2) {
      startPinch()
    }

    e.target.setPointerCapture?.(e.pointerId)
    bindGlobal()
  }

  function handlePointerDownEmpty(e) {
    if (e.button !== undefined && e.button !== 0) return

    const svgPoint = clientToSvg(e.clientX, e.clientY)
    pointers.set(e.pointerId, {
      id: e.pointerId,
      type: 'empty',
      startClient: { x: e.clientX, y: e.clientY },
      startSvg: svgPoint,
      lastClient: { x: e.clientX, y: e.clientY },
      moved: false,
    })

    if (pointers.size === 2) {
      startPinch()
    } else {
      panState = {
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        vbAtStart: { ...getViewBox() },
      }
    }

    bindGlobal()
  }

  function startPinch() {
    if (activeDrag && callbacks.onTableDragEnd) {
      callbacks.onTableDragEnd(activeDrag.tableId)
    }
    activeDrag = null
    pendingDragSvg = null
    panState = null
    pendingPanDelta = null

    const arr = [...pointers.values()]
    const a = arr[0], b = arr[1]
    const vbAtStart = { ...getViewBox() }
    const startDist = dist(a.lastClient, b.lastClient)
    const midClient = {
      x: (a.lastClient.x + b.lastClient.x) / 2,
      y: (a.lastClient.y + b.lastClient.y) / 2,
    }
    const midSvg = clientToSvg(midClient.x, midClient.y, vbAtStart)
    pinchState = { startDist, midSvg, vbAtStart }
  }

  // ---- pointer move ----

  function handlePointerMove(e) {
    const p = pointers.get(e.pointerId)
    if (!p) return
    p.lastClient = { x: e.clientX, y: e.clientY }

    const dx = p.lastClient.x - p.startClient.x
    const dy = p.lastClient.y - p.startClient.y
    if (Math.abs(dx) > TAP_THRESHOLD || Math.abs(dy) > TAP_THRESHOLD) {
      p.moved = true
    }

    // PINCH (2 pointers)
    if (pointers.size >= 2 && pinchState) {
      const arr = [...pointers.values()]
      const a = arr[0], b = arr[1]
      const curDist = dist(a.lastClient, b.lastClient)
      if (pinchState.startDist > 0) {
        pendingPinch = {
          scale: curDist / pinchState.startDist,
          centerSvg: pinchState.midSvg,
        }
        scheduleFrame()
      }
      return
    }

    if (pointers.size !== 1) return
    const cur = pointers.values().next().value
    if (cur.id !== e.pointerId) return

    if (cur.type === 'table' && cur.moved) {
      // Drag table — translate current screen position to SVG via current viewBox.
      // The consumer should not be moving viewBox during drag, so this is stable.
      const curSvg = clientToSvg(cur.lastClient.x, cur.lastClient.y)
      if (!activeDrag) {
        activeDrag = { tableId: cur.tableId, startSvg: cur.startSvg, lastSvg: curSvg }
        if (callbacks.onTableDragStart) {
          callbacks.onTableDragStart(cur.tableId, cur.startSvg)
        }
      }
      activeDrag.lastSvg = curSvg
      pendingDragSvg = curSvg
      scheduleFrame()
      return
    }

    if (cur.type === 'empty' && cur.moved) {
      // Pan — frame-to-frame client delta, converted through stable viewBox.
      if (!panState) {
        panState = {
          lastClientX: cur.lastClient.x,
          lastClientY: cur.lastClient.y,
          vbAtStart: { ...getViewBox() },
        }
        return
      }
      const dxClient = cur.lastClient.x - panState.lastClientX
      const dyClient = cur.lastClient.y - panState.lastClientY
      panState.lastClientX = cur.lastClient.x
      panState.lastClientY = cur.lastClient.y

      const deltaSvg = clientDeltaToSvg(dxClient, dyClient, panState.vbAtStart)
      if (pendingPanDelta) {
        pendingPanDelta.x += deltaSvg.x
        pendingPanDelta.y += deltaSvg.y
      } else {
        pendingPanDelta = deltaSvg
      }
      scheduleFrame()
    }
  }

  // ---- pointer up / cancel ----

  function handlePointerUp(e) {
    const p = pointers.get(e.pointerId)
    if (!p) return
    pointers.delete(e.pointerId)

    if (pinchState && pointers.size < 2) {
      const finalScale = pendingPinch?.scale ?? 1
      pinchState = null
      pendingPinch = null
      if (callbacks.onPinchEnd) callbacks.onPinchEnd({ scale: finalScale })

      // If a finger remains, rebase it as a fresh start so subsequent moves
      // don't jump. Crucially, mark it as already-moved so its pointerup
      // doesn't fire as a phantom tap (which would, e.g., open a table edit
      // panel when the user just finished pinching to zoom).
      if (pointers.size === 1) {
        const remaining = pointers.values().next().value
        remaining.startClient = { ...remaining.lastClient }
        remaining.startSvg = clientToSvg(remaining.lastClient.x, remaining.lastClient.y)
        remaining.moved = true
        if (remaining.type === 'empty') {
          panState = {
            lastClientX: remaining.lastClient.x,
            lastClientY: remaining.lastClient.y,
            vbAtStart: { ...getViewBox() },
          }
        }
      }
      maybeUnbindGlobal()
      return
    }

    if (pointers.size === 0) {
      if (!p.moved) {
        if (p.type === 'table' && callbacks.onTableTap) {
          callbacks.onTableTap(p.tableId)
        } else if (p.type === 'empty' && callbacks.onCanvasTap) {
          callbacks.onCanvasTap(p.startSvg)
        }
      } else if (activeDrag) {
        if (callbacks.onTableDragEnd) callbacks.onTableDragEnd(activeDrag.tableId)
        activeDrag = null
        pendingDragSvg = null
      } else if (p.type === 'empty') {
        if (callbacks.onPanEnd) callbacks.onPanEnd()
        panState = null
      }
    }

    maybeUnbindGlobal()
  }

  function handlePointerCancel(e) {
    const p = pointers.get(e.pointerId)
    if (!p) return
    pointers.delete(e.pointerId)

    if (activeDrag) {
      if (callbacks.onTableDragEnd) callbacks.onTableDragEnd(activeDrag.tableId)
      activeDrag = null
      pendingDragSvg = null
    }
    if (pinchState) {
      pinchState = null
      pendingPinch = null
      if (callbacks.onPinchEnd) callbacks.onPinchEnd({ scale: 1 })
    }
    panState = null
    pendingPanDelta = null
    maybeUnbindGlobal()
  }

  // ---- global event binding ----

  let bound = false
  function bindGlobal() {
    if (bound) return
    window.addEventListener('pointermove', handlePointerMove, { passive: false })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    bound = true
  }

  function maybeUnbindGlobal() {
    if (pointers.size > 0) return
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerCancel)
    bound = false
  }

  onUnmounted(() => {
    maybeUnbindGlobal()
  })

  return {
    handlePointerDownTable,
    handlePointerDownEmpty,
    clientToSvg,
  }
}