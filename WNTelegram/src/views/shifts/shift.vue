<template>
  <div class="page">
    <header class="header">
      <h1 class="title">Смены</h1>
      <span v-if="workplace.current" class="subtitle">
        {{ workplace.current.title }}
      </span>
    </header>

    <!-- No workplace -->
    <div v-if="!workplace.currentId" class="empty-screen">
      <p>Выберите заведение в Профиле</p>
    </div>

    <template v-else>
      <!-- Current shift / Open button -->
      <section class="section">
        <CurrentShiftCard
          v-if="shift.current"
          :shift="shift.current"
          :closing="closing"
          @close-shift="onCloseShift"
        />
        <OpenShiftButton
          v-else
          :opening="opening"
          @open-shift="onOpenShift"
        />
      </section>

      <!-- History -->
      <section class="section">
        <h2 class="section-title">История смен</h2>

        <div v-if="shift.history.length === 0 && !shift.isLoadingHistory" class="empty">
          <p class="empty-text">Закрытых смен пока нет</p>
        </div>

        <div v-else class="history-list">
          <ShiftHistoryItem
            v-for="s in shift.history"
            :key="s.id"
            :shift="s"
            @open="openDetails"
          />
        </div>

        <button
          v-if="shift.historyHasMore && !shift.isLoadingHistory"
          class="btn-more"
          @click="loadMore"
        >
          Показать ещё
        </button>

        <div v-if="shift.isLoadingHistory" class="loading-row">
          <div class="spinner-small" />
        </div>
      </section>
    </template>

    <ShiftDetailsModal
      v-if="detailsShift"
      :shift="detailsShift"
      @close="detailsShift = null"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useWorkplaceStore } from '@/stores/workplace'
import { useShiftStore } from '@/stores/shift'
import { useOrderStore } from '@/stores/order'
import { useHallStore } from '@/stores/hall'
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'
import CurrentShiftCard from './CurrentShiftCard.vue'
import OpenShiftButton from './OpenShiftButton.vue'
import ShiftHistoryItem from './ShiftHistoryItem.vue'
import ShiftDetailsModal from './ShiftDetailsModal.vue'

const workplace = useWorkplaceStore()
const shift = useShiftStore()
const order = useOrderStore()
const hall = useHallStore()
const ui = useUiStore()

const opening = ref(false)
const closing = ref(false)
const detailsShift = ref(null)

onMounted(() => {
  // History is fetched once on workplace switch (via App.vue watcher),
  // but if user comes here for the first time after boot, fetch now.
  if (workplace.currentId && shift.history.length === 0 && shift.historyHasMore) {
    shift.fetchHistory(workplace.currentId).catch((e) => ui.toastError(e.message))
  }
})

async function onOpenShift() {
  if (!workplace.currentId) return
  opening.value = true
  try {
    await shift.open(workplace.currentId, { id: newId() })
    ui.toastSuccess('Смена открыта')
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    opening.value = false
  }
}

/**
 * After any successful shift close — clean close OR force close — the
 * backend has updated:
 *   - tables: order_id reset, status back to 'free'
 *   - orders: paid (force) or untouched (clean)
 *
 * The order store self-clears via the App.vue watch on shift.current?.id
 * (current shift becomes null → orders.value = []). But the hall store
 * has no such trigger — it still thinks the tables are occupied / waiting
 * unless we refetch. Without this call, the map shows red squares on
 * tables that the server already freed.
 *
 * Failure here is non-fatal: the shift was closed correctly, the cache
 * is just briefly out of sync until the next workplace switch or app
 * reload. Swallow rather than surface — the user already got a success
 * toast.
 */
async function syncMapAfterShiftClose() {
  if (!workplace.currentId) return
  try {
    await hall.fetchAll(workplace.currentId)
  } catch {
    /* non-fatal — map will reconcile on next visit */
  }
}

async function onCloseShift() {
  if (!shift.current) return

  // First try a clean close. The backend rejects with 409 if any unpaid
  // orders remain — we detect that by status code alone, not by parsing
  // the message (which is in English and not user-facing).
  closing.value = true
  try {
    await shift.close(shift.current.id, { force: false })
    await syncMapAfterShiftClose()
    ui.toastSuccess('Смена закрыта')
  } catch (e) {
    if (e.status === 409) {
      // Count unpaid orders from local state — works regardless of what
      // the backend's error string looks like, and gives us a number to
      // display to the user.
      const unpaid = order.activeOrders.filter(
        (o) => o.shift_id === shift.current.id,
      )
      const n = unpaid.length
      const word =
        n === 1
          ? 'неоплаченный заказ'
          : n >= 2 && n <= 4
            ? 'неоплаченных заказа'
            : 'неоплаченных заказов'

      // Defensive: if local state somehow doesn't match the backend (we
      // saw a 409 but think there are zero unpaid orders), surface the
      // raw error instead of an empty confirm — at least the user has
      // a clue what's going on.
      if (n === 0) {
        ui.toastError(e.message || 'Не удалось закрыть смену')
        return
      }

      const ok = await ui.confirm({
        title: 'Есть неоплаченные заказы',
        message:
          `В смене ${n} ${word}. ` +
          `Закрыть смену и оплатить их без чаевых?`,
        confirmText: 'Оплатить все и закрыть',
        cancelText: 'Отмена',
        danger: false,
      })
      if (!ok) return

      try {
        // Single atomic close with force=true. The backend handles the
        // auto-pay (tips=0), empty-order deletion, and table detachment
        // in one transaction — no N+1 round trips, no partial states
        // if the network drops mid-loop.
        await shift.close(shift.current.id, { force: true })
        await syncMapAfterShiftClose()
        ui.toastSuccess(
          n > 0 ? `Оплачено ${n}, смена закрыта` : 'Смена закрыта',
        )
      } catch (e2) {
        ui.toastError(e2.message)
      }
    } else {
      ui.toastError(e.message)
    }
  } finally {
    closing.value = false
  }
}

function openDetails(s) {
  detailsShift.value = s
}

async function loadMore() {
  if (!workplace.currentId) return
  try {
    await shift.fetchHistory(workplace.currentId)
  } catch (e) {
    ui.toastError(e.message)
  }
}
</script>

<style scoped>
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}

.header {
  margin-bottom: 20px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}

.subtitle {
  font-size: 13px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
}

.empty {
  background-color: #fff;
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
}

.empty-text {
  margin: 0;
  color: #888;
  font-size: 14px;
}

.empty-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 16px;
  color: #888;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-more {
  width: 100%;
  margin-top: 8px;
  background-color: #fff;
  color: #4caf50;
  border: 1px solid #4caf50;
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-more:active {
  background-color: #f0f0f0;
}

.loading-row {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.spinner-small {
  width: 18px;
  height: 18px;
  border: 2px solid #e0e0e0;
  border-top-color: #4caf50;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>