<template>
  <div class="page">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">Персонализация</h1>
    </header>

    <section class="section">
      <div class="perso-card">
        <div class="perso-block">
          <span class="perso-label">Цвет акцента</span>
          <div class="swatches">
            <button
              v-for="a in accents"
              :key="a.key"
              class="swatch"
              :class="{ 'swatch--active': settings.accentKey === a.key }"
              :style="{ '--sw': a.accent }"
              :aria-label="a.label"
              :aria-pressed="settings.accentKey === a.key"
              @click="settings.setAccent(a.key)"
            >
              <svg
                v-if="settings.accentKey === a.key"
                class="swatch-check"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M5 12.5 10 17.5 19 7" />
              </svg>
            </button>
          </div>
        </div>

        <div class="perso-divider" />

        <div class="perso-block">
          <span class="perso-label">Тема</span>
          <div class="seg">
            <button
              v-for="t in themeOptions"
              :key="t.key"
              class="seg-btn"
              :class="{ 'seg-btn--on': settings.theme === t.key }"
              @click="settings.setTheme(t.key)"
            >
              {{ t.label }}
            </button>
          </div>
          <p class="perso-hint">
            «Авто» подстраивается под тему Telegram.
          </p>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useSettingsStore, ACCENTS, THEME_OPTIONS } from '@/stores/settings'

const router = useRouter()
const settings = useSettingsStore()

const accents = ACCENTS
const themeOptions = THEME_OPTIONS

/**
 * Back to the profile root. Using router.back() would feel right but
 * breaks when the user lands here via a deep-link or a refreshed tab —
 * the browser history is empty and back becomes a no-op. router.push
 * to a stable destination always works.
 */
function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'profile' })
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

.section {
  margin-bottom: 24px;
}

.perso-card {
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: var(--wn-radius-lg);
  box-shadow: var(--wn-shadow-sm);
  overflow: hidden;
}

.perso-block {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.perso-divider {
  height: 1px;
  background-color: var(--wn-glass-border-subtle);
}

.perso-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--wn-ink-soft);
}

.swatches {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.swatch {
  width: 40px;
  height: 40px;
  border-radius: var(--wn-radius-pill);
  border: none;
  padding: 0;
  cursor: pointer;
  background-color: var(--sw);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px color-mix(in srgb, var(--sw) 45%, transparent);
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: transform 0.15s ease, outline-color 0.15s ease;
}

.swatch:active {
  transform: scale(0.9);
}

.swatch--active {
  outline-color: var(--sw);
}

.swatch-check {
  width: 22px;
  height: 22px;
}

.seg {
  display: flex;
  background-color: var(--wn-bg-recessed);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}

.seg-btn {
  flex: 1;
  background-color: transparent;
  border: none;
  padding: 9px 12px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--wn-ink-soft);
  cursor: pointer;
  font-family: inherit;
  font-weight: 500;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.seg-btn--on {
  background-color: var(--wn-bg-elevated);
  color: var(--wn-ink);
  box-shadow: var(--wn-shadow-sm);
}

.perso-hint {
  margin: 0;
  font-size: 12px;
  color: var(--wn-ink-mute);
  line-height: 1.4;
}
</style>