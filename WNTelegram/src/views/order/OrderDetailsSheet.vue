<template>
  <transition name="fade">
    <div v-if="visible" class="overlay" @click.self="$emit('close')">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-header">
          <div class="header-main">
            <h3 class="sheet-title">
              <template v-if="liveOrder?.table_number">
                Стол №{{ liveOrder.table_number }}
              </template>
              <template v-else>Заказ без стола</template>
            </h3>
            <span v-if="liveOrder" class="sheet-meta">
              <template v-if="paidMode">
                ✓ Закрыт {{ closedAtLabel }} · {{ formatMoney(liveOrder.total_price, currency) }}
              </template>
              <template v-else>
                ⏱ {{ openedAgo }} · {{ formatMoney(liveOrder.total_price, currency) }}
              </template>
            </span>
          </div>
          <button class="close-btn" @click="$emit('close')">×</button>
        </header>

        <div class="content">
          <!-- Order comment goes first — most actionable info for the waiter
               (allergies, table preferences, special requests). -->
          <div v-if="liveOrder?.comments" class="order-comments order-comments--top">
            <span class="order-comments-label">💬 Комментарий</span>
            <p>{{ liveOrder.comments }}</p>
          </div>

          <!-- Items -->
          <ul v-if="orderItems.length > 0" class="items">
            <li
              v-for="i in orderItems"
              :key="i.id"
              class="item"
              :class="{ 'item--served': i.served }"
            >
              <button
                class="served-toggle"
                :class="{ 'served-toggle--on': i.served }"
                :aria-label="i.served ? 'Отметить как не поданное' : 'Отметить как поданное'"
                @click="onToggleServed(i)"
              >
                <svg
                  v-if="i.served"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
              <div class="item-main">
                <div class="item-title">
                  <span>{{ i.title }}</span>
                  <span class="item-qty">× {{ i.quantity }}</span>
                </div>
                <div v-if="i.comment" class="item-comment">💬 {{ i.comment }}</div>
              </div>
              <div class="item-price">
                {{ formatMoney(i.total_price, currency) }}
              </div>
              <!-- Remove this single item (active orders only — paid orders
                   are edited through the dedicated "Edit" flow). -->
              <button
                v-if="!paidMode"
                class="item-remove"
                :disabled="busy"
                aria-label="Удалить позицию"
                @click="onRemoveItem(i)"
              >
                ×
              </button>
            </li>
          </ul>
          <div v-else-if="liveOrder" class="empty-items">
            <p>В этом заказе пока нет позиций.</p>
          </div>

          <!-- Tips — editable while active, read-only when paid -->
          <div v-if="orderItems.length > 0 && !paidMode" class="tips-row">
            <label class="tips-label">Чаевые</label>
            <div class="tips-input-wrap">
              <input
                v-model.number="tipsAmount"
                type="number"
                min="0"
                step="50"
                placeholder="0"
                class="tips-input"
              />
              <span class="tips-currency">{{ currency }}</span>
            </div>
          </div>

          <div v-if="orderItems.length > 0" class="totals">
            <div class="totals-row">
              <span>Сумма</span>
              <span class="totals-value">{{ formatMoney(liveOrder.total_price, currency) }}</span>
            </div>
            <div v-if="paidTips > 0" class="totals-row totals-row--small">
              <span>Чаевые</span>
              <span class="totals-value">{{ formatMoney(paidTips, currency) }}</span>
            </div>
            <div class="totals-row totals-row--main">
              <span>{{ paidMode ? 'Итого' : 'К оплате' }}</span>
              <span class="totals-value">{{ formatMoney(finalTotal, currency) }}</span>
            </div>
          </div>
        </div>

        <!-- Active liveOrder: pay + add items, with secondary actions below -->
        <template v-if="!paidMode">
          <footer class="sheet-footer">
            <button class="btn btn--ghost" @click="onAddItems" :disabled="busy">
              + Позиции
            </button>
            <button
              class="btn btn--primary"
              :disabled="busy || !canPay"
              @click="onPay"
            >
              {{ busy ? '…' : 'Оплатить' }}
            </button>
          </footer>

          <div class="more-actions">
            <button class="more-btn" @click="onMove" :disabled="busy">
              Перенести на другой стол
            </button>
            <button class="more-btn more-btn--danger" @click="onDelete" :disabled="busy">
              Удалить заказ
            </button>
          </div>
        </template>

        <!-- Paid (history) liveOrder: reopen + edit -->
        <template v-else>
          <footer class="sheet-footer">
            <button class="btn btn--ghost" @click="onEditClick" :disabled="busy">
              ✏️ Изменить
            </button>
            <button class="btn btn--primary" @click="onReopenClick" :disabled="busy">
              ↩ Вернуть в активные
            </button>
          </footer>
        </template>

        <TablePickerSheet
          :visible="movePickerVisible"
          :current-table-id="liveOrder?.table_id"
          :free-only="true"
          @close="movePickerVisible = false"
          @select="onMoveTarget"
        />
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useOrderStore } from '@/stores/order'
import { useWorkplaceStore } from '@/stores/workplace'
import { useUiStore } from '@/stores/ui'
import { formatMoney, formatDuration } from '@/utils/format'
import { hapticImpact } from '@/utils/telegram'
import { useLiveDuration } from '@/composables/useLiveDuration'
import TablePickerSheet from './TablePickerSheet.vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /**
   * Order to display. Parents pass an order object (typically grabbed from
   * the store at the moment of tap). Internally we use this only to extract
   * the id — `liveOrder` (below) re-reads from the store on every update,
   * so changes made via store actions reflect in this sheet immediately.
   */
  order: { type: Object, default: null },
  /**
   * `true` when this sheet shows a paid (closed) order — used by the history
   * screen. In paid mode we show "Reopen" / "Edit" actions instead of the
   * regular "Pay" / "Delete" set, and the tips field becomes read-only.
   */
  paidMode: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'reopen', 'edit'])

const router = useRouter()
const orderStore = useOrderStore()
const workplace = useWorkplaceStore()
const ui = useUiStore()

const busy = ref(false)
const tipsAmount = ref(null)
const movePickerVisible = ref(false)

// Reset tips when a different order is shown
watch(
  () => props.order?.id,
  () => { tipsAmount.value = null },
)

/**
 * Reactively-fresh view of the order from the store. The `order` prop
 * we receive is a snapshot — when the user toggles `served` on an item,
 * the store updates the canonical order object; we re-read from there
 * so the UI reflects the change. Falls back to the prop while the order
 * is closed/missing from the store (e.g. paid orders in history view).
 */
const liveOrder = computed(() => {
  const id = props.order?.id
  if (!id) return props.order
  return orderStore.orderById(id) || props.order
})

const currency = computed(() => liveOrder.value?.currency || workplace.currency)

/** Defensive: order may arrive without items array (legacy data, etc). */
const orderItems = computed(() => liveOrder.value?.items || [])

const canPay = computed(() => orderItems.value.length > 0)

/**
 * Tips as a guaranteed number. v-model.number on an empty input produces NaN,
 * which would propagate into the total and render as "не число ₽".
 */
const tipsValue = computed(() => {
  const n = Number(tipsAmount.value)
  return Number.isFinite(n) && n > 0 ? n : 0
})

const totalToPay = computed(() => (liveOrder.value?.total_price || 0) + tipsValue.value)

/**
 * In paid mode the tips are already on the order (locked); in active mode
 * they come from the editable input above. Pick the right one for display.
 */
const paidTips = computed(() => {
  if (props.paidMode) {
    const n = Number(liveOrder.value?.tips)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  return tipsValue.value
})

const finalTotal = computed(() => (liveOrder.value?.total_price || 0) + paidTips.value)

const liveDuration = useLiveDuration(() => liveOrder.value?.created_at)
const openedAgo = computed(() => formatDuration(liveDuration.value))

/** Short HH:MM label for the time the order was closed (paid mode). */
const closedAtLabel = computed(() => {
  const ts = liveOrder.value?.closed_at
  if (!ts) return ''
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts * 1000))
})

// === Actions ===

function onAddItems() {
  if (!props.order) return
  emit('close')
  router.push({
    name: 'order-builder',
    query: { add_to_order: props.order.id },
  })
}

async function onPay() {
  if (!props.order || busy.value) return

  // Confirmation prevents accidental taps from finalizing an order.
  // Show the actual amount the user is about to confirm so it's unambiguous.
  const amountLabel = formatMoney(totalToPay.value, currency.value)
  const tipsLine = tipsValue.value > 0
    ? ` (включая ${formatMoney(tipsValue.value, currency.value)} чаевых)`
    : ''
  const ok = await ui.confirm({
    title: 'Подтвердить оплату?',
    message: `Сумма: ${amountLabel}${tipsLine}. После подтверждения заказ закроется и стол освободится.`,
    confirmText: 'Подтвердить',
  })
  if (!ok) return

  busy.value = true
  try {
    await orderStore.payOrder(props.order.id, { tips: tipsValue.value })
    ui.toastSuccess('Заказ оплачен')
    emit('close')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

function onMove() {
  movePickerVisible.value = true
}

async function onMoveTarget(newTableId) {
  movePickerVisible.value = false
  if (!liveOrder.value) return
  if (newTableId === liveOrder.value.table_id) return
  busy.value = true
  try {
    await orderStore.moveOrder(props.order.id, newTableId)
    ui.toastSuccess(newTableId ? 'Заказ перенесён' : 'Заказ откреплён от стола')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

async function onDelete() {
  if (!props.order) return
  const ok = await ui.confirm({
    title: 'Удалить заказ?',
    message: 'Стол освободится. Действие нельзя отменить.',
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await orderStore.deleteOrder(props.order.id)
    ui.toastSuccess('Заказ удалён')
    emit('close')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}

// === Paid mode actions ===
// Parent (OrderHistoryView) implements the actual confirm + API call,
// so the same sheet stays simple and reusable.
function onReopenClick() {
  if (!props.order) return
  emit('reopen', props.order)
}

function onEditClick() {
  if (!props.order) return
  emit('edit', props.order)
}

/**
 * Toggle "served" on a line item. Uses the store's optimistic helper
 * so the UI flips instantly; on server failure we revert + toast.
 */
async function onToggleServed(item) {
  if (!props.order) return
  hapticImpact('light')
  try {
    await orderStore.toggleItemServed(props.order.id, item.id)
  } catch (e) {
    ui.toastError(e.message)
  }
}

/**
 * Remove a single line item from an active order. Asks for confirmation
 * because there's no undo on this once the server commits. Disabled in
 * paid mode — those orders go through the "Edit" flow instead.
 */
async function onRemoveItem(item) {
  if (!props.order || busy.value) return
  const ok = await ui.confirm({
    title: `Удалить «${item.title}»?`,
    message: `Позиция будет убрана из заказа.`,
    confirmText: 'Удалить',
    danger: true,
  })
  if (!ok) return
  busy.value = true
  try {
    await orderStore.removeOrderItem(item.id)
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 250;
}

.sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  margin: 0 auto;
  background-color: #fff;
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  width: 100%;
  max-width: 600px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
  /* Pinned to viewport bottom — prevents iOS keyboard from shifting the
     sheet sideways. Also blocks underlying map gestures from bleeding
     through: every touch in the sheet's bounding box hits the sheet
     first, never the SVG below. */
}

.sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 20px 12px 20px;
  border-bottom: 1px solid #eee;
  gap: 12px;
}

.header-main {
  flex: 1;
  min-width: 0;
}

.sheet-title {
  margin: 0 0 2px 0;
  font-size: 17px;
  font-weight: 600;
}

.sheet-meta {
  font-size: 12px;
  color: #888;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: #888;
  cursor: pointer;
  padding: 4px 8px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px;
  /* Restrict to vertical scroll only so iOS doesn't try to interpret a
     fast vertical swipe as a horizontal one and bleed it through to
     elements below the sheet (which would otherwise pan the map). */
  touch-action: pan-y;
  overscroll-behavior: contain;
}

.items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item {
  display: flex;
  gap: 10px;
  padding-bottom: 10px;
  border-bottom: 1px solid #f5f5f5;
  align-items: flex-start;
}

.item:last-child {
  border-bottom: none;
}

/* === Served toggle (round checkbox to the left of the item) === */
.served-toggle {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  margin-top: 1px;
  border-radius: 50%;
  border: 1.5px solid var(--wn-glass-border-subtle, #d0d0d0);
  background: transparent;
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    transform 0.12s ease;
}

.served-toggle:active {
  transform: scale(0.88);
}

.served-toggle--on {
  background-color: var(--wn-mint-ink, #2e7d32);
  border-color: var(--wn-mint-ink, #2e7d32);
}

/* Strike-through served items so a busy waiter can scan progress at a glance. */
.item--served .item-title {
  color: var(--wn-ink-mute, #888);
  text-decoration: line-through;
  text-decoration-color: rgba(0, 0, 0, 0.3);
}

.item--served .item-price {
  color: var(--wn-ink-mute, #888);
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  display: flex;
  gap: 6px;
}

.item-qty {
  color: #888;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.item-comment {
  font-size: 12px;
  color: #777;
  margin-top: 2px;
}

.item-price {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
}

/* Small "×" delete button on each line item in active orders. Kept small
   and muted so it doesn't compete visually with the price or the served
   checkbox; needs intent to tap but no swipe gesture (taps are clearer). */
.item-remove {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  margin-top: -2px;
  border: none;
  border-radius: 50%;
  background-color: transparent;
  color: #aaa;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.item-remove:active {
  background-color: #ffebee;
  color: #c62828;
}

.item-remove:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-items {
  padding: 20px;
  text-align: center;
  color: #888;
  font-size: 13px;
}

.empty-items p {
  margin: 0;
}

.order-comments {
  margin-top: 12px;
  padding: 10px 12px;
  background-color: #f5f5f7;
  border-radius: 8px;
}

/* When comments are placed at the top of the sheet, give them an accent
   color so they catch the waiter's eye before items / tips. */
.order-comments--top {
  margin-top: 0;
  margin-bottom: 12px;
  background-color: var(--wn-peach-bg, #fff0e6);
  border-left: 3px solid var(--wn-peach, #f4c4a3);
  padding: 10px 12px 10px 14px;
}

.order-comments--top .order-comments-label {
  color: var(--wn-peach-ink, #c25e1a);
}

.order-comments-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 0.4px;
  font-weight: 500;
  margin-bottom: 4px;
}

.order-comments p {
  margin: 0;
  font-size: 13px;
  color: #333;
  white-space: pre-wrap;
}

.tips-row {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tips-label {
  font-size: 13px;
  color: #555;
  font-weight: 500;
}

.tips-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tips-input {
  width: 100px;
  padding: 8px 10px;
  font-size: 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  outline: none;
  font-family: inherit;
  text-align: right;
  box-sizing: border-box;
}

.tips-input:focus {
  border-color: #4caf50;
}

.tips-currency {
  font-size: 13px;
  color: #888;
}

.totals {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #eee;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.totals-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #555;
}

.totals-row--small {
  font-size: 12px;
  color: #777;
}

.totals-row--main {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  padding-top: 6px;
  margin-top: 4px;
  border-top: 1px solid #f0f0f0;
}

.totals-value {
  font-variant-numeric: tabular-nums;
}

.sheet-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
}

.btn {
  flex: 1;
  padding: 12px 16px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}

.btn:active {
  opacity: 0.85;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--ghost {
  background-color: #f5f5f7;
  color: #333;
  flex: 0 0 auto;
}

.btn--primary {
  background-color: #4caf50;
  color: #fff;
}

.more-actions {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 12px 16px;
  gap: 4px;
}

.more-btn {
  background: none;
  border: none;
  text-align: left;
  padding: 10px 4px;
  font-size: 13px;
  color: #555;
  cursor: pointer;
  font-family: inherit;
}

.more-btn:active {
  opacity: 0.6;
}

.more-btn--danger {
  color: #c62828;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active .sheet,
.fade-leave-active .sheet {
  transition: transform 0.22s ease;
}
.fade-enter-from .sheet,
.fade-leave-to .sheet {
  transform: translateY(100%);
}
</style>