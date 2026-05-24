import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { hallsApi, tablesApi, layoutsApi } from '@/api/halls'
import { clearHallViewport } from '@/utils/hallViewport'

/**
 * Hall store: halls + tables of the current workplace.
 *
 * The map is loaded as a tree (halls each containing tables) but flattened
 * here for O(1) lookups. activeHallId selects which hall is currently visible.
 *
 * Tables manipulation lives here too — but the editor decides WHEN to call.
 * In the working view, mutations are not exposed via the UI.
 */
export const useHallStore = defineStore('hall', () => {
  const halls = ref([])
  const tables = ref([])
  /**
   * Layouts (table arrangement templates) for the currently active hall.
   * Loaded lazily — only when the user opens the templates panel; reset
   * whenever the active hall changes.
   */
  const layouts = ref([])
  const activeHallId = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  // === getters ===

  const sortedHalls = computed(() =>
    [...halls.value].sort((a, b) => a.position - b.position),
  )

  const activeHall = computed(() =>
    halls.value.find((h) => h.id === activeHallId.value) ?? null,
  )

  const tablesOfActive = computed(() =>
    activeHallId.value
      ? tables.value.filter((t) => t.hall_id === activeHallId.value)
      : [],
  )

  function tablesOfHall(hallId) {
    return tables.value.filter((t) => t.hall_id === hallId)
  }

  function tableById(id) {
    return tables.value.find((t) => t.id === id) ?? null
  }

  function tableByOrder(orderId) {
    return tables.value.find((t) => t.order_id === orderId) ?? null
  }

  const isEmpty = computed(() => halls.value.length === 0)

  // === actions ===

  async function fetchAll(workplaceId) {
    if (!workplaceId) {
      reset()
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const tree = await hallsApi.listForWorkplace(workplaceId)
      halls.value = tree.map((h) => {
        const { tables: _t, ...hall } = h
        return hall
      })
      tables.value = tree.flatMap((h) => h.tables || [])

      // Preserve active selection if still valid; else pick first.
      if (
        activeHallId.value &&
        !halls.value.find((h) => h.id === activeHallId.value)
      ) {
        activeHallId.value = null
      }
      if (!activeHallId.value && sortedHalls.value.length > 0) {
        activeHallId.value = sortedHalls.value[0].id
      }
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function setActiveHall(id) {
    if (activeHallId.value !== id) {
      // Layouts are per-hall — reset so a stale list from the previous hall
      // doesn't briefly flash before the new fetch resolves.
      layouts.value = []
    }
    activeHallId.value = id
  }

  // ----- Halls CRUD -----

  async function createHall(workplaceId, body) {
    const hall = await hallsApi.create(workplaceId, body)
    const { tables: _t, ...rest } = hall
    halls.value.push(rest)
    if (!activeHallId.value) activeHallId.value = rest.id
    return rest
  }

  async function updateHall(id, patch) {
    const idx = halls.value.findIndex((h) => h.id === id)
    if (idx < 0) return
    const prev = { ...halls.value[idx] }
    halls.value[idx] = { ...prev, ...patch }
    try {
      const updated = await hallsApi.update(id, patch)
      const { tables: _t, ...rest } = updated
      halls.value[idx] = rest
    } catch (e) {
      halls.value[idx] = prev
      throw e
    }
  }

  async function removeHall(id) {
    await hallsApi.remove(id)
    halls.value = halls.value.filter((h) => h.id !== id)
    tables.value = tables.value.filter((t) => t.hall_id !== id)
    if (activeHallId.value === id) {
      activeHallId.value = sortedHalls.value[0]?.id ?? null
    }
    // Drop the persisted viewport so deleted halls don't accumulate as
    // dead entries in localStorage.
    clearHallViewport(id)
  }

  async function reorderHalls(workplaceId, ids) {
    const prev = [...halls.value]
    const byId = new Map(halls.value.map((h) => [h.id, h]))
    halls.value = ids.map((id, position) => {
      const h = byId.get(id)
      return h ? { ...h, position } : null
    }).filter(Boolean)
    try {
      await hallsApi.reorder(workplaceId, ids)
    } catch (e) {
      halls.value = prev
      throw e
    }
  }

  // ----- Tables CRUD -----

  async function createTable(hallId, body) {
    const table = await tablesApi.create(hallId, body)
    tables.value.push(table)
    return table
  }

  /**
   * Update table fields. Optimistic with rollback.
   * For drag-and-drop, the editor debounces calls before invoking this.
   */
  async function updateTable(id, patch) {
    const idx = tables.value.findIndex((t) => t.id === id)
    if (idx < 0) return
    const prev = { ...tables.value[idx] }
    tables.value[idx] = { ...prev, ...patch }
    try {
      const updated = await tablesApi.update(id, patch)
      tables.value[idx] = updated
    } catch (e) {
      tables.value[idx] = prev
      throw e
    }
  }

  /**
   * Local-only patch — used during drag for instant feedback;
   * the actual API call happens on dragend via updateTable().
   */
  function patchTableLocal(id, patch) {
    const idx = tables.value.findIndex((t) => t.id === id)
    if (idx < 0) return
    tables.value[idx] = { ...tables.value[idx], ...patch }
  }

  async function removeTable(id) {
    await tablesApi.remove(id)
    tables.value = tables.value.filter((t) => t.id !== id)
  }

  // ----- Layouts (templates) -----

  /**
   * Load layouts for a given hall. Cached in `layouts` ref until the
   * active hall changes; subsequent calls are cheap re-fetches.
   */
  async function fetchLayouts(hallId) {
    const result = await layoutsApi.listForHall(hallId)
    layouts.value = result
    return result
  }

  /**
   * Save the current arrangement as a new template. The mock/backend
   * snapshots positions from live tables; we just supply id + name.
   */
  async function createLayout(hallId, { id, name }) {
    const layout = await layoutsApi.create(hallId, { id, name })
    layouts.value = [...layouts.value, layout]
    return layout
  }

  async function renameLayout(layoutId, name) {
    const updated = await layoutsApi.update(layoutId, { name })
    layouts.value = layouts.value.map((l) => (l.id === layoutId ? updated : l))
    return updated
  }

  async function removeLayout(layoutId) {
    await layoutsApi.remove(layoutId)
    layouts.value = layouts.value.filter((l) => l.id !== layoutId)
  }

  /**
   * Apply a layout. Returns a summary { moved, created, kept_extras,
   * deleted_extras } that the caller (HallEditorView) uses to:
   *   - pulse the affected tables
   *   - show a toast if any extras were kept due to active orders
   *
   * After apply we refetch `tables` for the hall so local state matches
   * the server's view (positions, new tables, removals).
   */
  async function applyLayout(layoutId, opts = {}) {
    const summary = await layoutsApi.apply(layoutId, opts)
    // Re-pull tables for the active hall so positions / creates / deletes
    // all reflect in local state. We do this via the full hall tree to
    // reuse `fetchAll`'s shape parsing.
    const active = halls.value.find((h) => h.id === activeHallId.value)
    if (active) {
      await fetchAll(active.workplace_id)
    }
    return summary
  }

  function reset() {
    halls.value = []
    tables.value = []
    layouts.value = []
    activeHallId.value = null
    error.value = null
  }

  return {
    // state
    halls, tables, layouts, activeHallId, isLoading, error,
    // getters
    sortedHalls, activeHall, tablesOfActive, isEmpty,
    tablesOfHall, tableById, tableByOrder,
    // actions
    fetchAll, setActiveHall,
    createHall, updateHall, removeHall, reorderHalls,
    createTable, updateTable, patchTableLocal, removeTable,
    fetchLayouts, createLayout, renameLayout, removeLayout, applyLayout,
    reset,
  }
})