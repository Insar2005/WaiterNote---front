<template>
  <div class="page">
    <header class="header">
      <div class="header-left">
        <h1 class="title">Заметки</h1>
        <label v-if="notes.archived.length > 0" class="archive-toggle">
          <input v-model="showArchived" type="checkbox" />
          <span>Архив ({{ notes.archived.length }})</span>
        </label>
      </div>
      <WorkplaceSwitcher />
    </header>

    <!-- Search -->
    <div class="search-wrap">
      <input
        v-model="searchQuery"
        type="search"
        class="search-input"
        placeholder="Поиск по заметкам…"
      />
      <button
        v-if="searchQuery"
        class="search-clear"
        @click="searchQuery = ''"
        aria-label="Очистить"
      >
        ×
      </button>
    </div>

    <!-- Tabs (hidden when searching) -->
    <div v-if="!searchQuery" class="tabs">
      <button
        v-for="tab in availableTabs"
        :key="tab.key"
        class="tab"
        :class="{ 'tab--active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="tab-count">{{ tab.count }}</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="notes.isLoading && notes.items.length === 0" class="loading">
      <div class="spinner" />
    </div>

    <!-- Empty -->
    <div v-else-if="visibleNotes.length === 0" class="empty">
      <p class="empty-text">
        <template v-if="searchQuery">Ничего не найдено</template>
        <template v-else-if="showArchived && notes.archived.length === 0">
          В архиве пусто
        </template>
        <template v-else-if="notes.totalCount === 0">
          Пока нет заметок
        </template>
        <template v-else>В этой вкладке пусто</template>
      </p>
      <button
        v-if="notes.totalCount === 0 && !searchQuery"
        class="btn-primary"
        @click="openCreate"
      >
        Создать первую
      </button>
    </div>

    <!-- List -->
    <div v-else class="list">
      <NoteCard
        v-for="note in visibleNotes"
        :key="note.id"
        :note="note"
        @edit="openEdit"
      />
    </div>

    <!-- FAB -->
    <button v-if="!showArchived" class="fab" @click="openCreate" aria-label="Новая заметка">
      +
    </button>

    <NoteFormModal
      v-if="formVisible"
      :initial="editingNote"
      :default-scope="defaultScopeForCreate"
      @close="closeForm"
      @saved="closeForm"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useNotesStore } from '@/stores/notes'
import { useWorkplaceStore } from '@/stores/workplace'
import { useShiftStore } from '@/stores/shift'
import WorkplaceSwitcher from '@/components/WorkplaceSwitcher.vue'
import NoteCard from './NoteCard.vue'
import NoteFormModal from './NoteFormModal.vue'

const notes = useNotesStore()
const workplace = useWorkplaceStore()
const shift = useShiftStore()

const searchQuery = ref('')
const showArchived = ref(false)
const activeTab = ref('all') // 'all' | 'workplace' | 'shift' | 'global'

const formVisible = ref(false)
const editingNote = ref(null)

/** Tabs visible in the UI. Workplace/shift tabs only when context is available. */
const availableTabs = computed(() => {
  const tabs = [{ key: 'all', label: 'Все', count: notes.active.length }]

  if (workplace.currentId) {
    tabs.push({
      key: 'workplace',
      label: 'Заведение',
      count: notes.byWorkplace(workplace.currentId).length,
    })
  }

  if (shift.current) {
    tabs.push({
      key: 'shift',
      label: 'Смена',
      count: notes.byShift(shift.current.id).length,
    })
  }

  tabs.push({ key: 'global', label: 'Личное', count: notes.byScope('global').length })
  return tabs
})

/** Filtered list shown in current view. */
const visibleNotes = computed(() => {
  // Search overrides everything
  if (searchQuery.value) {
    const q = searchQuery.value.trim().toLowerCase()
    if (!q) return []
    return (showArchived.value ? notes.sorted : notes.active).filter((n) => {
      return (
        n.header.toLowerCase().includes(q) ||
        (n.content || '').toLowerCase().includes(q)
      )
    })
  }

  if (showArchived.value) return notes.archived

  switch (activeTab.value) {
    case 'workplace':
      return workplace.currentId ? notes.byWorkplace(workplace.currentId) : []
    case 'shift':
      return shift.current ? notes.byShift(shift.current.id) : []
    case 'global':
      return notes.byScope('global')
    case 'all':
    default:
      return notes.active
  }
})

/** When creating, pre-select scope based on context the user is in. */
const defaultScopeForCreate = computed(() => {
  if (activeTab.value === 'shift' && shift.current) return 'shift'
  if (activeTab.value === 'workplace' && workplace.currentId) return 'workplace'
  if (activeTab.value === 'global') return 'global'
  return 'global'
})

function openCreate() {
  editingNote.value = null
  formVisible.value = true
}

function openEdit(note) {
  editingNote.value = note
  formVisible.value = true
}

function closeForm() {
  formVisible.value = false
  editingNote.value = null
}
</script>

<style scoped>
.page {
  padding: 16px;
  padding-bottom: 100px;
  max-width: 600px;
  margin: 0 auto;
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.header-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.title {
  font-size: 26px;
  font-weight: 700;
  margin: 0;
}

.archive-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--wn-ink-mute);
  cursor: pointer;
  user-select: none;
}

.archive-toggle input {
  accent-color: var(--wn-accent-text);
}

.search-wrap {
  position: relative;
  margin-bottom: 12px;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 14px;
  font-size: 14px;
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 10px;
  background-color: var(--wn-bg-elevated);
  outline: none;
  box-sizing: border-box;
  font-family: inherit;
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: var(--wn-accent-text);
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 18px;
  color: var(--wn-ink-faint);
  cursor: pointer;
  padding: 4px 8px;
}

.tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  margin-bottom: 14px;
  padding-bottom: 2px;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tab {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 18px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--wn-ink-soft);
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.tab--active {
  background-color: var(--wn-accent);
  border-color: var(--wn-accent-text);
  color: #fff;
}

.tab-count {
  font-size: 11px;
  background-color: rgba(0, 0, 0, 0.08);
  padding: 1px 6px;
  border-radius: 8px;
  font-weight: 500;
}

.tab--active .tab-count {
  background-color: rgba(255, 255, 255, 0.25);
}

.empty {
  background-color: var(--wn-bg-elevated);
  border-radius: 12px;
  padding: 32px 16px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.empty-text {
  margin: 0;
  color: var(--wn-ink-mute);
  font-size: 14px;
}

.btn-primary {
  background-color: var(--wn-accent);
  color: #fff;
  border: none;
  padding: 10px 22px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.loading {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--wn-bg-recessed);
  border-top-color: var(--wn-accent-text);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fab {
  position: fixed;
  right: 20px;
  bottom: calc(80px + env(safe-area-inset-bottom));
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: var(--wn-accent);
  color: #fff;
  border: none;
  font-size: 28px;
  line-height: 1;
  box-shadow: 0 4px 14px rgba(76, 175, 80, 0.4);
  cursor: pointer;
  z-index: 10;
  transition: transform 0.15s ease;
}

.fab:active {
  transform: scale(0.92);
}
</style>