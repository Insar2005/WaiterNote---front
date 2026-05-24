import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { workplacesApi } from '@/api/workplaces'
import { useAuthStore } from './auth'

/**
 * Workplace store: list + current selected workplace.
 *
 * `currentId` change is the trigger for downstream stores to reload.
 * App.vue watches this and calls hallStore.fetchAll() / menuStore.fetchAll() etc.
 */
export const useWorkplaceStore = defineStore('workplace', () => {
  const items = ref([])
  const currentId = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  // === getters ===

  const current = computed(() =>
    items.value.find((w) => w.id === currentId.value) ?? null,
  )

  const activeList = computed(() =>
    [...items.value]
      .filter((w) => !w.is_archived)
      .sort((a, b) => a.position - b.position),
  )

  const archivedList = computed(() => items.value.filter((w) => w.is_archived))

  const isEmpty = computed(() => items.value.length === 0)

  // Convenience proxies — components don't have to drill into `current`
  const currency = computed(() => current.value?.currency ?? 'RUB')
  const timezone = computed(() => current.value?.timezone ?? 'Europe/Moscow')
  const serviceDefault = computed(() => current.value?.service_percent_default ?? 0)
  const shiftTypeDefault = computed(() => current.value?.shift_type_default ?? 'fixed')
  const payDefault = computed(() => current.value?.pay_for_shift_default ?? 0)
  const isCurrentOwner = computed(() => current.value?.my_role === 'owner')

  // === actions ===

  /** Load all workplaces and pick the "current" one. */
  async function fetchAll({ includeArchived = false } = {}) {
    isLoading.value = true
    error.value = null
    try {
      items.value = await workplacesApi.list({ includeArchived })

      // Pick current: prefer last_workplace_id from auth, else first active.
      const auth = useAuthStore()
      const lastId = auth.lastWorkplaceId
      const candidate =
        (lastId && items.value.find((w) => w.id === lastId && !w.is_archived)) ||
        activeList.value[0] ||
        null
      currentId.value = candidate ? candidate.id : null
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /** Switch current workplace. Triggers downstream reload via watcher in App.vue. */
  async function setCurrent(id) {
    if (id === currentId.value) return
    const wp = items.value.find((w) => w.id === id)
    if (!wp) throw new Error('workplace not in store')

    const prev = currentId.value
    currentId.value = id
    try {
      await workplacesApi.select(id)
      useAuthStore().setLastWorkplaceLocal(id)
    } catch (e) {
      currentId.value = prev
      throw e
    }
  }

  /** Create new workplace. On success, becomes current. */
  async function create(body) {
    const wp = await workplacesApi.create(body)
    items.value.push(wp)
    currentId.value = wp.id
    useAuthStore().setLastWorkplaceLocal(wp.id)
    return wp
  }

  /** Update fields. Optimistic with rollback. */
  async function update(id, patch) {
    const idx = items.value.findIndex((w) => w.id === id)
    if (idx < 0) return
    const prev = { ...items.value[idx] }
    items.value[idx] = { ...prev, ...patch }
    try {
      const updated = await workplacesApi.update(id, patch)
      items.value[idx] = updated
    } catch (e) {
      items.value[idx] = prev
      throw e
    }
  }

  async function archive(id) {
    const updated = await workplacesApi.archive(id)
    const idx = items.value.findIndex((w) => w.id === id)
    if (idx >= 0) items.value[idx] = updated
    // If we archived the current one, move to the first active
    if (currentId.value === id) {
      const next = activeList.value[0] || null
      currentId.value = next ? next.id : null
    }
    return updated
  }

  async function unarchive(id) {
    const updated = await workplacesApi.unarchive(id)
    const idx = items.value.findIndex((w) => w.id === id)
    if (idx >= 0) items.value[idx] = updated
    return updated
  }

  async function remove(id) {
    await workplacesApi.remove(id)
    items.value = items.value.filter((w) => w.id !== id)
    if (currentId.value === id) {
      const next = activeList.value[0] || null
      currentId.value = next ? next.id : null
    }
  }

  async function reorder(ids) {
    // Optimistic: apply order locally, then sync.
    const prev = [...items.value]
    const byId = new Map(items.value.map((w) => [w.id, w]))
    items.value = ids.map((id, position) => {
      const w = byId.get(id)
      return w ? { ...w, position } : null
    }).filter(Boolean)
    // append unaffected ones (e.g. archived not in `ids`)
    for (const w of prev) {
      if (!items.value.find((x) => x.id === w.id)) items.value.push(w)
    }
    try {
      await workplacesApi.reorder(ids)
    } catch (e) {
      items.value = prev
      throw e
    }
  }

  function reset() {
    items.value = []
    currentId.value = null
    error.value = null
  }

  return {
    // state
    items, currentId, isLoading, error,
    // getters
    current, activeList, archivedList, isEmpty,
    currency, timezone, serviceDefault, shiftTypeDefault, payDefault,
    isCurrentOwner,
    // actions
    fetchAll, setCurrent, create, update, archive, unarchive, remove, reorder, reset,
  }
})