<template>
  <div class="diag-overlay" @click.self="$emit('close')">
    <div class="diag-panel">
      <header class="diag-header">
        <span class="diag-title">Диагностика</span>
        <button class="diag-x" @click="$emit('close')">✕</button>
      </header>

      <div class="diag-actions">
        <button class="diag-btn" @click="runProbe" :disabled="probing">
          {{ probing ? 'Проверка…' : 'Проверить сервер' }}
        </button>
        <button class="diag-btn" @click="copyAll">Копировать всё</button>
        <button class="diag-btn diag-btn--ghost" @click="clear">Очистить</button>
      </div>

      <div class="diag-env">
        <div v-for="(v, k) in env" :key="k" class="diag-env-row">
          <span class="diag-env-k">{{ k }}</span>
          <span class="diag-env-v">{{ v }}</span>
        </div>
      </div>

      <div class="diag-log">
        <p v-if="!log.length" class="diag-empty">Записей нет</p>
        <div
          v-for="(e, i) in log"
          :key="i"
          class="diag-line"
          :class="`diag-line--${e.level}`"
        >
          <span class="diag-time">{{ shortTime(e.t) }}</span>
          <span class="diag-msg">{{ e.message }}</span>
          <span v-if="e.extra" class="diag-extra">{{ e.extra }}</span>
        </div>
      </div>

      <p v-if="copied" class="diag-copied">Скопировано в буфер обмена</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import {
  getDiagLog,
  clearDiagLog,
  onDiagChange,
  envSnapshot,
  probeBackend,
} from '@/utils/diagnostics'

defineEmits(['close'])

const log = ref(getDiagLog())
const env = ref(envSnapshot())
const probing = ref(false)
const copied = ref(false)

let unsubscribe = null
onMounted(() => {
  unsubscribe = onDiagChange((entries) => {
    log.value = entries
  })
})
onUnmounted(() => {
  if (unsubscribe) unsubscribe()
})

function shortTime(iso) {
  // HH:MM:SS from an ISO timestamp
  return iso.slice(11, 19)
}

async function runProbe() {
  probing.value = true
  try {
    await probeBackend()
  } finally {
    probing.value = false
  }
}

function clear() {
  clearDiagLog()
}

async function copyAll() {
  const lines = [
    '=== ENV ===',
    ...Object.entries(env.value).map(([k, v]) => `${k}: ${v}`),
    '',
    '=== LOG ===',
    ...log.value.map(
      (e) =>
        `${e.t} [${e.level}] ${e.message}${e.extra ? ' ' + e.extra : ''}`,
    ),
  ]
  const text = lines.join('\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // Clipboard API can be unavailable — fall back to a temporary textarea.
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      copied.value = true
      setTimeout(() => (copied.value = false), 2000)
    } catch {
      /* give up silently */
    }
    document.body.removeChild(ta)
  }
}
</script>

<style scoped>
.diag-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 9999;
}
.diag-panel {
  background: #fff;
  width: 100%;
  max-width: 600px;
  max-height: 85vh;
  border-radius: 14px 14px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.diag-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #eee;
}
.diag-title {
  font-weight: 600;
  font-size: 15px;
}
.diag-x {
  background: none;
  border: none;
  font-size: 18px;
  color: #888;
  cursor: pointer;
}
.diag-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  flex-wrap: wrap;
}
.diag-btn {
  flex: 1;
  min-width: 120px;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: #4caf50;
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.diag-btn--ghost {
  background: #eee;
  color: #555;
}
.diag-btn:disabled {
  opacity: 0.6;
}
.diag-env {
  padding: 8px 16px;
  background: #f7f7f7;
  font-size: 11px;
  border-bottom: 1px solid #eee;
}
.diag-env-row {
  display: flex;
  gap: 8px;
  padding: 2px 0;
}
.diag-env-k {
  color: #999;
  flex-shrink: 0;
  min-width: 90px;
}
.diag-env-v {
  color: #333;
  word-break: break-all;
}
.diag-log {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px;
}
.diag-empty {
  color: #aaa;
  text-align: center;
  padding: 20px;
}
.diag-line {
  padding: 3px 0;
  border-bottom: 1px solid #f2f2f2;
  word-break: break-all;
}
.diag-line--error {
  color: #c62828;
}
.diag-line--net {
  color: #555;
}
.diag-line--info {
  color: #777;
}
.diag-time {
  color: #aaa;
  margin-right: 6px;
}
.diag-extra {
  display: block;
  color: #999;
  padding-left: 12px;
}
.diag-copied {
  text-align: center;
  color: #4caf50;
  font-size: 12px;
  padding: 6px;
}
</style>