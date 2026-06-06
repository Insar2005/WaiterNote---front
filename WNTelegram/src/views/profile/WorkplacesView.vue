<template>
  <div class="page">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">Заведения</h1>
      <button class="btn-add" @click="openCreateForm">+ Добавить</button>
    </header>

    <div v-if="workplace.isEmpty" class="empty">
      <p class="empty-text">У вас пока нет ни одного заведения.</p>
      <button class="btn-primary" @click="openCreateForm">Создать первое</button>
    </div>

    <div v-else>
      <section class="section">
        <div class="list">
          <div
            v-for="w in workplace.activeList"
            :key="w.id"
            class="card"
            :class="{ 'card--current': w.id === workplace.currentId }"
            @click="selectWorkplace(w.id)"
          >
            <div class="card-main">
              <div class="card-title-row">
                <span class="card-title">{{ w.title }}</span>
                <span v-if="w.id === workplace.currentId" class="card-badge">текущее</span>
                <span v-if="w.my_role !== 'owner'" class="card-badge card-badge--muted">
                  участник
                </span>
              </div>
              <div class="card-meta">
                {{ w.currency }} · {{ shiftTypeLabel(w.shift_type_default) }}
                <template v-if="w.shift_type_default === 'fixed'">
                  · {{ formatMoney(w.pay_for_shift_default, w.currency) }}/смена
                </template>
                <template v-else>
                  · {{ w.service_percent_default }}%
                </template>
              </div>
            </div>
            <button
              v-if="w.my_role === 'owner'"
              class="card-action"
              @click.stop="openEditForm(w)"
              aria-label="Редактировать"
            >
              ✏️
            </button>
          </div>
        </div>
      </section>

      <section v-if="workplace.archivedList.length > 0" class="section">
        <h2 class="section-title">Архив</h2>
        <div class="list">
          <div
            v-for="w in workplace.archivedList"
            :key="w.id"
            class="card card--archived"
          >
            <div class="card-main">
              <span class="card-title">{{ w.title }}</span>
            </div>
            <button
              v-if="w.my_role === 'owner'"
              class="card-action"
              @click="unarchiveWorkplace(w.id)"
              aria-label="Восстановить"
            >
              ↻
            </button>
          </div>
        </div>
      </section>
    </div>

    <WorkplaceFormModal
      v-if="formVisible"
      :initial="editingWorkplace"
      @close="closeForm"
      @saved="closeForm"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkplaceStore } from '@/stores/workplace'
import { useUiStore } from '@/stores/ui'
import { formatMoney } from '@/utils/format'
import WorkplaceFormModal from '@/components/WorkplaceFormModal.vue'

const router = useRouter()
const workplace = useWorkplaceStore()
const ui = useUiStore()

const formVisible = ref(false)
const editingWorkplace = ref(null)

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'profile' })
  }
}

function shiftTypeLabel(t) {
  return t === 'fixed' ? 'фикс' : 'процент'
}

async function selectWorkplace(id) {
  if (id === workplace.currentId) return
  try {
    await workplace.setCurrent(id)
  } catch (e) {
    ui.toastError(e.message || 'Не удалось переключить заведение')
  }
}

function openCreateForm() {
  editingWorkplace.value = null
  formVisible.value = true
}

function openEditForm(w) {
  editingWorkplace.value = w
  formVisible.value = true
}

function closeForm() {
  formVisible.value = false
  editingWorkplace.value = null
}

async function unarchiveWorkplace(id) {
  try {
    await workplace.unarchive(id)
    ui.toastSuccess('Заведение восстановлено')
  } catch (e) {
    ui.toastError(e.message || 'Не удалось восстановить')
  }
}
</script>

<style scoped>
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  background-color: var(--wn-bg);
  min-height: 100vh;
  color: var(--wn-ink);
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.back-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--wn-ink);
  cursor: pointer;
  padding: 4px 8px;
}

.title {
  flex: 1;
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--wn-ink);
}

.btn-add {
  background-color: var(--wn-accent);
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--wn-ink-mute);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card {
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.card--current {
  border-color: var(--wn-accent);
}

.card--archived {
  opacity: 0.65;
  cursor: default;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--wn-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background-color: var(--wn-accent-fill);
  color: var(--wn-accent-text);
  font-weight: 500;
  white-space: nowrap;
}

.card-badge--muted {
  background-color: var(--wn-bg-recessed);
  color: var(--wn-ink-mute);
}

.card-meta {
  font-size: 12px;
  color: var(--wn-ink-mute);
}

.card-action {
  background: none;
  border: none;
  font-size: 18px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 6px;
}
.card-action:active {
  background-color: var(--wn-bg-recessed);
}

.empty {
  padding: 60px 20px;
  text-align: center;
}

.empty-text {
  color: var(--wn-ink-mute);
  font-size: 14px;
  margin-bottom: 16px;
}

.btn-primary {
  background-color: var(--wn-accent);
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
}
</style>