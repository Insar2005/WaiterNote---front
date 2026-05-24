import { ref, computed } from 'vue'

/**
 * Generic undo/redo stack for editor-like screens.
 *
 * Each operation is an object: { label, undo, redo }.
 *   - `label` is shown in UI ("undo: move table").
 *   - `redo` (re)applies the change. We don't auto-call it on push() —
 *     the caller is expected to have already done the action; push()
 *     just records the inverse so it can be undone.
 *   - `undo` reverses what was done.
 *
 * Both undo() and redo() can be async; they're awaited.
 *
 * Limit (default 50) prevents unbounded memory growth.
 */
export function useUndoStack({ limit = 50 } = {}) {
  const undoStack = ref([])
  const redoStack = ref([])
  const isApplying = ref(false)

  const canUndo = computed(() => undoStack.value.length > 0 && !isApplying.value)
  const canRedo = computed(() => redoStack.value.length > 0 && !isApplying.value)

  /**
   * Record an operation that has just been performed.
   * Clears redo stack (a new branch starts).
   */
  function push(op) {
    undoStack.value.push(op)
    if (undoStack.value.length > limit) {
      undoStack.value.shift()
    }
    redoStack.value = []
  }

  async function undo() {
    if (!canUndo.value) return
    const op = undoStack.value.pop()
    isApplying.value = true
    try {
      await op.undo()
      redoStack.value.push(op)
    } catch (e) {
      // If undo failed, put it back so user can try again.
      undoStack.value.push(op)
      throw e
    } finally {
      isApplying.value = false
    }
  }

  async function redo() {
    if (!canRedo.value) return
    const op = redoStack.value.pop()
    isApplying.value = true
    try {
      await op.redo()
      undoStack.value.push(op)
    } catch (e) {
      redoStack.value.push(op)
      throw e
    } finally {
      isApplying.value = false
    }
  }

  function clear() {
    undoStack.value = []
    redoStack.value = []
  }

  return { undoStack, redoStack, canUndo, canRedo, push, undo, redo, clear }
}