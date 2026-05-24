<template>
  <div class="page">
    <header class="header">
      <h1 class="title">Профиль</h1>
      <p class="subtitle">@{{ auth.user?.username || 'без имени' }}</p>
    </header>

    <!-- Account: Telegram ID with hide/copy -->
    <section class="section">
      <h2 class="section-title">Аккаунт</h2>
      <div class="tg-id-row">
        <div class="tg-id-info">
          <span class="tg-id-label">Telegram ID</span>
          <span class="tg-id-value">
            {{ idRevealed ? tgId : maskedId }}
          </span>
        </div>
        <div class="tg-id-actions">
          <button
            class="tg-id-btn"
            :aria-label="idRevealed ? 'Скрыть' : 'Показать'"
            @click="idRevealed = !idRevealed"
          >
            {{ idRevealed ? '🙈' : '👁️' }}
          </button>
          <button
            class="tg-id-btn"
            aria-label="Скопировать"
            @click="copyId"
          >
            📋
          </button>
        </div>
      </div>
      <p class="tg-id-hint">
        ID может понадобиться, чтобы поделиться меню или картой залов
        с коллегой.
      </p>
    </section>

    <!-- Settings of current workplace -->
    <section v-if="workplace.current" class="section">
      <h2 class="section-title">Настройки заведения</h2>
      <div class="list">
        <button class="action-row" @click="goToMenu">
          <span class="action-icon">🍽️</span>
          <span class="action-text">
            <span class="action-name">Меню</span>
            <span class="action-meta">{{ menu.totalItemCount }} позиций</span>
          </span>
          <span class="action-chev">›</span>
        </button>

        <button class="action-row" @click="goToHallEditor">
          <span class="action-icon">🪑</span>
          <span class="action-text">
            <span class="action-name">Карта столов</span>
            <span class="action-meta">{{ hallSummary }}</span>
          </span>
          <span class="action-chev">›</span>
        </button>
      </div>
    </section>

    <!-- Workplaces list -->
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">Заведения</h2>
        <button class="btn-add" @click="openCreateForm">+ Добавить</button>
      </div>

      <div v-if="workplace.isEmpty" class="empty">
        <p class="empty-text">У вас пока нет ни одного заведения.</p>
        <button class="btn-primary" @click="openCreateForm">Создать первое</button>
      </div>

      <div v-else class="list">
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
          >
            ↻
          </button>
        </div>
      </div>
    </section>

    <!-- Dev tools (mock mode only, dev build only) -->
    <section v-if="showDevTools" class="section section--dev">
      <h2 class="section-title">Dev</h2>
      <div class="dev-actions">
        <button class="btn-dev" @click="onSeed">📦 Заполнить демо-данными</button>
        <button class="btn-dev btn-dev--danger" @click="onResetMock">
          🗑 Сбросить mock БД
        </button>
      </div>
      <p class="dev-hint">
        Эти кнопки видны только в dev-сборке при USE_MOCK=true.
      </p>
    </section>

    <WorkplaceFormModal
      v-if="formVisible"
      :initial="editingWorkplace"
      @close="closeForm"
      @saved="closeForm"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useWorkplaceStore } from '@/stores/workplace'
import { useMenuStore } from '@/stores/menu'
import { useHallStore } from '@/stores/hall'
import { useUiStore } from '@/stores/ui'
import { formatMoney } from '@/utils/format'
import { USE_MOCK } from '@/api/client'
import WorkplaceFormModal from '@/components/WorkplaceFormModal.vue'

const router = useRouter()
const auth = useAuthStore()
const workplace = useWorkplaceStore()
const menu = useMenuStore()
const hall = useHallStore()
const ui = useUiStore()

const formVisible = ref(false)
const editingWorkplace = ref(null)

// --- Telegram ID display ---
// Hidden by default — the ID is semi-private. The user can reveal it
// (e.g. to read it aloud) or copy it straight to the clipboard.
const idRevealed = ref(false)

const tgId = computed(() => {
  const id = auth.user?.tg_id
  return id != null ? String(id) : '—'
})

/** Masked form: keep the same character count so the layout doesn't jump. */
const maskedId = computed(() => {
  const len = tgId.value.length
  return len > 0 && tgId.value !== '—' ? '•'.repeat(len) : '—'
})

async function copyId() {
  const value = tgId.value
  if (!value || value === '—') return
  try {
    await navigator.clipboard.writeText(value)
    ui.toastSuccess('ID скопирован')
  } catch {
    // clipboard API can fail (permissions, insecure context) — fall back
    // to revealing the ID so the user can copy it manually.
    idRevealed.value = true
    ui.toastInfo('Не удалось скопировать — ID показан, скопируйте вручную')
  }
}

// Show Dev tools whenever the app is running on mock data —
// useful both in `npm run dev` and in deployed demo builds where
// VITE_USE_MOCK=true. We deliberately don't gate on import.meta.env.DEV
// so testers can seed/reset the local DB on the deployed Firebase build.
const showDevTools = computed(() => USE_MOCK)

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

async function selectWorkplace(id) {
  if (id === workplace.currentId) return
  try {
    await workplace.setCurrent(id)
  } catch (e) {
    ui.toastError(e.message)
  }
}

async function unarchiveWorkplace(id) {
  try {
    await workplace.unarchive(id)
    ui.toastSuccess('Восстановлено')
  } catch (e) {
    ui.toastError(e.message)
  }
}

function shiftTypeLabel(type) {
  return type === 'percent' ? 'процент' : 'фикс'
}

function goToMenu() {
  router.push({ name: 'menu' })
}

function goToHallEditor() {
  router.push({ name: 'hall-editor' })
}

const hallSummary = computed(() => {
  const halls = hall.sortedHalls.length
  const tables = hall.tables.length
  if (!halls) return 'нет залов'
  return `${halls} ${pluralize(halls, ['зал', 'зала', 'залов'])}, ${tables} ${pluralize(tables, ['стол', 'стола', 'столов'])}`
})

function pluralize(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

// === Dev actions ===

async function onSeed() {
  const ok = await ui.confirm({
    title: 'Заполнить демо-данными?',
    message: 'Будет создано: заведение, зал с 5 столами, меню, открытая смена и пара заказов. Существующие данные сохранятся.',
    confirmText: 'Заполнить',
  })
  if (!ok) return

  try {
    const { seedDemo } = await import('@/mocks/db')
    seedDemo()
    ui.toastSuccess('Демо-данные созданы. Перезагрузка…')
    setTimeout(() => window.location.reload(), 600)
  } catch (e) {
    ui.toastError(e.message || 'Не удалось заполнить демо')
  }
}

async function onResetMock() {
  const ok = await ui.confirm({
    title: 'Сбросить всё?',
    message: 'Все workplace, столы, меню, смены и заметки будут удалены. Это локальная mock БД.',
    confirmText: 'Сбросить',
    danger: true,
  })
  if (!ok) return

  try {
    const { resetDb } = await import('@/mocks/db')
    resetDb()
    ui.toastSuccess('Сброшено. Перезагрузка…')
    setTimeout(() => window.location.reload(), 600)
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
  margin-bottom: 24px;
}

.title {
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 4px 0;
}

.subtitle {
  margin: 0;
  color: #888;
  font-size: 14px;
}

.section {
  margin-bottom: 28px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px 0;
}

.section-header .section-title {
  margin-bottom: 0;
}

/* Telegram ID block */
.tg-id-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  background-color: #fff;
  border: 1px solid #eee;
  border-radius: 12px;
}

.tg-id-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tg-id-label {
  font-size: 12px;
  color: #888;
}

.tg-id-value {
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tg-id-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.tg-id-btn {
  width: 38px;
  height: 38px;
  border: none;
  border-radius: 10px;
  background-color: #f0f0f2;
  font-size: 16px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.15s ease;
}

.tg-id-btn:active {
  background-color: #e3e3e6;
}

.tg-id-hint {
  margin: 8px 2px 0;
  font-size: 12px;
  line-height: 1.4;
  color: #999;
}

.btn-add {
  background-color: transparent;
  border: 1px solid #4caf50;
  color: #4caf50;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-add:active {
  opacity: 0.7;
}

.btn-primary {
  background-color: #4caf50;
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 32px 16px;
  background-color: #fff;
  border-radius: 12px;
  text-align: center;
}

.empty-text {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Action rows (Menu, Halls editor etc.) */
.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background-color: #fff;
  padding: 14px 16px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background-color 0.15s ease;
}

.action-row:active {
  background-color: #f5f5f5;
}

.action-row--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-icon {
  font-size: 22px;
}

.action-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-name {
  font-size: 15px;
  font-weight: 500;
  color: #1a1a1a;
}

.action-meta {
  font-size: 12px;
  color: #888;
}

.action-chev {
  font-size: 18px;
  color: #ccc;
}

/* Workplace cards */
.card {
  display: flex;
  align-items: center;
  gap: 8px;
  background-color: #fff;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s ease;
}

.card:active {
  opacity: 0.85;
}

.card--current {
  border-color: #4caf50;
}

.card--archived {
  opacity: 0.7;
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
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.card-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 6px;
  background-color: #e8f5e9;
  color: #2e7d32;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.card-badge--muted {
  background-color: #f0f0f0;
  color: #666;
}

.card-meta {
  font-size: 12px;
  color: #888;
}

.card-action {
  background: none;
  border: none;
  padding: 8px;
  font-size: 16px;
  cursor: pointer;
  border-radius: 8px;
  flex-shrink: 0;
}

.card-action:active {
  background-color: #f0f0f0;
}

/* === Dev tools === */
.section--dev {
  margin-top: 32px;
  padding: 16px;
  background-color: #fff8e1;
  border: 1px dashed #ffe082;
  border-radius: 12px;
}

.section--dev .section-title {
  color: #ef6c00;
  margin-bottom: 10px;
}

.dev-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-dev {
  background-color: #fff;
  color: #333;
  border: 1px solid #ffd54f;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.btn-dev:active {
  background-color: #fffde7;
}

.btn-dev--danger {
  border-color: #ffab91;
  color: #c62828;
}

.dev-hint {
  margin: 8px 0 0 0;
  font-size: 11px;
  color: #888;
  font-style: italic;
}
</style>