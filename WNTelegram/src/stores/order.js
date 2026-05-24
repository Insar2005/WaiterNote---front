import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ordersApi } from '@/api/orders'
import { newId } from '@/utils/nanoid'
import { useShiftStore } from './shift'
import { useHallStore } from './hall'

/**
 * Order store: orders of the current shift + cart draft.
 *
 * The cart (draft) is a single in-memory object built by OrderBuilder.
 * It survives navigation but is cleared when the shift closes / workplace switches.
 *
 * Persistence: survives reload via localStorage key derived from shift_id,
 * so reopening the app continues the cart you were filling.
 */
const DRAFT_STORAGE_KEY = 'waiter-note:cart-draft'

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function persistDraft(draft) {
  try {
    if (draft) {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
    } else {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  } catch {
    /* quota exceeded — drop silently */
  }
}

export const useOrderStore = defineStore('order', () => {
  // === Server state ===
  const orders = ref([]) // orders of the *current* shift, with items
  const isLoading = ref(false)
  const error = ref(null)

  // === Cart draft ===
  // Shape: { tableId, hallId, items: [{ id, menu_item_id, title, price, quantity, comment }], comments }
  const draft = ref(loadDraft())

  // === getters: orders ===

  const activeOrders = computed(() => orders.value.filter((o) => !o.is_paid))
  const paidOrders = computed(() => orders.value.filter((o) => o.is_paid))

  /** Order currently attached to a specific table (active only). */
  function orderByTable(tableId) {
    return activeOrders.value.find((o) => o.table_id === tableId) || null
  }

  function orderById(id) {
    return orders.value.find((o) => o.id === id) || null
  }

  /** Sum of total_price across active orders (live aggregate). */
  const activeRevenue = computed(() =>
    activeOrders.value.reduce((s, o) => s + (o.total_price || 0), 0),
  )

  // === getters: draft ===

  const draftIsEmpty = computed(
    () => !draft.value || draft.value.items.length === 0,
  )

  const draftItemCount = computed(() =>
    draft.value
      ? draft.value.items.reduce((s, i) => s + i.quantity, 0)
      : 0,
  )

  const draftTotal = computed(() =>
    draft.value
      ? draft.value.items.reduce((s, i) => s + i.price * i.quantity, 0)
      : 0,
  )

  /**
   * Quantity of a specific menu item in the draft (for badges on menu cards).
   * Multiple draft entries with same menu_item_id are summed.
   */
  function draftQuantityOfMenuItem(menuItemId) {
    if (!draft.value) return 0
    return draft.value.items
      .filter((i) => i.menu_item_id === menuItemId)
      .reduce((s, i) => s + i.quantity, 0)
  }

  // === actions: server ===

  async function fetchForCurrentShift() {
    const shift = useShiftStore()
    if (!shift.current?.id) {
      orders.value = []
      return
    }
    isLoading.value = true
    error.value = null
    try {
      orders.value = await ordersApi.listForShift(shift.current.id)
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Submit the draft as a new order in the current shift.
   * On success: clears draft, prepends order to list, updates table/shift caches.
   */
  async function submitDraft({ workplaceId }) {
    if (!draft.value || draft.value.items.length === 0) {
      throw new Error('Корзина пуста')
    }
    const body = {
      id: newId(),
      table_id: draft.value.tableId,
      comments: draft.value.comments || null,
      items: draft.value.items.map((i) => ({
        id: newId(),
        menu_item_id: i.menu_item_id,
        title: i.title,
        price: i.price,
        quantity: i.quantity,
        comment: i.comment || null,
      })),
    }
    const order = await ordersApi.createInCurrentShift(workplaceId, body)
    orders.value = [order, ...orders.value]
    syncTableCache(order)
    clearDraft()
    return order
  }

  /**
   * Update Hall store cache: when an order is created/moved/paid, the
   * table's order_id and status need to match. Backend mocks already do this,
   * but our local cache might be stale.
   *
   * Status policy (mirrors mocks/handlers.js `recomputeTableStatusForOrder`):
   *   - No items / some items not served → "waiting" (yellow)
   *   - All items served                 → "occupied" (red, ready to pay)
   * Newly-created or moved orders have items with `served=false` by default,
   * so they always start as "waiting".
   */
  function syncTableCache(order) {
    const hall = useHallStore()
    if (order.table_id) {
      const t = hall.tableById(order.table_id)
      if (t) {
        const items = order.items || []
        const allServed = items.length > 0 && items.every((i) => i.served)
        hall.patchTableLocal(t.id, {
          order_id: order.id,
          status: allServed ? 'occupied' : 'waiting',
        })
      }
    }
  }

  function syncTableCacheCleared(orderId, tableId) {
    if (!tableId) return
    const hall = useHallStore()
    const t = hall.tableById(tableId)
    if (t && t.order_id === orderId) {
      hall.patchTableLocal(t.id, { order_id: null, status: 'free' })
    }
  }

  async function addItemsToOrder(orderId, items) {
    const newItems = items.map((i) => ({
      id: newId(),
      menu_item_id: i.menu_item_id,
      title: i.title,
      price: i.price,
      quantity: i.quantity,
      comment: i.comment || null,
    }))
    const updated = await ordersApi.addItems(orderId, newItems)
    replaceLocal(updated)
    syncTableCache(updated)
    return updated
  }

  async function updateOrderItem(itemId, patch) {
    const updated = await ordersApi.updateItem(itemId, patch)
    replaceLocal(updated)
    return updated
  }

  /**
   * Toggle the "served" flag on a single line item. Uses an optimistic
   * update so the checkbox feels instant on tap; on server failure we
   * revert the local state and surface the error to the caller.
   */
  async function toggleItemServed(orderId, itemId) {
    const ord = orderById(orderId)
    if (!ord) return null
    const item = (ord.items || []).find((i) => i.id === itemId)
    if (!item) return null

    const prev = !!item.served
    const next = !prev

    // Optimistic local flip
    item.served = next

    try {
      const updated = await ordersApi.updateItem(itemId, { served: next })
      replaceLocal(updated)
      return updated
    } catch (e) {
      // Revert on failure
      item.served = prev
      throw e
    }
  }

  async function removeOrderItem(itemId) {
    const updated = await ordersApi.removeItem(itemId)
    replaceLocal(updated)
    return updated
  }

  async function moveOrder(orderId, newTableId) {
    const order = orderById(orderId)
    const prevTableId = order?.table_id || null
    const updated = await ordersApi.move(orderId, newTableId)
    replaceLocal(updated)
    // Free the previous table if changed
    if (prevTableId && prevTableId !== newTableId) {
      syncTableCacheCleared(orderId, prevTableId)
    }
    syncTableCache(updated)
    return updated
  }

  async function payOrder(orderId, { tips = 0 } = {}) {
    const updated = await ordersApi.pay(orderId, { tips })
    const tableId = updated.table_id
    replaceLocal(updated)
    syncTableCacheCleared(orderId, tableId)

    // Update shift aggregates from updated order's shift (we don't have it
    // directly, but recompute can be triggered or we can re-fetch shift).
    // Cheapest: re-fetch current shift so dashboard updates.
    const shift = useShiftStore()
    if (shift.current?.id === updated.shift_id) {
      shift.fetchCurrent(useHallStore().halls[0]?.workplace_id || null).catch(() => {})
    }
    return updated
  }

  /**
   * Reopen a previously paid order. The order returns to active state,
   * its table (if any) is re-attached, and shift aggregates are recomputed
   * server-side (paid sum/tips decrease accordingly).
   */
  async function reopenOrder(orderId) {
    const updated = await ordersApi.reopen(orderId)
    replaceLocal(updated)
    // The table cache is updated by the table fetch; do a quick local sync.
    if (updated.table_id) {
      const hall = useHallStore()
      const t = hall.tableById?.(updated.table_id)
      if (t) {
        t.order_id = updated.id
        t.status = (updated.items?.length || 0) > 0 ? 'occupied' : 'waiting'
      }
    }
    const shift = useShiftStore()
    if (shift.current?.id === updated.shift_id) {
      shift.fetchCurrent(useHallStore().halls[0]?.workplace_id || null).catch(() => {})
    }
    return updated
  }

  /**
   * Edit a paid order's items / tips / comments. Server validates that the
   * shift is open and the user is the shift owner.
   *
   * `patch` shape: { items?: [{id, menu_item_id, title, price, quantity, comment}], tips?, comments? }
   */
  async function editPaidOrder(orderId, patch) {
    const updated = await ordersApi.editPaid(orderId, patch)
    replaceLocal(updated)
    const shift = useShiftStore()
    if (shift.current?.id === updated.shift_id) {
      shift.fetchCurrent(useHallStore().halls[0]?.workplace_id || null).catch(() => {})
    }
    return updated
  }

  async function deleteOrder(orderId) {
    const order = orderById(orderId)
    const tableId = order?.table_id || null
    const wasPaid = order?.is_paid || false
    await ordersApi.remove(orderId)
    orders.value = orders.value.filter((o) => o.id !== orderId)
    syncTableCacheCleared(orderId, tableId)

    if (wasPaid) {
      const shift = useShiftStore()
      if (order && shift.current?.id === order.shift_id) {
        shift.fetchCurrent(useHallStore().halls[0]?.workplace_id || null).catch(() => {})
      }
    }
  }

  /**
   * Drop a fresh server snapshot of an order into local state. Also syncs
   * the bound table's status — without this, `served`-toggling and item
   * removal don't recolor the table on the map (the order is updated but
   * the table cache stays stale).
   */
  function replaceLocal(order) {
    const idx = orders.value.findIndex((o) => o.id === order.id)
    if (idx >= 0) {
      orders.value[idx] = order
    } else {
      orders.value = [order, ...orders.value]
    }
    // Sync table cache too, unless the order is now paid — paid orders
    // detach from the table, handled by syncTableCacheCleared at the call
    // site (payOrder / deleteOrder).
    if (!order.is_paid && order.table_id) {
      syncTableCache(order)
    }
  }

  // === actions: draft ===

  /**
   * Initialize a fresh draft. Optionally pre-select a table.
   * Called when entering OrderBuilder.
   */
  function startDraft({ tableId = null, hallId = null } = {}) {
    draft.value = {
      tableId,
      hallId,
      items: [],
      comments: '',
    }
    persistDraft(draft.value)
  }

  /**
   * Replace the draft with a snapshot of a paid order, for use by the
   * "edit paid order" flow. The draft is held in memory only — we don't
   * persist it, since this is a one-shot edit session, not an accumulating
   * cart. If the user leaves without saving, nothing is preserved.
   */
  function replaceDraftWithPaidOrder(order) {
    draft.value = {
      tableId: order.table_id || null,
      hallId: order.hall_id || null,
      // Clone items so user edits don't mutate the order object in `orders`.
      items: (order.items || []).map((i) => ({
        id: i.id,
        menu_item_id: i.menu_item_id,
        title: i.title,
        price: Number(i.price),
        quantity: Number(i.quantity),
        comment: i.comment || null,
      })),
      comments: order.comments || '',
    }
    // Deliberately don't call persistDraft — this draft is ephemeral.
  }

  /**
   * Start an empty ephemeral draft pinned to a given table. Used by the
   * "add items to active order" flow — the user fills the cart with *new*
   * items only, and on submit those get appended to the source order via
   * `addItemsToOrder()`.
   */
  function replaceDraftEphemeral({ tableId = null, hallId = null } = {}) {
    draft.value = {
      tableId,
      hallId,
      items: [],
      comments: '',
    }
    // Ephemeral — no persistDraft call.
  }

  /**
   * Add a menu item to the draft. If it already exists with the SAME comment,
   * increment quantity; otherwise add a new line. This way the same dish with
   * different notes ("без сахара" vs default) stays separate.
   */
  function addToDraft(menuItem, { comment = null, quantity = 1 } = {}) {
    if (!draft.value) startDraft()
    const existing = draft.value.items.find(
      (i) =>
        i.menu_item_id === menuItem.id &&
        (i.comment || null) === (comment || null),
    )
    if (existing) {
      existing.quantity += quantity
    } else {
      draft.value.items.push({
        id: newId(),
        menu_item_id: menuItem.id,
        title: menuItem.title,
        price: menuItem.price,
        quantity,
        comment,
      })
    }
    persistDraft(draft.value)
  }

  function updateDraftItem(itemId, patch) {
    if (!draft.value) return
    const item = draft.value.items.find((i) => i.id === itemId)
    if (!item) return
    Object.assign(item, patch)
    if (item.quantity <= 0) {
      removeDraftItem(itemId)
    } else {
      persistDraft(draft.value)
    }
  }

  function incDraftItem(itemId) {
    if (!draft.value) return
    const item = draft.value.items.find((i) => i.id === itemId)
    if (item) {
      item.quantity++
      persistDraft(draft.value)
    }
  }

  function decDraftItem(itemId) {
    if (!draft.value) return
    const item = draft.value.items.find((i) => i.id === itemId)
    if (!item) return
    if (item.quantity <= 1) {
      removeDraftItem(itemId)
    } else {
      item.quantity--
      persistDraft(draft.value)
    }
  }

  function removeDraftItem(itemId) {
    if (!draft.value) return
    draft.value.items = draft.value.items.filter((i) => i.id !== itemId)
    persistDraft(draft.value)
  }

  function setDraftTable(tableId, hallId) {
    if (!draft.value) startDraft()
    draft.value.tableId = tableId
    draft.value.hallId = hallId
    persistDraft(draft.value)
  }

  function setDraftComments(comments) {
    if (!draft.value) startDraft()
    draft.value.comments = comments
    persistDraft(draft.value)
  }

  function clearDraft() {
    draft.value = null
    persistDraft(null)
  }

  function reset() {
    orders.value = []
    error.value = null
    clearDraft()
  }

  return {
    // state
    orders, isLoading, error, draft,
    // getters: orders
    activeOrders, paidOrders, activeRevenue,
    orderByTable, orderById,
    // getters: draft
    draftIsEmpty, draftItemCount, draftTotal, draftQuantityOfMenuItem,
    // actions: server
    fetchForCurrentShift,
    submitDraft, addItemsToOrder, updateOrderItem, removeOrderItem,
    toggleItemServed,
    moveOrder, payOrder, deleteOrder,
    reopenOrder, editPaidOrder,
    // actions: draft
    startDraft, addToDraft, updateDraftItem,
    replaceDraftWithPaidOrder, replaceDraftEphemeral,
    incDraftItem, decDraftItem, removeDraftItem,
    setDraftTable, setDraftComments, clearDraft,
    reset,
  }
})