<template>
  <div class="page">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">Dev tools</h1>
    </header>

    <section class="section section--dev">
      <p class="dev-hint">
        Эти кнопки видны только в dev-сборке при USE_MOCK=true.
        Работают с локальной mock БД, не трогая реальный сервер.
      </p>
      <div class="dev-actions">
        <button class="btn-dev" @click="onSeed">
          📦 Заполнить демо-данными
        </button>
        <button class="btn-dev btn-dev--danger" @click="onResetMock">
          🗑 Сбросить mock БД
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useUiStore } from '@/stores/ui'

const router = useRouter()
const ui = useUiStore()

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'profile' })
  }
}

async function onSeed() {
  try {
    const { seedDemo } = await import('@/mocks/db')
    seedDemo()
    ui.toastSuccess('Заполнено. Перезагрузка…')
    setTimeout(() => window.location.reload(), 600)
  } catch (e) {
    ui.toastError(e.message || 'Не удалось заполнить демо')
  }
}

async function onResetMock() {
  const ok = await ui.confirm({
    title: 'Сбросить всё?',
    message: 'Все workplace, столы, меню, смены и заметки будут удалены. Это локальная mock БД.',
    confirmText: 'Сбросить',
    danger: true,
  })
  if (!ok) return

  try {
    const { resetDb } = await import('@/mocks/db')
    resetDb()
    ui.toastSuccess('Сброшено. Перезагрузка…')
    setTimeout(() => window.location.reload(), 600)
  } catch (e) {
    ui.toastError(e.message)
  }
}
</script>

<style scoped>
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  background-color: var(--wn-bg);
  min-height: 100vh;
  color: var(--wn-ink);
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.back-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--wn-ink);
  cursor: pointer;
  padding: 4px 8px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--wn-ink);
}

.section--dev {
  padding: 16px;
  background-color: color-mix(in srgb, var(--wn-warn) 12%, var(--wn-bg-elevated));
  border: 1px dashed color-mix(in srgb, var(--wn-warn) 45%, var(--wn-bg-elevated));
  border-radius: 12px;
}

.dev-hint {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: var(--wn-ink-mute);
  font-style: italic;
}

.dev-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-dev {
  background-color: var(--wn-bg-elevated);
  color: var(--wn-ink-soft);
  border: 1px solid color-mix(in srgb, var(--wn-warn) 40%, var(--wn-bg-elevated));
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}

.btn-dev:active {
  background-color: var(--wn-bg-recessed);
}

.btn-dev--danger {
  border-color: color-mix(in srgb, var(--wn-danger) 45%, var(--wn-bg-elevated));
  color: var(--wn-danger);
}
</style>