<template>
  <div class="page">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">Меню</h1>
      <span class="subtitle" v-if="workplace.current">
        {{ workplace.current.title }}
      </span>
    </header>

    <!-- No workplace selected — should be rare since redirect lives in App.vue -->
    <div v-if="!workplace.currentId" class="empty-screen">
      <p>Выберите заведение в Профиле</p>
    </div>

    <template v-else>
      <!-- Search -->
      <div class="search-wrap">
        <input
          v-model="searchQuery"
          type="search"
          class="search-input"
          placeholder="Поиск по меню…"
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

      <!-- Search results — replaces categories+items when query is non-empty -->
      <section v-if="searchQuery" class="search-results">
        <div v-if="searchResults.length === 0" class="empty">
          <p class="empty-text">Ничего не найдено</p>
        </div>
        <template v-else>
          <p class="search-count">Найдено: {{ searchResults.length }}</p>
          <div class="items-list">
            <MenuItemRow
              v-for="item in searchResults"
              :key="item.id"
              :item="item"
              :currency="workplace.currency"
              @edit="openItemEdit"
            />
          </div>
        </template>
      </section>

      <!-- Normal view -->
      <template v-else>
        <!-- Loading -->
        <div v-if="menu.isLoading && menu.allCategories.length === 0" class="loading">
          <div class="spinner" />
        </div>

        <!-- Empty -->
        <div
          v-else-if="menu.allCategories.length === 0"
          class="empty empty--full"
        >
          <p class="empty-text">Меню пустое</p>
          <button class="btn-primary" @click="openCategoryCreate">
            Создать первую категорию
          </button>
        </div>

        <!-- Categories + items -->
        <template v-else>
          <CategoryChips
            :categories="menu.allCategories"
            :selected-id="menu.selectedCategoryId"
            @select="menu.selectCategory"
            @add="openCategoryCreate"
          />

          <div class="category-actions" v-if="menu.selectedCategory">
            <span class="category-name">{{ menu.selectedCategory.title }}</span>
            <button class="link-btn" @click="openCategoryEdit(menu.selectedCategory)">
              Изменить
            </button>
          </div>

          <div class="items-list">
            <div v-if="menu.selectedItems.length === 0" class="empty">
              <p class="empty-text">В этой категории пока нет позиций</p>
            </div>
            <template v-else>
              <MenuItemRow
                v-for="item in menu.selectedItems"
                :key="item.id"
                :item="item"
                :currency="workplace.currency"
                @edit="openItemEdit"
              />
            </template>
          </div>
        </template>
      </template>

      <!-- FAB: add item to selected category -->
      <button
        v-if="!searchQuery && menu.selectedCategoryId"
        class="fab"
        @click="openItemCreate"
        aria-label="Добавить позицию"
      >
        +
      </button>
    </template>

    <CategoryFormModal
      v-if="categoryFormVisible"
      :initial="editingCategory"
      @close="closeCategoryForm"
      @saved="closeCategoryForm"
    />

    <MenuItemFormModal
      v-if="itemFormVisible"
      :initial="editingItem"
      :default-category-id="menu.selectedCategoryId"
      @close="closeItemForm"
      @saved="closeItemForm"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkplaceStore } from '@/stores/workplace'
import { useMenuStore } from '@/stores/menu'
import CategoryChips from './CategoryChips.vue'
import MenuItemRow from './MenuItemRow.vue'
import CategoryFormModal from './CategoryFormModal.vue'
import MenuItemFormModal from './MenuItemFormModal.vue'

const router = useRouter()
const workplace = useWorkplaceStore()
const menu = useMenuStore()

const searchQuery = ref('')

// Compute search results live. menu.searchItems is non-reactive on its own
// (it's a method), but when wrapped in computed it becomes reactive
// because it reads `menu.items`.
const searchResults = computed(() => menu.searchItems(searchQuery.value))

const categoryFormVisible = ref(false)
const editingCategory = ref(null)
const itemFormVisible = ref(false)
const editingItem = ref(null)

function goBack() {
  router.back()
}

function openCategoryCreate() {
  editingCategory.value = null
  categoryFormVisible.value = true
}

function openCategoryEdit(cat) {
  editingCategory.value = cat
  categoryFormVisible.value = true
}

function closeCategoryForm() {
  categoryFormVisible.value = false
  editingCategory.value = null
}

function openItemCreate() {
  editingItem.value = null
  itemFormVisible.value = true
}

function openItemEdit(item) {
  editingItem.value = item
  itemFormVisible.value = true
}

function closeItemForm() {
  itemFormVisible.value = false
  editingItem.value = null
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f5f5f7;
  padding-bottom: 80px;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background-color: #fff;
  border-bottom: 1px solid #eee;
  position: sticky;
  top: 0;
  z-index: 5;
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

.back-btn:active {
  opacity: 0.7;
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.subtitle {
  font-size: 12px;
  color: #888;
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
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
  transition: border-color 0.15s ease;
}

.search-input:focus {
  border-color: #4caf50;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 24px;
  transform: translateY(-50%);
  background: none;
  border: none;
  font-size: 18px;
  color: #aaa;
  cursor: pointer;
  padding: 4px 8px;
}

.category-actions {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 12px 16px 8px 16px;
}

.category-name {
  font-size: 13px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.link-btn {
  background: none;
  border: none;
  color: #4caf50;
  font-size: 13px;
  cursor: pointer;
  padding: 4px;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px;
}

.search-results {
  padding-top: 8px;
}

.search-count {
  font-size: 12px;
  color: #888;
  padding: 0 16px 8px 16px;
  margin: 0;
}

.empty {
  background-color: #fff;
  border-radius: 12px;
  padding: 32px 16px;
  text-align: center;
  margin: 0 16px;
}

.empty--full {
  margin-top: 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
}

.empty-text {
  margin: 0;
  color: #888;
  font-size: 14px;
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

.empty-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
}

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid #e0e0e0;
  border-top-color: #4caf50;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* FAB */
.fab {
  position: fixed;
  right: 20px;
  bottom: calc(20px + env(safe-area-inset-bottom));
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #4caf50;
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