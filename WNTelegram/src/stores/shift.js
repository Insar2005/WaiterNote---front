import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { shiftsApi } from '@/api/shifts'

/**
 * Shift store: currently-open shift + history.
 *
 * `current` is the open shift in the user's *currently selected* workplace.
 * It's reloaded by App.vue's watcher when workplace.currentId changes.
 */
export const useShiftStore = defineStore('shift', () => {
  const current = ref(null) // open shift or null
  const history = ref([])
  const isLoading = ref(false)
  const isLoadingHistory = ref(false)
  const error = ref(null)

  // Pagination state for history
  const historyOffset = ref(0)
  const historyHasMore = ref(true)
  const HISTORY_PAGE_SIZE = 30

  // === getters ===

  const isOpen = computed(() => !!current.value && !current.value.is_closed)

  const canTakeOrders = computed(() => isOpen.value)

  /** Estimated earnings for fixed shift type (= base pay). */
  const baseEarnings = computed(() => current.value?.pay_for_shift ?? 0)

  /** Tips collected so far. */
  const tipsSoFar = computed(() => current.value?.total_tips ?? 0)

  /** Total cash through the till (paid orders sum). */
  const cashRegister = computed(() => current.value?.total_cash_register ?? 0)

  /** Computed wage for current shift. */
  const wageSoFar = computed(() => current.value?.total_pay_for_shift ?? 0)

  /** Order count (paid only — matches backend recompute). */
  const paidOrderCount = computed(() => current.value?.order_count ?? 0)

  // === actions ===

  /** Load currently-open shift in the workplace. */
  async function fetchCurrent(workplaceId) {
    if (!workplaceId) {
      current.value = null
      return
    }
    isLoading.value = true
    error.value = null
    try {
      current.value = await shiftsApi.getCurrent(workplaceId)
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Load (or reload) shift history with pagination.
   * Pass reset=true to start over (after closing a shift, switching workplace, etc).
   */
  async function fetchHistory(workplaceId, { reset = false } = {}) {
    if (!workplaceId) {
      history.value = []
      historyOffset.value = 0
      historyHasMore.value = false
      return
    }
    if (reset) {
      historyOffset.value = 0
      historyHasMore.value = true
      history.value = []
    }
    if (!historyHasMore.value || isLoadingHistory.value) return

    isLoadingHistory.value = true
    try {
      const page = await shiftsApi.list(workplaceId, {
        limit: HISTORY_PAGE_SIZE,
        offset: historyOffset.value,
        onlyMine: true,
        closedOnly: true,
      })
      history.value = [...history.value, ...page]
      historyOffset.value += page.length
      historyHasMore.value = page.length === HISTORY_PAGE_SIZE
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoadingHistory.value = false
    }
  }

  /** Open a new shift in the workplace. */
  async function open(workplaceId, body) {
    const shift = await shiftsApi.open(workplaceId, body)
    current.value = shift
    return shift
  }

  /**
   * Close current (or specified) shift. After successful close:
   *  - current becomes null
   *  - the closed shift is prepended to history
   */
  async function close(shiftId, { force = false } = {}) {
    const closed = await shiftsApi.close(shiftId, { force })
    if (current.value?.id === shiftId) {
      current.value = null
    }
    history.value = [closed, ...history.value.filter((s) => s.id !== shiftId)]
    return closed
  }

  /** Force aggregate recompute. Useful if numbers look wrong. */
  async function recompute(shiftId) {
    const updated = await shiftsApi.recompute(shiftId)
    if (current.value?.id === shiftId) {
      current.value = updated
    } else {
      const idx = history.value.findIndex((s) => s.id === shiftId)
      if (idx >= 0) history.value[idx] = updated
    }
    return updated
  }

  async function remove(shiftId) {
    await shiftsApi.remove(shiftId)
    history.value = history.value.filter((s) => s.id !== shiftId)
    if (current.value?.id === shiftId) current.value = null
  }

  /**
   * Locally update aggregate fields on current shift after orders change.
   * Called by orderStore after pay/delete to keep dashboard live without re-fetch.
   * For correctness, prefer recompute() on critical operations.
   */
  function patchCurrentAggregates(patch) {
    if (!current.value) return
    current.value = { ...current.value, ...patch }
  }

  function reset() {
    current.value = null
    history.value = []
    historyOffset.value = 0
    historyHasMore.value = true
    error.value = null
  }

  return {
    // state
    current, history, isLoading, isLoadingHistory, error,
    historyHasMore,
    // getters
    isOpen, canTakeOrders,
    baseEarnings, tipsSoFar, cashRegister, wageSoFar, paidOrderCount,
    // actions
    fetchCurrent, fetchHistory, open, close, recompute, remove,
    patchCurrentAggregates, reset,
  }
})