<template>
  <div class="cart">
    <div v-if="items.length === 0" class="empty">
      <p>Корзина пуста</p>
      <p class="empty-sub">Добавляйте позиции из меню</p>
    </div>

    <ul v-else class="items">
      <li v-for="item in items" :key="item.id" class="item">
        <div class="item-main">
          <div class="item-title-row">
            <span class="item-title">{{ item.title }}</span>
            <span class="item-price">{{ formatMoney(item.price * item.quantity, currency) }}</span>
          </div>

          <div class="item-meta">
            <span class="item-unit-price">
              {{ formatMoney(item.price, currency) }} × {{ item.quantity }}
            </span>
          </div>

          <!-- Comment is edited via the central PromptModal — that modal sits
               at the top of the screen and stays visible above the on-screen
               keyboard. Inline inputs here would be hidden when the keyboard
               opens (cart sheet is at the bottom). -->
          <div class="item-comment-row">
            <button
              v-if="!item.comment"
              class="add-comment-btn"
              @click="editComment(item)"
            >
              + Комментарий
            </button>
            <button
              v-else
              class="comment-display"
              @click="editComment(item)"
            >
              💬 {{ item.comment }}
            </button>
          </div>
        </div>

        <div class="item-actions">
          <button class="qty-btn" @click="$emit('dec', item.id)" aria-label="Меньше">−</button>
          <span class="qty">{{ item.quantity }}</span>
          <button class="qty-btn" @click="$emit('inc', item.id)" aria-label="Больше">+</button>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { formatMoney } from '@/utils/format'
import { useUiStore } from '@/stores/ui'

const props = defineProps({
  items: { type: Array, required: true },
  currency: { type: String, default: 'RUB' },
})

const emit = defineEmits(['inc', 'dec', 'update-comment'])

const ui = useUiStore()

/**
 * Open the central PromptModal for editing an item comment. The modal
 * is anchored to the top of the screen so it stays visible above the
 * on-screen keyboard — inline inputs in this bottom-sheet cart used to
 * be hidden by the keyboard.
 */
async function editComment(item) {
  const value = await ui.prompt({
    title: `Комментарий: ${item.title}`,
    initial: item.comment || '',
    placeholder: 'Например: без сахара',
    multiline: true,
    rows: 3,
    maxLength: 2000,
    confirmText: 'Сохранить',
  })
  if (value === null) return // user cancelled
  const trimmed = value.trim() || null
  emit('update-comment', item.id, trimmed)
}
</script>

<style scoped>
.cart {
  display: flex;
  flex-direction: column;
}

.empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--wn-ink-mute);
}

.empty p {
  margin: 0;
  font-size: 14px;
}

.empty-sub {
  margin-top: 4px !important;
  font-size: 12px;
  color: var(--wn-ink-faint);
}

.items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.item {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--wn-glass-border-subtle);
}

.item:last-child {
  border-bottom: none;
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-title-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 2px;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--wn-ink);
  line-height: 1.3;
}

.item-price {
  font-size: 14px;
  font-weight: 600;
  color: var(--wn-ink);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.item-meta {
  font-size: 11px;
  color: var(--wn-ink-mute);
  margin-bottom: 4px;
}

.item-unit-price {
  font-variant-numeric: tabular-nums;
}

.item-comment-row {
  margin-top: 4px;
}

.add-comment-btn {
  background: none;
  border: none;
  color: var(--wn-accent-text);
  font-size: 12px;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}

.comment-display {
  background: var(--wn-bg-recessed);
  border: none;
  color: var(--wn-ink-soft);
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  align-self: flex-start;
  margin-top: 2px;
}

.qty-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--wn-glass-border-subtle);
  background-color: var(--wn-bg-elevated);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  font-family: inherit;
  color: var(--wn-ink-soft);
  display: flex;
  align-items: center;
  justify-content: center;
}

.qty-btn:active {
  background-color: var(--wn-bg-recessed);
}

.qty {
  font-size: 14px;
  font-weight: 600;
  color: var(--wn-ink);
  min-width: 18px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>