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
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'
import CurrentShiftCard from './CurrentShiftCard.vue'
import OpenShiftButton from './OpenShiftButton.vue'
import ShiftHistoryItem from './ShiftHistoryItem.vue'
import ShiftDetailsModal from './ShiftDetailsModal.vue'

const workplace = useWorkplaceStore()
const shift = useShiftStore()
const order = useOrderStore()
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

async function onCloseShift() {
  if (!shift.current) return

  // First try a clean close. The backend rejects with 409 + a message
  // mentioning the number of unpaid orders if any remain.
  closing.value = true
  try {
    await shift.close(shift.current.id, { force: false })
    ui.toastSuccess('Смена закрыта')
  } catch (e) {
    if (e.status === 409 && /неоплаченных/i.test(e.message)) {
      // Count unpaid orders ourselves rather than parsing the backend's
      // error message — the message is a developer-facing string and may
      // include internal parameter names. We get a clean count from the
      // already-loaded orders state.
      const unpaid = order.activeOrders.filter(
        (o) => o.shift_id === shift.current.id,
      )
      const n = unpaid.length
      const word = n === 1 ? 'неоплаченный заказ' : (n >= 2 && n <= 4 ? 'неоплаченных заказа' : 'неоплаченных заказов')
      const ok = await ui.confirm({
        title: 'Есть неоплаченные заказы',
        message:
          `В смене ${n} ${word}. ` +
          `Закрыть смену и оплатить их без чаевых?`,
        confirmText: 'Оплатить все и закрыть',
        cancelText: 'Отмена',
        danger: false,
      })
      if (ok) {
        try {
          // Pay every unpaid order in this shift (counted above), then close.
          for (const o of unpaid) {
            await order.payOrder(o.id, { tips: 0 })
          }
          await shift.close(shift.current.id, { force: false })
          ui.toastSuccess(
            n > 0 ? `Оплачено ${n}, смена закрыта` : 'Смена закрыта',
          )
        } catch (e2) {
          ui.toastError(e2.message)
        }
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
  color: var(--wn-ink-mute);
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
  color: var(--wn-ink-mute);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
}

.empty {
  background-color: var(--wn-bg-elevated);
  border-radius: 12px;
  padding: 24px 16px;
  text-align: center;
}

.empty-text {
  margin: 0;
  color: var(--wn-ink-mute);
  font-size: 14px;
}

.empty-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 16px;
  color: var(--wn-ink-mute);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-more {
  width: 100%;
  margin-top: 8px;
  background-color: var(--wn-bg-elevated);
  color: var(--wn-accent-text);
  border: 1px solid var(--wn-accent);
  padding: 10px 16px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-more:active {
  background-color: var(--wn-bg-recessed);
}

.loading-row {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.spinner-small {
  width: 18px;
  height: 18px;
  border: 2px solid var(--wn-bg-recessed);
  border-top-color: var(--wn-accent-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>