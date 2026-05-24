<template>
  <div class="onboarding">
    <!-- Progress dots -->
    <div class="dots">
      <span
        v-for="n in 3"
        :key="n"
        class="dot"
        :class="{ 'dot--active': n - 1 === step }"
      />
    </div>

    <!-- Step 1: Welcome -->
    <section v-if="step === 0" class="step">
      <div class="hero">
        <div class="hero-icon">📝</div>
        <h1 class="hero-title">Waiter Note</h1>
        <p class="hero-subtitle">Ваш блокнот официанта</p>
      </div>
      <p class="step-text">
        Заказы по столам, учёт смен и чаевых, карта зала — всё в одном
        месте, прямо в Telegram.
      </p>
      <div class="step-actions">
        <button class="btn btn--primary" @click="next">Начать</button>
      </div>
    </section>

    <!-- Step 2: Features -->
    <section v-else-if="step === 1" class="step">
      <h2 class="step-title">Что вы получите</h2>
      <ul class="features">
        <li class="feature">
          <span class="feature-icon">📋</span>
          <div class="feature-body">
            <div class="feature-name">Заказы по столам</div>
            <div class="feature-desc">Принимайте и ведите заказы, отмечайте поданные блюда</div>
          </div>
        </li>
        <li class="feature">
          <span class="feature-icon">⏱️</span>
          <div class="feature-body">
            <div class="feature-name">Смены и зарплата</div>
            <div class="feature-desc">Учёт смен, чаевых и заработка автоматически</div>
          </div>
        </li>
        <li class="feature">
          <span class="feature-icon">🪑</span>
          <div class="feature-body">
            <div class="feature-name">Карта зала</div>
            <div class="feature-desc">Расставьте столы и видьте их статус в реальном времени</div>
          </div>
        </li>
        <li class="feature">
          <span class="feature-icon">📝</span>
          <div class="feature-body">
            <div class="feature-name">Заметки</div>
            <div class="feature-desc">Заметки по смене, заведению или общие</div>
          </div>
        </li>
      </ul>
      <div class="step-actions">
        <button class="btn btn--ghost" @click="prev">Назад</button>
        <button class="btn btn--primary" @click="next">Дальше</button>
      </div>
    </section>

    <!-- Step 3: Create first workplace -->
    <section v-else class="step">
      <h2 class="step-title">Ваше место работы</h2>
      <p class="step-text">
        Добавьте заведение, где вы работаете. Настройки оплаты и смен
        можно будет изменить позже.
      </p>

      <div class="form">
        <label class="field">
          <span class="field-label">Название заведения</span>
          <input
            v-model.trim="title"
            class="field-input"
            type="text"
            placeholder="Например: Кафе «Уют»"
            maxlength="255"
          />
        </label>

        <label class="field">
          <span class="field-label">Валюта</span>
          <select v-model="currency" class="field-input">
            <option value="RUB">RUB — рубль</option>
            <option value="USD">USD — доллар</option>
            <option value="EUR">EUR — евро</option>
            <option value="KZT">KZT — тенге</option>
            <option value="KGS">KGS — сом</option>
            <option value="UAH">UAH — гривна</option>
          </select>
        </label>

        <label class="field">
          <span class="field-label">Часовой пояс</span>
          <select v-model="timezone" class="field-input">
            <option
              v-for="tz in timezones"
              :key="tz.id"
              :value="tz.id"
            >
              {{ formatTz(tz) }}
            </option>
          </select>
        </label>
      </div>

      <div class="step-actions">
        <button class="btn btn--ghost" :disabled="busy" @click="prev">
          Назад
        </button>
        <button
          class="btn btn--primary"
          :disabled="busy || !title"
          @click="finish"
        >
          {{ busy ? 'Создаём…' : 'Создать и начать' }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorkplaceStore } from '@/stores/workplace'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { newId } from '@/utils/nanoid'
import { TIMEZONES, formatTimezoneOption } from '@/utils/timezones'

const router = useRouter()
const workplace = useWorkplaceStore()
const auth = useAuthStore()
const ui = useUiStore()

const step = ref(0)
const busy = ref(false)

// --- Step 3 form ---
const title = ref('')
const currency = ref('RUB')
const timezones = TIMEZONES
const timezone = ref(detectTimezone())

function formatTz(tz) {
  return formatTimezoneOption(tz)
}

/**
 * Best-effort timezone pick for a fresh workplace: use the browser's IANA
 * zone if it's in our curated list, else match by UTC offset, else Moscow.
 */
function detectTimezone() {
  try {
    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (browserTz && TIMEZONES.some((t) => t.id === browserTz)) {
      return browserTz
    }
    const offset = -new Date().getTimezoneOffset()
    const match = TIMEZONES.find((t) => t.offsetMin === offset)
    if (match) return match.id
  } catch {
    /* fallthrough */
  }
  return 'Europe/Moscow'
}

function next() {
  if (step.value < 2) step.value += 1
}

function prev() {
  if (step.value > 0) step.value -= 1
}

/**
 * Final step: create the first workplace, mark onboarding complete, and
 * route into the app. The workplace is required — there's no "skip" here,
 * the app is unusable without one.
 */
async function finish() {
  if (busy.value || !title.value) return
  busy.value = true
  try {
    await workplace.create({
      id: newId(),
      title: title.value,
      currency: currency.value,
      timezone: timezone.value,
      // The backend's WorkplaceCreate schema requires the pay/shift fields.
      // Onboarding keeps the form minimal, so send sensible defaults here —
      // the user tunes them later in workplace settings.
      service_percent_default: 0,
      shift_type_default: 'fixed',
      pay_for_shift_default: 0,
    })
    // Persist the onboarding flag so we don't show this flow again.
    await auth.completeOnboarding()
    router.replace({ name: 'home' })
  } catch (e) {
    ui.toastError(e.message || 'Не удалось создать заведение')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.onboarding {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
  background-color: #fff;
  box-sizing: border-box;
}

/* Progress dots */
.dots {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 8px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #e0e0e0;
  transition: background-color 0.2s ease, width 0.2s ease;
}

.dot--active {
  background-color: var(--wn-accent, #4caf50);
  width: 22px;
  border-radius: 4px;
}

/* Step container */
.step {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* Step 1 hero */
.hero {
  text-align: center;
  margin-top: 48px;
}

.hero-icon {
  font-size: 64px;
  line-height: 1;
}

.hero-title {
  margin: 16px 0 4px;
  font-size: 28px;
  font-weight: 700;
  color: #1a1a1a;
}

.hero-subtitle {
  margin: 0;
  font-size: 15px;
  color: #888;
}

.step-title {
  margin: 24px 0 8px;
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
}

.step-text {
  margin: 12px 0;
  font-size: 15px;
  line-height: 1.5;
  color: #555;
}

/* Step 2 features */
.features {
  list-style: none;
  margin: 16px 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.feature {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.feature-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
}

.feature-name {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.feature-desc {
  font-size: 13px;
  color: #888;
  line-height: 1.4;
  margin-top: 2px;
}

/* Step 3 form */
.form {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: #888;
}

.field-input {
  width: 100%;
  font-family: inherit;
  font-size: 15px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 10px;
  outline: none;
  box-sizing: border-box;
  background-color: #fafafa;
  color: #1a1a1a;
}

.field-input:focus {
  border-color: var(--wn-accent, #4caf50);
  background-color: #fff;
}

/* Actions */
.step-actions {
  margin-top: auto;
  padding-top: 24px;
  display: flex;
  gap: 10px;
}

.btn {
  flex: 1;
  padding: 14px 20px;
  border: none;
  border-radius: 12px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--primary {
  background-color: var(--wn-accent, #4caf50);
  color: #fff;
}

.btn--primary:active:not(:disabled) {
  background-color: #3d8b40;
}

.btn--ghost {
  flex: 0 0 auto;
  min-width: 96px;
  background-color: #f0f0f2;
  color: #1a1a1a;
}

.btn--ghost:active:not(:disabled) {
  background-color: #e5e5e8;
}
</style>