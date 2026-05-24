<template>
  <div class="chips" role="tablist">
    <button
      v-for="cat in categories"
      :key="cat.id"
      class="chip"
      :class="{
        'chip--active': cat.id === selectedId,
        'chip--inactive-cat': !cat.is_active,
      }"
      role="tab"
      :aria-selected="cat.id === selectedId"
      @click="$emit('select', cat.id)"
    >
      <span class="chip-text">{{ cat.title }}</span>
      <span v-if="!cat.is_active" class="chip-dot" title="Скрыта">●</span>
    </button>

    <!-- "+ new category" only makes sense in the menu editor; hide it in
         the order-builder where a waiter shouldn't accidentally switch
         contexts mid-order. -->
    <button
      v-if="editable"
      class="chip chip--add"
      @click="$emit('add')"
      aria-label="Новая категория"
    >
      +
    </button>
  </div>
</template>

<script setup>
defineProps({
  categories: { type: Array, required: true },
  selectedId: { type: String, default: null },
  /** Whether to show category-management UI (the "+" button). False in
      order-builder, true in menu editor. */
  editable: { type: Boolean, default: true },
})
defineEmits(['select', 'add'])
</script>

<style scoped>
.chips {
  display: flex;
  gap: 8px;
  padding: 4px 16px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.chips::-webkit-scrollbar {
  display: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid #e0e0e0;
  background-color: #fff;
  color: #333;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.chip:active {
  opacity: 0.8;
}

.chip--active {
  background-color: #4caf50;
  border-color: #4caf50;
  color: #fff;
}

.chip--inactive-cat .chip-text {
  text-decoration: line-through;
  opacity: 0.7;
}

.chip-dot {
  font-size: 8px;
  line-height: 1;
  color: #999;
}

.chip--active .chip-dot {
  color: rgba(255, 255, 255, 0.8);
}

.chip--add {
  font-size: 18px;
  padding: 4px 14px;
  color: #4caf50;
  border-style: dashed;
}
</style>