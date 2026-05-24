<template>
  <div
    class="row"
    :class="{ 'row--inactive': !item.is_active }"
    @click="$emit('edit', item)"
  >
    <div class="row-main">
      <div class="row-title">
        <span>{{ item.title }}</span>
        <span v-if="!item.is_active" class="badge">скрыто</span>
      </div>
      <div v-if="item.description || item.portion" class="row-meta">
        <span v-if="item.portion" class="portion">{{ item.portion }}</span>
        <span v-if="item.description" class="description">{{ item.description }}</span>
      </div>
    </div>
    <div class="row-price">{{ formatMoney(item.price, currency) }}</div>
  </div>
</template>

<script setup>
import { formatMoney } from '@/utils/format'

defineProps({
  item: { type: Object, required: true },
  currency: { type: String, default: 'RUB' },
})
defineEmits(['edit'])
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background-color: #fff;
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.row:active {
  background-color: #f5f5f5;
}

.row--inactive {
  opacity: 0.55;
}

.row-main {
  flex: 1;
  min-width: 0;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 2px;
}

.badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 6px;
  border-radius: 4px;
  background-color: #f0f0f0;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.row-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.portion {
  flex-shrink: 0;
  color: #aaa;
}

.description {
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-price {
  font-size: 15px;
  font-weight: 600;
  color: #4caf50;
  flex-shrink: 0;
}
</style>