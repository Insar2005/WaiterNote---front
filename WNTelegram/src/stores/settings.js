import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getColorScheme, isInsideTelegram, setHeaderColor } from '@/utils/telegram'

/**
 * Appearance settings: accent color + theme mode.
 * Persisted to localStorage and applied to <html> as:
 *   - inline CSS vars (--wn-accent*) for the chosen accent
 *   - data-theme="light|dark" for the resolved theme
 *
 * Theme "auto" follows Telegram's colorScheme (or the OS prefers-color-scheme
 * when running outside Telegram) and reacts live to changes.
 */

const STORAGE_KEY = 'wn:appearance'

// Five pastel accents. `green` is the app's original accent — keeping it first
// and as the default means the UI looks identical until the user picks another.
export const ACCENTS = [
  { key: 'green',    label: 'Зелёный', accent: '#4caf50', soft: '#a8d5b4', bg: '#e8f5ec', ink: '#2e7d32' },
  { key: 'lavender', label: 'Лаванда', accent: '#8e6fc7', soft: '#c9beda', bg: '#f0ecf6', ink: '#6a4190' },
  { key: 'sky',      label: 'Небо',    accent: '#4a90d9', soft: '#b6d4ec', bg: '#e6f0fa', ink: '#1565c0' },
  { key: 'peach',    label: 'Персик',  accent: '#e8884a', soft: '#f4c4a3', bg: '#fff0e6', ink: '#c25e1a' },
  { key: 'rose',     label: 'Роза',    accent: '#e26d8a', soft: '#f5b8b8', bg: '#fde8e8', ink: '#c62828' },
]

export const THEME_OPTIONS = [
  { key: 'auto',  label: 'Авто' },
  { key: 'light', label: 'Светлая' },
  { key: 'dark',  label: 'Тёмная' },
]

const THEME_KEYS = THEME_OPTIONS.map((t) => t.key)
const PAGE_BG = { light: '#f5f5f7', dark: '#131318' }

export const useSettingsStore = defineStore('settings', () => {
  const accentKey = ref('green')
  const theme = ref('auto') // 'auto' | 'light' | 'dark'

  const accent = computed(
    () => ACCENTS.find((a) => a.key === accentKey.value) || ACCENTS[0],
  )

  /** The system's current scheme — Telegram first, OS as fallback. */
  function systemScheme() {
    if (isInsideTelegram()) return getColorScheme() === 'dark' ? 'dark' : 'light'
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return 'light'
  }

  /** Effective theme actually painted ('auto' resolved to light/dark). */
  const resolvedTheme = computed(() =>
    theme.value === 'auto' ? systemScheme() : theme.value,
  )

  function applyAccent() {
    const a = accent.value
    const r = document.documentElement
    r.style.setProperty('--wn-accent', a.accent)
    r.style.setProperty('--wn-accent-soft', a.soft)
    r.style.setProperty('--wn-accent-bg', a.bg)
    r.style.setProperty('--wn-accent-ink', a.ink)
  }

  function applyTheme() {
    const eff = resolvedTheme.value
    document.documentElement.setAttribute('data-theme', eff)
    // Keep the Telegram native header in sync with the page background.
    try { setHeaderColor(PAGE_BG[eff]) } catch { /* outside Telegram */ }
  }

  function setAccent(key) {
    if (!ACCENTS.some((a) => a.key === key)) return
    accentKey.value = key
    applyAccent()
    persist()
  }

  function setTheme(value) {
    if (!THEME_KEYS.includes(value)) return
    theme.value = value
    applyTheme()
    persist()
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accentKey: accentKey.value, theme: theme.value }),
      )
    } catch { /* storage unavailable — settings just won't persist */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.accentKey && ACCENTS.some((a) => a.key === data.accentKey)) {
        accentKey.value = data.accentKey
      }
      if (THEME_KEYS.includes(data.theme)) theme.value = data.theme
    } catch { /* corrupt value — fall back to defaults */ }
  }

  let bound = false
  /** Load persisted prefs, paint them, and start listening for system changes. */
  function init() {
    load()
    applyAccent()
    applyTheme()
    if (bound) return
    bound = true

    const onSystemChange = () => { if (theme.value === 'auto') applyTheme() }

    // Telegram theme switches (user flips Telegram light/dark)
    const tgApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : null
    if (tgApp?.onEvent) tgApp.onEvent('themeChanged', onSystemChange)

    // OS scheme changes (when running outside Telegram / desktop)
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      if (mq.addEventListener) mq.addEventListener('change', onSystemChange)
      else if (mq.addListener) mq.addListener(onSystemChange)
    }
  }

  return {
    accentKey, theme, accent, resolvedTheme,
    setAccent, setTheme, init,
  }
})
