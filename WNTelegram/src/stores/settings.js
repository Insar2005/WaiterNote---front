import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getColorScheme, isInsideTelegram, setHeaderColor } from '@/utils/telegram'
import { meApi } from '@/api/me'

/**
 * Appearance settings: accent color + theme mode.
 *
 * Persistence is dual-track on purpose:
 *   1) Server (PATCH /me) — the canonical store, syncs across devices.
 *      User flips theme on phone → opens desktop next day → same theme.
 *   2) localStorage — fast local cache. Reads paint the UI before /me
 *      arrives, so the user never sees a light-mode flash on a dark
 *      device. Writes happen on every change so an offline tweak survives
 *      a reload even if we can't reach the server.
 *
 * Conflict resolution: when both have a value, the server wins on app
 * start (it's the "source of truth across devices"). Within a session,
 * the user's most recent choice wins both locally and server-side.
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
    if (accentKey.value === key) return
    accentKey.value = key
    applyAccent()
    persistLocal()
    // Fire-and-forget server sync. Don't await — UI shouldn't wait for
    // the network. On failure we keep the local change; next successful
    // PATCH will catch up.
    syncToServer({ accent_key: key })
  }

  function setTheme(value) {
    if (!THEME_KEYS.includes(value)) return
    if (theme.value === value) return
    theme.value = value
    applyTheme()
    persistLocal()
    syncToServer({ theme: value })
  }

  function persistLocal() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accentKey: accentKey.value, theme: theme.value }),
      )
    } catch { /* storage unavailable — settings just won't persist */ }
  }

  function loadLocal() {
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

  /**
   * Apply preferences received from the server (typically /me on boot).
   * The server is the canonical source on app start — it wins over
   * whatever localStorage had cached. We still update localStorage to
   * keep the next cold start fast.
   */
  function applyFromUser(user) {
    if (!user) return
    let changed = false
    if (user.accent_key && ACCENTS.some((a) => a.key === user.accent_key)) {
      if (accentKey.value !== user.accent_key) {
        accentKey.value = user.accent_key
        changed = true
      }
    }
    if (THEME_KEYS.includes(user.theme)) {
      if (theme.value !== user.theme) {
        theme.value = user.theme
        changed = true
      }
    }
    if (changed) {
      applyAccent()
      applyTheme()
      persistLocal()
    }
  }

  /**
   * Push a change to the server. Best-effort: errors are logged but
   * don't surface to the user — appearance is too low-stakes to bother
   * with a retry UI, and the next successful change will overwrite
   * whatever drift accumulated.
   *
   * Inflight tracking ensures rapid toggles (e.g. user mashing the
   * accent swatches) don't pile up overlapping PATCH calls — we keep
   * only the latest pending value and dispatch it once the current
   * one settles.
   */
  let inflight = null
  let pending = null
  async function syncToServer(patch) {
    pending = { ...(pending || {}), ...patch }
    if (inflight) return
    while (pending) {
      const next = pending
      pending = null
      inflight = meApi.update(next).catch((e) => {
        // Soft-fail: keep local state, log for diagnostics.
        // eslint-disable-next-line no-console
        console.warn('[settings] failed to sync to /me', e?.message || e)
      })
      try { await inflight } finally { inflight = null }
    }
  }

  let bound = false
  /**
   * Paint the saved prefs to the DOM and start listening for system
   * theme changes. Safe to call before `/me` has loaded — pass user
   * later via `applyFromUser` once it's available.
   */
  function init() {
    loadLocal()
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
    setAccent, setTheme, init, applyFromUser,
  }
})