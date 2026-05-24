import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { notesApi } from '@/api/notes'

/**
 * Notes store. Notes are private to the user, so we keep ALL of them
 * in memory (typical user has tens, not thousands).
 *
 * Filtering by scope/workplace/shift happens in getters, not via re-fetch.
 */
export const useNotesStore = defineStore('notes', () => {
  const items = ref([])
  const isLoading = ref(false)
  const error = ref(null)

  // === getters ===

  /** Sorted: pinned first, then updated_at desc. */
  const sorted = computed(() => {
    return [...items.value].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.updated_at - a.updated_at
    })
  })

  /** Active (non-archived) notes, sorted. */
  const active = computed(() => sorted.value.filter((n) => !n.is_archived))

  const archived = computed(() => sorted.value.filter((n) => n.is_archived))

  /** Filter helpers — return functions, components decide what to call. */
  function byScope(scope) {
    return active.value.filter((n) => n.scope === scope)
  }

  function byWorkplace(workplaceId) {
    return active.value.filter(
      (n) => n.workplace_id === workplaceId,
    )
  }

  function byShift(shiftId) {
    return active.value.filter((n) => n.shift_id === shiftId)
  }

  const totalCount = computed(() => active.value.length)
  const pinnedCount = computed(() => active.value.filter((n) => n.pinned).length)

  // === actions ===

  /**
   * Load all user notes. We pass include_archived=true so we have everything;
   * UI filters out archived by default, but lets users toggle them on.
   */
  async function fetchAll() {
    isLoading.value = true
    error.value = null
    try {
      items.value = await notesApi.list({ includeArchived: true, limit: 500 })
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function create(body) {
    const note = await notesApi.create(body)
    items.value.push(note)
    return note
  }

  async function update(id, patch) {
    const idx = items.value.findIndex((n) => n.id === id)
    if (idx < 0) return
    const prev = { ...items.value[idx] }
    items.value[idx] = { ...prev, ...patch }
    try {
      const updated = await notesApi.update(id, patch)
      items.value[idx] = updated
    } catch (e) {
      items.value[idx] = prev
      throw e
    }
  }

  async function togglePin(id) {
    const note = items.value.find((n) => n.id === id)
    if (!note) return
    return update(id, { pinned: !note.pinned })
  }

  async function toggleArchive(id) {
    const note = items.value.find((n) => n.id === id)
    if (!note) return
    return update(id, { is_archived: !note.is_archived })
  }

  async function remove(id) {
    await notesApi.remove(id)
    items.value = items.value.filter((n) => n.id !== id)
  }

  function reset() {
    items.value = []
    error.value = null
  }

  return {
    // state
    items, isLoading, error,
    // getters
    sorted, active, archived, totalCount, pinnedCount,
    byScope, byWorkplace, byShift,
    // actions
    fetchAll, create, update, togglePin, toggleArchive, remove, reset,
  }
})