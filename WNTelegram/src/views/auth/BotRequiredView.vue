<template>
  <div class="gate">
    <div class="gate-card">
      <div class="gate-icon">🤖</div>

      <!-- Two distinct states share this screen: the user genuinely hasn't
           pressed /start (blocked), and the case where we couldn't reach
           Telegram at all (unreachable). Same UI shape, different copy,
           so the user understands what to do. -->
      <template v-if="status === 'blocked'">
        <h1 class="gate-title">Разреши боту писать тебе</h1>
        <p class="gate-text">
          Открой бота
          <strong>@{{ botUsername || 'waiternote_bot' }}</strong>
          и нажми <strong>Start</strong> — это нужно,
          чтобы мы могли отправлять тебе уведомления.
        </p>
        <button class="btn-primary" @click="openBot">
          Открыть бота
        </button>
        <button class="btn-secondary" :disabled="busy" @click="recheck">
          {{ busy ? 'Проверяем…' : 'Готово, проверить' }}
        </button>
      </template>

      <template v-else>
        <h1 class="gate-title">Не получилось связаться с Telegram</h1>
        <p class="gate-text">
          Проверь интернет и попробуй ещё раз.
        </p>
        <button class="btn-primary" :disabled="busy" @click="recheck">
          {{ busy ? 'Проверяем…' : 'Попробовать снова' }}
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const busy = ref(false)

const status = computed(() => auth.botStatus)
const botUsername = computed(() => auth.botUsername)

function openBot() {
  // Telegram WebApp method opens a chat with the given bot WITHOUT
  // closing the Mini App — when the user comes back via the back swipe,
  // they land right here on the gate, ready to tap "проверить".
  const name = auth.botUsername || 'waiternote_bot'
  const url = `https://t.me/${name}`
  const tg = window.Telegram?.WebApp
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url)
  } else {
    // Fallback for non-Telegram contexts (e.g. dev browser).
    window.open(url, '_blank')
  }
}

async function recheck() {
  if (busy.value) return
  busy.value = true
  try {
    // We DON'T navigate here. App.vue watches auth.botStatus and re-runs
    // boot() when it flips to 'ok' — that's what actually loads
    // workplaces/menu/halls and routes to the correct screen. If we
    // routed straight to /home here we'd land on an empty main page
    // because the previous boot() returned early on the failed probe
    // and never loaded data.
    await auth.checkBotAccess()
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: #f5f5f5;
}

.gate-card {
  background: #fff;
  padding: 32px 24px;
  border-radius: 16px;
  max-width: 380px;
  width: 100%;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.gate-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.gate-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 12px;
  color: #1a1a1a;
}

.gate-text {
  font-size: 14px;
  line-height: 1.5;
  color: #555;
  margin: 0 0 24px;
}

.btn-primary,
.btn-secondary {
  display: block;
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  border: none;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary {
  background-color: #4caf50;
  color: #fff;
  margin-bottom: 10px;
}
.btn-primary:disabled {
  opacity: 0.6;
}

.btn-secondary {
  background-color: #eee;
  color: #444;
}
.btn-secondary:disabled {
  opacity: 0.6;
}
</style>