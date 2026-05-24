<template>
  <button
    class="row"
    :class="{ 'row--in-cart': quantity > 0 }"
    @click="$emit('add', item)"
  >
    <div class="row-main">
      <div class="row-title">
        <span>{{ item.title }}</span>
        <span v-if="quantity > 0" class="badge">×{{ quantity }}</span>
      </div>
      <div v-if="item.description || item.portion" class="row-meta">
        <span v-if="item.portion" class="portion">{{ item.portion }}</span>
        <span v-if="item.description" class="description">{{ item.description }}</span>
      </div>
    </div>
    <div class="row-price">{{ formatMoney(item.price, currency) }}</div>
  </button>
</template>

<script setup>
import { formatMoney } from '@/utils/format'

defineProps({
  item: { type: Object, required: true },
  currency: { type: String, default: 'RUB' },
  quantity: { type: Number, default: 0 },
})
defineEmits(['add'])
</script>

<style scoped>
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  background-color: #fff;
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.row:active {
  background-color: #f5f5f5;
  transform: scale(0.99);
}

.row--in-cart {
  border-color: #4caf50;
  background-color: #f1f8e9;
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
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background-color: #4caf50;
  color: #fff;
  font-variant-numeric: tabular-nums;
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
  font-variant-numeric: tabular-nums;
}
</style>