<template>
  <div class="card">
    <div class="row-top">
      <code class="code" @click="$emit('copy-code', share)">{{ share.code }}</code>
      <button class="icon-btn icon-btn--danger" :title="'Закрыть'" @click="$emit('revoke', share)">
        ✕
      </button>
    </div>

    <div class="meta">
      <span class="meta-line">⏰ {{ timeLeft }}</span>
      <span class="meta-line">👤 импортов: {{ share.import_count }}</span>
    </div>

    <div class="actions">
      <button class="btn-action" @click="$emit('copy-code', share)">
        📋 Код
      </button>
      <button class="btn-action" @click="$emit('copy-link', share)">
        🔗 Ссылка
      </button>
      <button class="btn-action btn-action--primary" @click="$emit('share-link', share)">
        📤 Поделиться
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  share: { type: Object, required: true },
  botUsername: { type: String, default: 'waiternote_bot' },
})

defineEmits(['copy-code', 'copy-link', 'share-link', 'revoke'])

// Refresh "time left" every minute so the user sees the countdown move
// without having to leave and reopen the screen.
const now = ref(Math.floor(Date.now() / 1000))
let timer = null
onMounted(() => {
  timer = setInterval(() => {
    now.value = Math.floor(Date.now() / 1000)
  }, 60_000)
})
onUnmounted(() => clearInterval(timer))

const timeLeft = computed(() => {
  const seconds = props.share.expires_at - now.value
  if (seconds <= 0) return 'истекает'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    const remH = hours - days * 24
    return `осталось ${days}д ${remH}ч`
  }
  if (hours > 0) return `осталось ${hours}ч ${minutes}м`
  return `осталось ${minutes} мин`
})
</script>

<style scoped>
.card {
  background-color: #f8f9fa;
  border-radius: 10px;
  padding: 12px;
  border: 1px solid var(--wn-glass-border-subtle);
}

.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: var(--wn-ink);
  background-color: var(--wn-bg-elevated);
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--wn-glass-border-subtle);
  cursor: pointer;
  user-select: all;
}

.icon-btn {
  background-color: transparent;
  border: none;
  font-size: 18px;
  color: var(--wn-ink-mute);
  cursor: pointer;
  padding: 4px 8px;
}
.icon-btn--danger:hover {
  color: #d33;
}

.meta {
  display: flex;
  gap: 14px;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--wn-ink-soft);
}

.actions {
  display: flex;
  gap: 6px;
}

.btn-action {
  flex: 1;
  padding: 8px 6px;
  font-size: 12px;
  font-weight: 500;
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 6px;
  cursor: pointer;
  color: #495057;
  white-space: nowrap;
}
.btn-action--primary {
  background-color: var(--wn-accent);
  border-color: var(--wn-accent-text);
  color: #fff;
}
.btn-action:active {
  transform: scale(0.97);
}
</style>