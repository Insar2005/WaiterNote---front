<template>
  <div class="page">
    <!-- Compact account header — username + Telegram ID. Stays on the
         root profile screen by design; everything else is drilled into. -->
    <header class="header">
      <div class="header-row">
        <div class="header-main">
          <h1 class="title">Профиль</h1>
          <p class="subtitle">@{{ auth.user?.username || 'без имени' }}</p>
        </div>
      </div>

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
    </header>

    <!-- Current workplace — clickable to edit. The card-current style
         from the old workplace list is reused so it feels familiar. -->
    <section v-if="workplace.current" class="section">
      <h2 class="section-title">Текущее заведение</h2>
      <div
        class="card card--current"
        @click="openEditCurrentWorkplace"
        role="button"
        tabindex="0"
        @keydown.enter="openEditCurrentWorkplace"
      >
        <div class="card-main">
          <div class="card-title-row">
            <span class="card-title">{{ workplace.current.title }}</span>
            <span
              v-if="workplace.current.my_role !== 'owner'"
              class="card-badge card-badge--muted"
            >
              участник
            </span>
          </div>
          <div class="card-meta">
            {{ workplace.current.currency }} ·
            {{ shiftTypeLabel(workplace.current.shift_type_default) }}
            <template v-if="workplace.current.shift_type_default === 'fixed'">
              · {{ formatMoney(workplace.current.pay_for_shift_default, workplace.current.currency) }}/смена
            </template>
            <template v-else>
              · {{ workplace.current.service_percent_default }}%
            </template>
          </div>
        </div>
        <span class="card-chev">›</span>
      </div>
    </section>

    <!-- Action menu. Each row drills into a sub-screen at /profile/*.
         Order matters: appearance + menu/hall up top (used often),
         share + workplaces below (used occasionally), dev tools last. -->
    <section class="section">
      <h2 class="section-title">Настройки</h2>
      <div class="list">
        <button class="action-row" @click="go('profile-appearance')">
          <span class="action-icon">🎨</span>
          <span class="action-text">
            <span class="action-name">Персонализация</span>
            <span class="action-meta">{{ accentLabel }} · {{ themeLabel }}</span>
          </span>
          <span class="action-chev">›</span>
        </button>

        <button
          v-if="workplace.current"
          class="action-row"
          @click="goToMenu"
        >
          <span class="action-icon">🍽️</span>
          <span class="action-text">
            <span class="action-name">Меню</span>
            <span class="action-meta">{{ menu.totalItemCount }} позиций</span>
          </span>
          <span class="action-chev">›</span>
        </button>

        <button
          v-if="workplace.current"
          class="action-row"
          @click="goToHallEditor"
        >
          <span class="action-icon">🪑</span>
          <span class="action-text">
            <span class="action-name">Карта столов</span>
            <span class="action-meta">{{ hallSummary }}</span>
          </span>
          <span class="action-chev">›</span>
        </button>

        <button
          v-if="workplace.current"
          class="action-row"
          @click="go('profile-share')"
        >
          <span class="action-icon">🔗</span>
          <span class="action-text">
            <span class="action-name">Поделиться меню и залами</span>
            <span class="action-meta">Создать ссылку или импортировать</span>
          </span>
          <span class="action-chev">›</span>
        </button>

        <button class="action-row" @click="go('profile-workplaces')">
          <span class="action-icon">🏢</span>
          <span class="action-text">
            <span class="action-name">Все заведения</span>
            <span class="action-meta">{{ workplacesSummary }}</span>
          </span>
          <span class="action-chev">›</span>
        </button>

        <button
          v-if="showDevTools"
          class="action-row"
          @click="go('profile-dev')"
        >
          <span class="action-icon">🛠</span>
          <span class="action-text">
            <span class="action-name">Dev tools</span>
            <span class="action-meta">mock-режим</span>
          </span>
          <span class="action-chev">›</span>
        </button>
      </div>
    </section>

    <!-- Edit-current-workplace modal lives here because the current
         workplace card is the entry point. Other workplace editing
         happens inside the Workplaces sub-screen. -->
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
import { useSettingsStore, ACCENTS, THEME_OPTIONS } from '@/stores/settings'
import { formatMoney } from '@/utils/format'
import { USE_MOCK } from '@/api/client'
import WorkplaceFormModal from '@/components/WorkplaceFormModal.vue'

const router = useRouter()
const auth = useAuthStore()
const workplace = useWorkplaceStore()
const menu = useMenuStore()
const hall = useHallStore()
const ui = useUiStore()
const settings = useSettingsStore()

const formVisible = ref(false)
const editingWorkplace = ref(null)

// === Telegram ID ===
const idRevealed = ref(false)

const tgId = computed(() => {
  const id = auth.user?.tg_id
  return id != null ? String(id) : '—'
})

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
    idRevealed.value = true
    ui.toastInfo('Не удалось скопировать — ID показан, скопируйте вручную')
  }
}

// === Action meta strings ===
const accentLabel = computed(() => {
  const a = ACCENTS.find((x) => x.key === settings.accentKey)
  return a ? a.label : 'Зелёный'
})

const themeLabel = computed(() => {
  const t = THEME_OPTIONS.find((x) => x.key === settings.theme)
  return t ? t.label : 'Авто'
})

const hallSummary = computed(() => {
  const halls = hall.halls?.length ?? 0
  // hall.tables is the flat list of all tables across all halls in the
  // current workplace, kept by the hall store. Avoids walking per-hall
  // arrays which the store doesn't normalize.
  const tables = hall.tables?.length ?? 0
  if (halls === 0) return 'нет залов'
  return `${halls} ${pluralize(halls, ['зал', 'зала', 'залов'])}, ${tables} ${pluralize(tables, ['стол', 'стола', 'столов'])}`
})

const workplacesSummary = computed(() => {
  const active = workplace.activeList?.length ?? 0
  const archived = workplace.archivedList?.length ?? 0
  if (active === 0 && archived === 0) return 'пусто'
  const parts = [`${active} ${pluralize(active, ['активное', 'активных', 'активных'])}`]
  if (archived > 0) parts.push(`+ ${archived} в архиве`)
  return parts.join(' ')
})

function pluralize(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

function shiftTypeLabel(t) {
  return t === 'fixed' ? 'фикс' : 'процент'
}

// === Navigation ===
function go(name) {
  router.push({ name })
}

function goToMenu() {
  router.push({ name: 'menu' })
}

function goToHallEditor() {
  router.push({ name: 'hall-editor' })
}

// === Current workplace editing ===
function openEditCurrentWorkplace() {
  if (!workplace.current) return
  // Members can't edit — show a friendly note instead of opening a
  // form they can't submit (the modal handles the lockout, but the
  // tap feedback is nicer this way).
  if (workplace.current.my_role !== 'owner') {
    ui.toastInfo('Редактировать заведение может только владелец')
    return
  }
  editingWorkplace.value = workplace.current
  formVisible.value = true
}

function closeForm() {
  formVisible.value = false
  editingWorkplace.value = null
}

// === Dev tools visibility ===
// Mirror the previous gate: dev tools entry visible whenever the app
// is running on mock data, both in `npm run dev` and deployed demo builds.
const showDevTools = computed(() => USE_MOCK)
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
  margin-bottom: 24px;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.header-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
  color: var(--wn-ink);
}

.subtitle {
  margin: 0;
  color: var(--wn-ink-mute);
  font-size: 14px;
}

/* === Telegram ID row === */
.tg-id-row {
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tg-id-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tg-id-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--wn-ink-mute);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tg-id-value {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 14px;
  color: var(--wn-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tg-id-actions {
  display: flex;
  gap: 4px;
}

.tg-id-btn {
  background: none;
  border: none;
  font-size: 16px;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 6px;
}
.tg-id-btn:active {
  background-color: var(--wn-bg-recessed);
}

/* === Sections === */
.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--wn-ink-mute);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 10px 0;
}

/* === Current workplace card === */
.card {
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.card:active {
  background-color: var(--wn-bg-recessed);
}

.card--current {
  border-color: var(--wn-accent);
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

.card-chev {
  font-size: 22px;
  color: var(--wn-ink-mute);
  margin-left: 4px;
}

/* === Action menu list === */
.list {
  display: flex;
  flex-direction: column;
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 12px;
  overflow: hidden;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--wn-glass-border-subtle);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  width: 100%;
  transition: background-color 0.15s ease;
}

.action-row:last-child {
  border-bottom: none;
}

.action-row:active {
  background-color: var(--wn-bg-recessed);
}

.action-icon {
  font-size: 20px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
}

.action-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.action-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--wn-ink);
}

.action-meta {
  font-size: 12px;
  color: var(--wn-ink-mute);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-chev {
  font-size: 20px;
  color: var(--wn-ink-mute);
  flex-shrink: 0;
}
</style>