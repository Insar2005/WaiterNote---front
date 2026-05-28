import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { meApi } from '@/api/me'

/**
 * Auth store: current user + locale.
 * The user is created server-side on first /me request — no separate /login.
 */
export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const isLoading = ref(false)
  const error = ref(null)

  // === Bot access gate ===
  // Tri-state probe result from GET /me/bot-access.
  //   null        — not checked yet (initial state)
  //   'ok'        — bot can message the user, app is unlocked
  //   'blocked'   — user hasn't /started the bot (or blocked it); show gate
  //   'unreachable' — Telegram API hiccup; show retry, NOT the gate
  const botStatus = ref(null)
  const botUsername = ref(null)

  // === getters ===
  const isAuthenticated = computed(() => user.value !== null)
  const language = computed(() => user.value?.language ?? 'ru')
  const timezone = computed(() => user.value?.timezone ?? 'Europe/Moscow')
  const lastWorkplaceId = computed(() => user.value?.last_workplace_id ?? null)
  const isOnboardingCompleted = computed(() => user.value?.is_onboarding_completed ?? false)
  const botAccessGranted = computed(() => botStatus.value === 'ok')

  // === actions ===

  /** Load current user. Call once on app startup. */
  async function init() {
    isLoading.value = true
    error.value = null
    try {
      user.value = await meApi.get()
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /** Update profile fields. Optimistic with rollback. */
  async function updateProfile(patch) {
    if (!user.value) return
    const prev = { ...user.value }
    user.value = { ...user.value, ...patch }
    try {
      user.value = await meApi.update(patch)
    } catch (e) {
      user.value = prev
      throw e
    }
  }

  /**
   * Local-only update of last_workplace_id.
   * Called by workplaceStore.setCurrent() to keep auth state in sync —
   * it doesn't hit /me, since /workplaces/{id}/select handles the server side.
   */
  function setLastWorkplaceLocal(workplaceId) {
    if (user.value) user.value.last_workplace_id = workplaceId
  }

  /**
   * Mark the onboarding flow as completed. Persists via PATCH /me so the
   * intro screens are never shown again on subsequent app launches.
   */
  async function completeOnboarding() {
    await updateProfile({ is_onboarding_completed: true })
  }

  /**
   * Check whether the configured bot can write to this user. Called once
   * on boot, then again after the user taps "I pressed /start, recheck"
   * on the gate screen.
   *
   * Stores the result in botStatus; callers read that to route. We swallow
   * exceptions here on purpose — a thrown network error would just look
   * like "unreachable" to the caller anyway, and we want a clean tri-state
   * value instead of try/catch all over the place.
   */
  async function checkBotAccess() {
    try {
      const res = await meApi.getBotAccess()
      botStatus.value = res?.status ?? 'unreachable'
      botUsername.value = res?.bot_username ?? null
    } catch {
      botStatus.value = 'unreachable'
    }
    return botStatus.value
  }

  function reset() {
    user.value = null
    error.value = null
    botStatus.value = null
    botUsername.value = null
  }

  return {
    // state
    user, isLoading, error, botStatus, botUsername,
    // getters
    isAuthenticated, language, timezone, lastWorkplaceId, isOnboardingCompleted,
    botAccessGranted,
    // actions
    init, updateProfile, setLastWorkplaceLocal, completeOnboarding,
    checkBotAccess, reset,
  }
})