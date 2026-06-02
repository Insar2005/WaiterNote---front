<template>
  <div
    class="card"
    :class="{ 'card--pinned': note.pinned, 'card--archived': note.is_archived }"
    @click="$emit('edit', note)"
  >
    <div class="card-top">
      <span v-if="note.pinned" class="pin">📌</span>
      <h3 class="card-title">{{ note.header }}</h3>
    </div>

    <p v-if="note.content" class="card-content">{{ note.content }}</p>

    <div class="card-bottom">
      <span class="card-scope" :class="`card-scope--${note.scope}`">
        {{ scopeLabel }}
      </span>
      <span class="card-date">{{ formatRelative(note.updated_at) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  note: { type: Object, required: true },
})
defineEmits(['edit'])

const scopeLabel = computed(() => {
  switch (props.note.scope) {
    case 'shift': return 'Смена'
    case 'workplace': return 'Заведение'
    case 'global': return 'Личное'
    default: return props.note.scope
  }
})

/**
 * Human-readable relative time: 'только что', '5 мин назад', '2 ч назад',
 * '12 мая', '12 мая 2024'.
 */
function formatRelative(unixSeconds) {
  if (!unixSeconds) return ''
  const now = Math.floor(Date.now() / 1000)
  const diff = now - unixSeconds

  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} дн назад`

  const date = new Date(unixSeconds * 1000)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  }).format(date)
}
</script>

<style scoped>
.card {
  background-color: var(--wn-bg-elevated);
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background-color 0.15s ease, transform 0.15s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card:active {
  background-color: var(--wn-bg-recessed);
  transform: scale(0.99);
}

.card--pinned {
  border-left: 3px solid var(--wn-warn);
  padding-left: 13px;
}

.card--archived {
  opacity: 0.55;
}

.card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pin {
  font-size: 13px;
  flex-shrink: 0;
}

.card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--wn-ink);
  word-break: break-word;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  flex: 1;
  min-width: 0;
}

.card-content {
  margin: 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--wn-ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  white-space: pre-wrap;
}

.card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
}

.card-scope {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  background-color: var(--wn-bg-recessed);
  color: var(--wn-ink-soft);
}

.card-scope--global {
  background-color: color-mix(in srgb, var(--wn-info) 16%, var(--wn-bg-elevated));
  color: color-mix(in srgb, var(--wn-info) 72%, var(--wn-ink));
}

.card-scope--workplace {
  background-color: var(--wn-accent-fill);
  color: var(--wn-accent-text);
}

.card-scope--shift {
  background-color: color-mix(in srgb, var(--wn-warn) 16%, var(--wn-bg-elevated));
  color: color-mix(in srgb, var(--wn-warn) 72%, var(--wn-ink));
}

.card-date {
  font-size: 11px;
  color: var(--wn-ink-faint);
  flex-shrink: 0;
}
</style>