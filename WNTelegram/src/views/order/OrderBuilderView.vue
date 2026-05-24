<template>
  <div class="page">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">
        <template v-if="editingPaidId">
          Изменение заказа{{ contextTableNum ? ` · стол №${contextTableNum}` : '' }}
        </template>
        <template v-else-if="addingToOrderId">
          + к заказу{{ contextTableNum ? ` · стол №${contextTableNum}` : '' }}
        </template>
        <template v-else>Новый заказ</template>
      </h1>
      <button
        v-if="!order.draftIsEmpty && !editingPaidId"
        class="clear-btn"
        @click="onClearDraft"
        aria-label="Очистить корзину"
      >
        Очистить
      </button>
    </header>

    <!-- Search -->
    <div class="search-wrap">
      <input
        v-model="searchQuery"
        type="search"
        class="search-input"
        placeholder="Поиск по меню…"
      />
      <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">×</button>
    </div>

    <!-- Search results override the categorized view -->
    <section v-if="searchQuery" class="search-results">
      <div v-if="searchResults.length === 0" class="empty">
        <p>Ничего не найдено</p>
      </div>
      <template v-else>
        <p class="search-count">Найдено: {{ searchResults.length }}</p>
        <div class="items">
          <MenuPickRow
            v-for="item in searchResults"
            :key="item.id"
            :item="item"
            :currency="workplace.currency"
            :quantity="order.draftQuantityOfMenuItem(item.id)"
            @add="onAddToCart"
          />
        </div>
      </template>
    </section>

    <template v-else>
      <CategoryChips
        v-if="menu.allCategories.length > 0"
        :categories="menu.activeCategories"
        :selected-id="menu.selectedCategoryId"
        :editable="false"
        @select="menu.selectCategory"
        @add="goToMenuEditor"
      />

      <div v-if="menu.activeCategories.length === 0" class="empty empty--centered">
        <p>В меню нет активных категорий.</p>
        <button class="btn-link" @click="goToMenuEditor">Открыть редактор</button>
      </div>

      <div v-else class="items">
        <div v-if="menu.selectedItems.length === 0" class="empty empty--small">
          <p>В этой категории нет позиций</p>
        </div>
        <MenuPickRow
          v-for="item in activeItems"
          :key="item.id"
          :item="item"
          :currency="workplace.currency"
          :quantity="order.draftQuantityOfMenuItem(item.id)"
          @add="onAddToCart"
        />
      </div>
    </template>

    <!-- Cart bottom sheet — always visible while there are items, peek mode otherwise -->
    <BottomSheet
      v-if="cartVisible"
      ref="cartSheetRef"
      :visible="cartVisible"
      :snap-points="snapPoints"
      :initial-snap="0"
    >
      <template #header>
        <div class="cart-header" @click="expandCart">
          <div class="cart-summary">
            <span class="cart-count">{{ order.draftItemCount }} {{ pluralize(order.draftItemCount, ['позиция', 'позиции', 'позиций']) }}</span>
            <span class="cart-total">{{ formatMoney(order.draftTotal, workplace.currency) }}</span>
          </div>
        </div>

        <!-- Table picker plate — only for new orders.
             In edit-paid / add-to-order modes the table is fixed by the
             source order, so we don't show the picker. -->
        <button
          v-if="!editingPaidId && !addingToOrderId"
          class="table-plate"
          @click="tablePickerVisible = true"
        >
          <span class="table-plate-icon">🪑</span>
          <span v-if="selectedTable" class="table-plate-text">
            Стол №{{ selectedTable.number }}
            <small v-if="selectedHall">· {{ selectedHall.name }}</small>
          </span>
          <span v-else class="table-plate-text table-plate-text--empty">
            Стол не выбран
          </span>
          <span class="table-plate-edit">✏️</span>
        </button>

        <!-- Read-only table info when adding to / editing an existing order -->
        <div
          v-else-if="contextTableNum"
          class="table-plate table-plate--readonly"
        >
          <span class="table-plate-icon">🪑</span>
          <span class="table-plate-text">
            Стол №{{ contextTableNum }}
          </span>
        </div>
      </template>

      <CartContent
        :items="order.draft?.items || []"
        :currency="workplace.currency"
        @inc="order.incDraftItem"
        @dec="order.decDraftItem"
        @update-comment="(id, comment) => order.updateDraftItem(id, { comment })"
      />

      <!-- Order-level comment — opens central PromptModal so keyboard
           doesn't hide the input (we're at the bottom of the screen). -->
      <div v-if="!order.draftIsEmpty" class="order-comment">
        <label class="order-comment-label">Комментарий к заказу</label>
        <button
          class="order-comment-btn"
          :class="{ 'order-comment-btn--empty': !order.draft?.comments }"
          @click="editOrderComment"
        >
          <span v-if="order.draft?.comments" class="order-comment-text">
            💬 {{ order.draft.comments }}
          </span>
          <span v-else class="order-comment-placeholder">
            + Добавить комментарий
          </span>
        </button>
      </div>

      <template #footer>
        <button
          class="submit-btn"
          :disabled="!canSubmit || submitting"
          @click="onSubmit"
        >
          <template v-if="submitting">
            {{ editingPaidId ? 'Сохраняем…' : (addingToOrderId ? 'Добавляем…' : 'Создаём…') }}
          </template>
          <template v-else-if="editingPaidId">
            Сохранить изменения · {{ formatMoney(order.draftTotal, workplace.currency) }}
          </template>
          <template v-else-if="addingToOrderId">
            Добавить к заказу · {{ formatMoney(order.draftTotal, workplace.currency) }}
          </template>
          <template v-else>
            Собрать заказ · {{ formatMoney(order.draftTotal, workplace.currency) }}
          </template>
        </button>
      </template>
    </BottomSheet>

    <TablePickerSheet
      :visible="tablePickerVisible"
      :current-table-id="order.draft?.tableId"
      :free-only="true"
      @close="tablePickerVisible = false"
      @select="onTableSelect"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMenuStore } from '@/stores/menu'
import { useOrderStore } from '@/stores/order'
import { useHallStore } from '@/stores/hall'
import { useWorkplaceStore } from '@/stores/workplace'
import { useShiftStore } from '@/stores/shift'
import { useUiStore } from '@/stores/ui'
import { formatMoney } from '@/utils/format'
import { hapticImpact } from '@/utils/telegram'
import BottomSheet from '@/components/BottomSheet.vue'
import CategoryChips from '@/views/menu/CategoryChips.vue'
import MenuPickRow from './MenuPickRow.vue'
import CartContent from './CartContent.vue'
import TablePickerSheet from './TablePickerSheet.vue'

const route = useRoute()
const router = useRouter()
const menu = useMenuStore()
const order = useOrderStore()
const hall = useHallStore()
const workplace = useWorkplaceStore()
const shift = useShiftStore()
const ui = useUiStore()

// Snap points: peek (just header), middle (cart visible), full
const snapPoints = ref([180, 0.55, 0.92])

const searchQuery = ref('')
const submitting = ref(false)
const tablePickerVisible = ref(false)
const cartSheetRef = ref(null)

// === Edit-paid mode ===
// When ?edit_paid=<id> is in the URL, this screen edits a *paid* order in
// the current open shift instead of creating a new one. The cart is
// pre-filled with the order's items and the submit button calls
// `editPaidOrder()` instead of `submitDraft()`.
const editingPaidId = ref(route.query.edit_paid || null)

// === Add-to-order mode ===
// When ?add_to_order=<id> is in the URL, this screen *appends* items to an
// existing active order. The cart starts empty; submitting calls
// `addItemsToOrder()` instead of `submitDraft()`. Table is fixed from source.
const addingToOrderId = ref(route.query.add_to_order || null)

/** Table number from the source order (edit-paid or add-to-order) — read-only. */
const contextTableNum = ref(null)

// === Lifecycle: ensure draft exists; pre-fill table from query if provided ===
onMounted(() => {
  // No open shift = bounce back
  if (!shift.isOpen) {
    ui.toastError('Откройте смену, чтобы принимать заказы')
    router.replace({ name: 'shifts' })
    return
  }

  // Edit-paid flow: load the order, replace the draft with its items.
  if (editingPaidId.value) {
    const o = order.orderById(editingPaidId.value)
    if (!o || !o.is_paid) {
      ui.toastError('Закрытый заказ не найден')
      router.replace({ name: 'order-history' })
      return
    }
    contextTableNum.value = o.table_number || null
    // Clear any draft (we don't want to merge with an unrelated cart) and
    // synthesize one that mirrors the paid order. We mark it ephemeral so
    // the order store doesn't persist it across refreshes.
    order.replaceDraftWithPaidOrder(o)
    return
  }

  // Add-to-order flow: start with an empty draft pinned to the source order.
  if (addingToOrderId.value) {
    const o = order.orderById(addingToOrderId.value)
    if (!o || o.is_paid) {
      ui.toastError('Активный заказ не найден')
      router.replace({ name: 'map' })
      return
    }
    contextTableNum.value = o.table_number || null
    // Empty ephemeral draft — user picks only the *new* items to append.
    order.replaceDraftEphemeral({
      tableId: o.table_id || null,
      hallId: o.hall_id || null,
    })
    return
  }

  const queryTableId = route.query.table_id
  if (!order.draft) {
    // Fresh cart — seed with the table that brought us here, if any.
    if (queryTableId) {
      const t = hall.tableById(queryTableId)
      order.startDraft({
        tableId: t?.id || null,
        hallId: t?.hall_id || null,
      })
    } else {
      order.startDraft()
    }
  } else if (queryTableId) {
    // Continuing an existing cart, AND the user just tapped a table on the
    // map. Adopt that table — the user's most recent intent overrides any
    // stale table reference from a previous session. (Without this, tapping
    // a different free table while a draft existed wouldn't update the
    // bound table, leaving the user confused.)
    const t = hall.tableById(queryTableId)
    if (t && t.id !== order.draft.tableId) {
      order.setDraftTable(t.id, t.hall_id)
    }
  }
})

// === Search ===
const searchResults = computed(() => {
  const q = (searchQuery.value || '').trim().toLowerCase()
  if (!q) return []
  return menu.items
    .filter((i) => i.is_active && i.title.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title))
})

const activeItems = computed(() =>
  menu.selectedItems.filter((i) => i.is_active),
)

// === Cart visibility ===
const cartVisible = computed(() => true) // always show; peek mode shows minimal

// === Selected table ===
const selectedTable = computed(() =>
  order.draft?.tableId ? hall.tableById(order.draft.tableId) : null,
)
const selectedHall = computed(() =>
  selectedTable.value
    ? hall.halls.find((h) => h.id === selectedTable.value.hall_id)
    : null,
)

const canSubmit = computed(() => !order.draftIsEmpty)

// === Actions ===
function onAddToCart(item) {
  order.addToDraft(item)
  hapticImpact('light')
  // If cart is in peek mode, briefly highlight the change by snapping to middle
  // (omitted for now — too aggressive; let user expand at will)
}

async function onSubmit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    if (addingToOrderId.value) {
      // === Append items to an existing active order ===
      const items = (order.draft?.items || []).map((i) => ({
        menu_item_id: i.menu_item_id,
        title: i.title,
        price: i.price,
        quantity: i.quantity,
        comment: i.comment || null,
      }))
      const updated = await order.addItemsToOrder(addingToOrderId.value, items)
      order.clearDraft()
      ui.toastSuccess(`Добавлено к заказу${updated.table_number ? ` · стол №${updated.table_number}` : ''}`)
      // Back to the map with the table highlighted + the details sheet open.
      if (updated.table_id) {
        router.replace({
          name: 'map',
          query: { show_order: updated.id },
        })
      } else {
        router.replace({ name: 'map' })
      }
      return
    }

    if (editingPaidId.value) {
      // === Edit existing paid order ===
      const patch = {
        items: (order.draft?.items || []).map((i) => ({
          id: i.id,
          menu_item_id: i.menu_item_id,
          title: i.title,
          price: i.price,
          quantity: i.quantity,
          comment: i.comment || null,
        })),
        comments: order.draft?.comments || null,
      }
      const updated = await order.editPaidOrder(editingPaidId.value, patch)
      // Clear the draft so the cart doesn't linger after we leave.
      order.clearDraft()
      ui.toastSuccess('Изменения сохранены')
      router.replace({ name: 'order-history' })
      return
    }

    // === Create new order (default flow) ===
    const created = await order.submitDraft({ workplaceId: workplace.currentId })
    ui.toastSuccess(`Заказ принят${created.table_number ? ` · стол №${created.table_number}` : ''}`)
    if (created.table_id) {
      router.replace({ name: 'map', query: { highlight_table: created.table_id } })
    } else {
      router.replace({ name: 'map' })
    }
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    submitting.value = false
  }
}

/**
 * Open the central PromptModal for the order-level comment. Same reasoning
 * as for the item comments — inline textarea would be hidden behind the
 * on-screen keyboard since this lives at the bottom of the cart sheet.
 */
async function editOrderComment() {
  const value = await ui.prompt({
    title: 'Комментарий к заказу',
    initial: order.draft?.comments || '',
    placeholder: 'Например: гость справа, оплата картой',
    multiline: true,
    rows: 3,
    maxLength: 2000,
    confirmText: 'Сохранить',
  })
  if (value === null) return
  order.setDraftComments(value.trim() || '')
}

async function onClearDraft() {
  const ok = await ui.confirm({
    title: 'Очистить корзину?',
    message: 'Все добавленные позиции будут удалены.',
    confirmText: 'Очистить',
    danger: true,
  })
  if (!ok) return
  // For add-to-order mode, re-init an empty ephemeral draft pinned to the
  // source order's table. For new-order flow, re-init the persistent draft.
  if (addingToOrderId.value) {
    const o = order.orderById(addingToOrderId.value)
    order.replaceDraftEphemeral({
      tableId: o?.table_id || null,
      hallId: o?.hall_id || null,
    })
  } else {
    order.clearDraft()
    order.startDraft()
  }
}

function onTableSelect(tableId) {
  if (tableId == null) {
    order.setDraftTable(null, null)
  } else {
    const t = hall.tableById(tableId)
    if (t) order.setDraftTable(t.id, t.hall_id)
  }
  tablePickerVisible.value = false
}

function expandCart() {
  // Snap to middle on tap of header
  cartSheetRef.value?.snapTo(1)
}

function goBack() {
  router.back()
}

function goToMenuEditor() {
  router.push({ name: 'menu' })
}

function pluralize(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

// Persist current category between sessions: rely on menu store's selectedCategoryId
watch(
  () => menu.allCategories.length,
  (n) => {
    if (n > 0 && !menu.selectedCategoryId) {
      menu.selectCategory(menu.activeCategories[0]?.id || menu.allCategories[0]?.id)
    }
  },
  { immediate: true },
)
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f5f7;
  /* Leave space for the cart sheet (peek = 180px) */
  padding-bottom: 200px;
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background-color: #fff;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 0;
  z-index: 10;
}

.back-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: #333;
  cursor: pointer;
  padding: 4px 8px;
}

.title {
  flex: 1;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.clear-btn {
  background: none;
  border: none;
  color: #c62828;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  padding: 4px 8px;
}

.search-wrap {
  position: relative;
  padding: 12px 16px 8px 16px;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 12px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background-color: #fff;
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
}

.search-input:focus {
  border-color: #4caf50;
}

.search-clear {
  position: absolute;
  right: 24px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 18px;
  color: #aaa;
  cursor: pointer;
  padding: 4px 8px;
}

.search-results,
.items {
  padding: 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.search-count {
  margin: 0 0 4px 0;
  font-size: 12px;
  color: #888;
}

.empty {
  background: #fff;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
  margin: 8px 16px;
}

.empty--small {
  padding: 16px;
}

.empty--centered {
  margin: 32px 16px;
}

.empty p {
  margin: 0;
  color: #888;
  font-size: 14px;
}

.btn-link {
  background: none;
  border: none;
  color: #4caf50;
  font-size: 14px;
  font-weight: 500;
  margin-top: 8px;
  cursor: pointer;
  font-family: inherit;
}

/* === Cart sheet header content === */
.cart-header {
  cursor: pointer;
  padding: 0 4px 8px 4px;
}

.cart-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.cart-count {
  font-size: 13px;
  color: #666;
  font-weight: 500;
}

.cart-total {
  font-size: 17px;
  font-weight: 700;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
}

.table-plate {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background-color: #f5f5f7;
  border: none;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
  margin-bottom: 4px;
}

.table-plate:active {
  background-color: #ebebef;
}

.table-plate--readonly {
  cursor: default;
  background-color: var(--wn-mint-bg, #e8f5ec);
  color: var(--wn-mint-ink, #2e7d32);
}

.table-plate--readonly:active {
  background-color: var(--wn-mint-bg, #e8f5ec);
}

.table-plate-icon {
  font-size: 16px;
}

.table-plate-text {
  flex: 1;
  text-align: left;
  font-size: 13px;
  color: #1a1a1a;
  font-weight: 500;
}

.table-plate-text small {
  color: #888;
  font-weight: 400;
}

.table-plate-text--empty {
  color: #888;
  font-weight: 400;
}

.table-plate-edit {
  font-size: 14px;
  opacity: 0.6;
}

/* Order-level comment field */
.order-comment {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #f0f0f0;
}

.order-comment-label {
  font-size: 11px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  font-weight: 500;
  display: block;
  margin-bottom: 6px;
}

.order-comment-btn {
  width: 100%;
  font-size: 13px;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  background-color: #fafafa;
  color: #1a1a1a;
  text-align: left;
  cursor: pointer;
  min-height: 40px;
  box-sizing: border-box;
  transition: background-color 0.15s ease;
}

.order-comment-btn:active {
  background-color: #f0f0f2;
}

.order-comment-btn--empty {
  border-style: dashed;
}

.order-comment-text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}

.order-comment-placeholder {
  color: #888;
}

/* Submit button (in sheet footer) */
.submit-btn {
  width: 100%;
  background-color: #4caf50;
  color: #fff;
  border: none;
  padding: 14px 20px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s ease;
}

.submit-btn:not(:disabled):active {
  opacity: 0.85;
}

.submit-btn:disabled {
  background-color: #c8e6c9;
  cursor: not-allowed;
}
</style>