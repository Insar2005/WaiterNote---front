import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { menuApi } from '@/api/menu'

/**
 * Menu store: categories + items for the current workplace.
 * Tree is loaded once via getTree(); single-entity mutations update locally.
 */
export const useMenuStore = defineStore('menu', () => {
  /**
   * Categories list. Each carries `items: []` from the tree response.
   * We flatten: store separately to make per-item lookups O(1).
   */
  const categories = ref([])
  const items = ref([])

  const isLoading = ref(false)
  const error = ref(null)

  /** Currently-selected category id in the editor UI. */
  const selectedCategoryId = ref(null)

  // === getters ===

  const allCategories = computed(() =>
    [...categories.value].sort((a, b) => a.position - b.position),
  )

  const activeCategories = computed(() =>
    allCategories.value.filter((c) => c.is_active),
  )

  const categoryById = computed(() => (id) =>
    categories.value.find((c) => c.id === id) ?? null,
  )

  const itemsByCategory = computed(() => (categoryId) =>
    [...items.value]
      .filter((i) => i.category_id === categoryId)
      .sort((a, b) => a.position - b.position),
  )

  const itemById = computed(() => (id) =>
    items.value.find((i) => i.id === id) ?? null,
  )

  const totalItemCount = computed(() => items.value.length)

  /** Items of the currently-selected category. */
  const selectedItems = computed(() =>
    selectedCategoryId.value
      ? itemsByCategory.value(selectedCategoryId.value)
      : [],
  )

  /** Selected category object. */
  const selectedCategory = computed(() =>
    selectedCategoryId.value ? categoryById.value(selectedCategoryId.value) : null,
  )

  // === actions ===

  async function fetchAll(workplaceId, { activeOnly = false } = {}) {
    if (!workplaceId) {
      reset()
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const tree = await menuApi.getTree(workplaceId, { activeOnly })
      categories.value = tree.map((c) => {
        const { items: _items, ...cat } = c
        return cat
      })
      items.value = tree.flatMap((c) => c.items || [])

      // Preserve selection if still valid; else pick first.
      if (
        selectedCategoryId.value &&
        !categories.value.find((c) => c.id === selectedCategoryId.value)
      ) {
        selectedCategoryId.value = null
      }
      if (!selectedCategoryId.value && allCategories.value.length > 0) {
        selectedCategoryId.value = allCategories.value[0].id
      }
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  function selectCategory(id) {
    selectedCategoryId.value = id
  }

  // ----- Categories -----

  async function createCategory(workplaceId, body) {
    const cat = await menuApi.createCategory(workplaceId, body)
    // backend returns category with `items: []`; strip
    const { items: _items, ...rest } = cat
    categories.value.push(rest)
    if (!selectedCategoryId.value) selectedCategoryId.value = rest.id
    return rest
  }

  async function updateCategory(id, patch) {
    const idx = categories.value.findIndex((c) => c.id === id)
    if (idx < 0) return
    const prev = { ...categories.value[idx] }
    categories.value[idx] = { ...prev, ...patch }
    try {
      const updated = await menuApi.updateCategory(id, patch)
      const { items: _items, ...rest } = updated
      categories.value[idx] = rest
    } catch (e) {
      categories.value[idx] = prev
      throw e
    }
  }

  async function removeCategory(id) {
    await menuApi.removeCategory(id)
    categories.value = categories.value.filter((c) => c.id !== id)
    items.value = items.value.filter((i) => i.category_id !== id)
    if (selectedCategoryId.value === id) {
      selectedCategoryId.value = allCategories.value[0]?.id ?? null
    }
  }

  async function reorderCategories(workplaceId, ids) {
    const prev = [...categories.value]
    const byId = new Map(categories.value.map((c) => [c.id, c]))
    categories.value = ids.map((id, position) => {
      const c = byId.get(id)
      return c ? { ...c, position } : null
    }).filter(Boolean)
    try {
      await menuApi.reorderCategories(workplaceId, ids)
    } catch (e) {
      categories.value = prev
      throw e
    }
  }

  // ----- Items -----

  async function createItem(categoryId, body) {
    const item = await menuApi.createItem(categoryId, body)
    items.value.push(item)
    return item
  }

  async function updateItem(id, patch) {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx < 0) return
    const prev = { ...items.value[idx] }
    items.value[idx] = { ...prev, ...patch }
    try {
      const updated = await menuApi.updateItem(id, patch)
      items.value[idx] = updated
    } catch (e) {
      items.value[idx] = prev
      throw e
    }
  }

  async function removeItem(id) {
    await menuApi.removeItem(id)
    items.value = items.value.filter((i) => i.id !== id)
  }

  async function reorderItems(categoryId, ids) {
    const prev = [...items.value]
    const byId = new Map(items.value.map((i) => [i.id, i]))
    const others = items.value.filter((i) => i.category_id !== categoryId)
    const reordered = ids.map((id, position) => {
      const i = byId.get(id)
      return i ? { ...i, position } : null
    }).filter(Boolean)
    items.value = [...others, ...reordered]
    try {
      await menuApi.reorderItems(categoryId, ids)
    } catch (e) {
      items.value = prev
      throw e
    }
  }

  /**
   * Search across all items by title (case-insensitive). Used by editor & OrderBuilder.
   */
  function searchItems(query) {
    const q = (query || '').trim().toLowerCase()
    if (!q) return []
    return items.value
      .filter((i) => i.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  function reset() {
    categories.value = []
    items.value = []
    selectedCategoryId.value = null
    error.value = null
  }

  return {
    // state
    categories, items, isLoading, error, selectedCategoryId,
    // getters
    allCategories, activeCategories, categoryById,
    itemsByCategory, itemById, totalItemCount,
    selectedCategory, selectedItems,
    // actions
    fetchAll, selectCategory,
    createCategory, updateCategory, removeCategory, reorderCategories,
    createItem, updateItem, removeItem, reorderItems,
    searchItems, reset,
  }
})