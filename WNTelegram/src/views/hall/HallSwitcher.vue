<template>
  <div class="switcher">
    <button
      v-for="h in halls"
      :key="h.id"
      class="tab"
      :class="{ 'tab--active': h.id === activeId }"
      @click="$emit('select', h.id)"
    >
      {{ h.name }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  halls: { type: Array, required: true },
  activeId: { type: String, default: null },
})
defineEmits(['select'])
</script>

<style scoped>
.switcher {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding: 4px 16px;
  background-color: #fff;
  border-bottom: 1px solid #eee;
}

.switcher::-webkit-scrollbar {
  display: none;
}

.tab {
  flex-shrink: 0;
  background: none;
  border: none;
  padding: 8px 14px;
  border-radius: 18px;
  font-size: 13px;
  font-weight: 500;
  color: #666;
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.tab:active {
  opacity: 0.8;
}

.tab--active {
  background-color: #4caf50;
  color: #fff;
}
</style>