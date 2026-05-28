<template>
  <div class="page">
    <!-- ============ Header ============ -->
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">Импорт меню и залов</h1>
    </header>

    <!-- ============ State 1: enter code ============ -->
    <template v-if="!preview && !applying">
      <section class="section">
        <p class="hint">
          Введи код, которым с тобой поделились — посмотришь, какие
          залы и меню можно скопировать в твоё заведение.
        </p>

        <label class="field">
          <span class="field-label">Код</span>
          <input
            ref="codeInputEl"
            v-model="codeInput"
            class="field-input field-input--code"
            type="text"
            placeholder="WN7K3MAB"
            maxlength="16"
            inputmode="latin"
            autocapitalize="characters"
            autocorrect="off"
            spellcheck="false"
            @keydown.enter="onLoadPreview"
          />
        </label>

        <button
          class="btn btn--primary"
          :disabled="!codeReady || loading"
          @click="onLoadPreview"
        >
          {{ loading ? 'Загружаем…' : 'Посмотреть, что внутри' }}
        </button>
      </section>
    </template>

    <!-- ============ State 2: preview + selection ============ -->
    <template v-else-if="preview && !applying">
      <section class="section">
        <p class="src-title">
          От: <strong>{{ preview.source_workplace_title }}</strong>
        </p>
        <p class="hint">
          Отметь, что скопировать в
          <strong>{{ workplace.current?.title || 'своё заведение' }}</strong>.
          Существующие данные не пропадут — копии добавятся к ним.
        </p>
      </section>

      <!-- Halls -->
      <section v-if="preview.halls.length > 0" class="section">
        <div class="section-head">
          <h2 class="section-title">Залы</h2>
          <button class="link-btn" @click="toggleAllHalls">
            {{ allHallsSelected ? 'Снять все' : 'Выбрать все' }}
          </button>
        </div>
        <label
          v-for="h in preview.halls"
          :key="h.id"
          class="row"
        >
          <input
            type="checkbox"
            :checked="selectedHalls.has(h.id)"
            @change="toggleHall(h.id)"
          />
          <span class="row-main">
            <span class="row-title">{{ h.name }}</span>
            <span class="row-meta">
              {{ h.tables_count }} {{ pluralize(h.tables_count, ['стол', 'стола', 'столов']) }}
              <template v-if="h.layouts_count > 0">
                · {{ h.layouts_count }}
                {{ pluralize(h.layouts_count, ['шаблон', 'шаблона', 'шаблонов']) }}
              </template>
            </span>
          </span>
        </label>
      </section>

      <!-- Menu categories -->
      <section v-if="preview.categories.length > 0" class="section">
        <div class="section-head">
          <h2 class="section-title">Меню</h2>
          <button class="link-btn" @click="toggleAllCategories">
            {{ allCategoriesSelected ? 'Снять все' : 'Выбрать все' }}
          </button>
        </div>
        <label
          v-for="c in preview.categories"
          :key="c.id"
          class="row"
        >
          <input
            type="checkbox"
            :checked="selectedCategories.has(c.id)"
            @change="toggleCategory(c.id)"
          />
          <span class="row-main">
            <span class="row-title">{{ c.title }}</span>
            <span class="row-meta">
              {{ c.items_count }} {{ pluralize(c.items_count, ['позиция', 'позиции', 'позиций']) }}
            </span>
          </span>
        </label>
      </section>

      <!-- Nothing to import -->
      <section
        v-if="preview.halls.length === 0 && preview.categories.length === 0"
        class="section"
      >
        <p class="empty">В этом заведении пока нет ни залов, ни меню.</p>
      </section>

      <!-- Footer action -->
      <footer class="footer">
        <button class="btn btn--ghost" @click="onResetPreview">
          Другой код
        </button>
        <button
          class="btn btn--primary btn--grow"
          :disabled="!hasSelection"
          @click="onApply"
        >
          {{ applyLabel }}
        </button>
      </footer>
    </template>

    <!-- ============ State 3: applying ============ -->
    <template v-else-if="applying">
      <section class="section">
        <div class="spinner-row">
          <div class="spinner" />
          <p>Копируем…</p>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useImportsStore } from '@/stores/imports'
import { useWorkplaceStore } from '@/stores/workplace'
import { useMenuStore } from '@/stores/menu'
import { useHallStore } from '@/stores/hall'
import { useUiStore } from '@/stores/ui'

const route = useRoute()
const router = useRouter()
const imports = useImportsStore()
const workplace = useWorkplaceStore()
const menu = useMenuStore()
const hall = useHallStore()
const ui = useUiStore()

// ----- Input state -----
const codeInput = ref('')
const codeInputEl = ref(null)
const loading = ref(false)
const applying = ref(false)

// Selection state — kept as Sets so toggle is O(1) and the v-for renders
// remain stable. Pre-populated to "all selected" once preview lands so the
// common case ("import everything") is one tap.
const selectedHalls = ref(new Set())
const selectedCategories = ref(new Set())

const preview = computed(() => imports.preview)

// ----- Code normalisation -----
// Store the code uppercase + stripped of spaces/dashes so the user can
// paste "wn 7k3m-ab" and we still hit the right share. The server stores
// codes as plain uppercase letters/digits.
const normalisedCode = computed(() =>
  codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
)
const codeReady = computed(() => normalisedCode.value.length >= 4)

// ----- "Select all" helpers -----
const allHallsSelected = computed(
  () =>
    preview.value?.halls.length > 0 &&
    preview.value.halls.every((h) => selectedHalls.value.has(h.id)),
)
const allCategoriesSelected = computed(
  () =>
    preview.value?.categories.length > 0 &&
    preview.value.categories.every((c) => selectedCategories.value.has(c.id)),
)

const hasSelection = computed(
  () => selectedHalls.value.size > 0 || selectedCategories.value.size > 0,
)

const applyLabel = computed(() => {
  const halls = selectedHalls.value.size
  const cats = selectedCategories.value.size
  const parts = []
  if (halls > 0) parts.push(`${halls} ${pluralize(halls, ['зал', 'зала', 'залов'])}`)
  if (cats > 0)
    parts.push(`${cats} ${pluralize(cats, ['категорию', 'категории', 'категорий'])}`)
  if (parts.length === 0) return 'Импортировать'
  return `Импортировать ${parts.join(' и ')}`
})

// ----- Boot: prefill from query (?code=…), focus input -----
onMounted(() => {
  const queryCode = (route.query?.code || '').toString()
  if (queryCode) {
    codeInput.value = queryCode
    // Don't auto-fetch — give the user a moment to confirm what they
    // landed on. They'll see the code already filled, just press the
    // button. This makes the deep-link UX explicit, no surprises.
  } else {
    // Empty form: focus the input so the keyboard pops on mobile.
    nextTick(() => codeInputEl.value?.focus?.())
  }
})

// ----- Actions -----
async function onLoadPreview() {
  if (!codeReady.value || loading.value) return
  loading.value = true
  try {
    await imports.fetchPreview(normalisedCode.value)
    // Default = everything selected. Most imports want all of it; if the
    // user wants only part, they uncheck the rest. Less clicks for the
    // common case.
    selectedHalls.value = new Set(imports.preview.halls.map((h) => h.id))
    selectedCategories.value = new Set(
      imports.preview.categories.map((c) => c.id),
    )
  } catch (e) {
    ui.toastError(e.message || 'Не удалось загрузить превью')
  } finally {
    loading.value = false
  }
}

function onResetPreview() {
  imports.clearPreview()
  selectedHalls.value = new Set()
  selectedCategories.value = new Set()
  nextTick(() => codeInputEl.value?.focus?.())
}

function toggleHall(id) {
  const s = new Set(selectedHalls.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedHalls.value = s
}
function toggleCategory(id) {
  const s = new Set(selectedCategories.value)
  s.has(id) ? s.delete(id) : s.add(id)
  selectedCategories.value = s
}
function toggleAllHalls() {
  selectedHalls.value = allHallsSelected.value
    ? new Set()
    : new Set(preview.value.halls.map((h) => h.id))
}
function toggleAllCategories() {
  selectedCategories.value = allCategoriesSelected.value
    ? new Set()
    : new Set(preview.value.categories.map((c) => c.id))
}

async function onApply() {
  if (!hasSelection.value || applying.value) return
  if (!workplace.currentId) {
    ui.toastError('Сначала выбери заведение, в которое импортировать')
    return
  }

  applying.value = true
  try {
    const result = await imports.applyImport({
      code: imports.previewCode,
      target_workplace_id: workplace.currentId,
      hall_ids: Array.from(selectedHalls.value),
      category_ids: Array.from(selectedCategories.value),
    })

    // Refresh the target workplace's halls + menu so the imported content
    // shows up immediately if the user navigates straight to those screens.
    // Done in parallel; ignore errors here — a failed refetch doesn't
    // change the fact that the import succeeded server-side.
    await Promise.all([
      hall.fetchAll(workplace.currentId).catch(() => {}),
      menu.fetchAll(workplace.currentId).catch(() => {}),
    ])

    ui.toastSuccess(formatResult(result))
    imports.clearPreview()
    router.replace({ name: 'home' })
  } catch (e) {
    ui.toastError(e.message || 'Не удалось импортировать')
  } finally {
    applying.value = false
  }
}

function formatResult(r) {
  const parts = []
  if (r.halls_imported > 0) {
    parts.push(
      `${r.halls_imported} ${pluralize(r.halls_imported, ['зал', 'зала', 'залов'])}`,
    )
  }
  if (r.tables_imported > 0) {
    parts.push(
      `${r.tables_imported} ${pluralize(r.tables_imported, ['стол', 'стола', 'столов'])}`,
    )
  }
  if (r.layouts_imported > 0) {
    parts.push(
      `${r.layouts_imported} ${pluralize(r.layouts_imported, ['шаблон', 'шаблона', 'шаблонов'])}`,
    )
  }
  if (r.categories_imported > 0) {
    parts.push(
      `${r.categories_imported} ${pluralize(r.categories_imported, [
        'категория',
        'категории',
        'категорий',
      ])}`,
    )
  }
  if (r.items_imported > 0) {
    parts.push(
      `${r.items_imported} ${pluralize(r.items_imported, [
        'позиция',
        'позиции',
        'позиций',
      ])}`,
    )
  }
  return parts.length > 0
    ? `Скопировано: ${parts.join(', ')}`
    : 'Импорт выполнен'
}

function pluralize(n, forms) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b > 1 && b < 5) return forms[1]
  if (b === 1) return forms[0]
  return forms[2]
}

function goBack() {
  router.back()
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background-color: #f5f5f7;
  padding-bottom: 96px;
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

.section {
  background-color: #fff;
  margin: 12px;
  border-radius: 12px;
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
}

.section-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
}

.link-btn {
  background: none;
  border: none;
  color: #4caf50;
  font-size: 13px;
  cursor: pointer;
  padding: 4px;
}

.src-title {
  margin: 0 0 6px;
  font-size: 14px;
  color: #1a1a1a;
}

.hint {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.45;
  color: #666;
}

.empty {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  color: #999;
  font-size: 14px;
}

/* Form */
.field {
  display: block;
  margin-bottom: 16px;
}

.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  font-weight: 500;
  color: #444;
}

.field-input {
  width: 100%;
  padding: 12px 14px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 10px;
  box-sizing: border-box;
}

.field-input--code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  text-align: center;
}

/* Rows for halls / categories */
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
  cursor: pointer;
}
.row:last-child {
  border-bottom: none;
}

.row input[type="checkbox"] {
  width: 20px;
  height: 20px;
  accent-color: #4caf50;
  flex-shrink: 0;
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.row-title {
  font-size: 14px;
  font-weight: 500;
  color: #1a1a1a;
}

.row-meta {
  font-size: 12px;
  color: #888;
}

/* Buttons */
.btn {
  border: none;
  border-radius: 10px;
  padding: 12px 16px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}
.btn--primary {
  background-color: #4caf50;
  color: #fff;
  width: 100%;
}
.btn--primary:disabled {
  opacity: 0.5;
}
.btn--ghost {
  background-color: #f0f0f0;
  color: #333;
}
.btn--grow {
  flex: 1;
}

.footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #fff;
  border-top: 1px solid #eee;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  display: flex;
  gap: 10px;
  z-index: 10;
}

/* Spinner */
.spinner-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 40px 0;
}

.spinner-row p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e0e0e0;
  border-top-color: #4caf50;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>