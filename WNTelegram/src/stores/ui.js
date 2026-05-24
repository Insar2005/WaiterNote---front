import { defineStore } from 'pinia'
import { ref } from 'vue'
import { hapticNotification } from '@/utils/telegram'

let toastSeq = 0

/**
 * UI store: ephemeral state shared across views.
 * - toasts: stack of short notifications
 * - confirm: a single pending confirm dialog (Promise-based)
 */
export const useUiStore = defineStore('ui', () => {
  const toasts = ref([])
  const confirmDialog = ref(null)

  /**
   * Show a toast. type: 'success' | 'error' | 'info' | 'warning'
   * Returns the toast id so the caller can dismiss it early if needed.
   */
  function toast(message, { type = 'info', duration = 3000 } = {}) {
    const id = ++toastSeq
    toasts.value.push({ id, message, type })

    if (type === 'success') hapticNotification('success')
    else if (type === 'error') hapticNotification('error')
    else if (type === 'warning') hapticNotification('warning')

    if (duration > 0) {
      setTimeout(() => dismissToast(id), duration)
    }
    return id
  }

  function dismissToast(id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  // Convenience helpers
  const toastSuccess = (msg, opts) => toast(msg, { ...opts, type: 'success' })
  const toastError = (msg, opts) => toast(msg, { ...opts, type: 'error', duration: 5000 })
  const toastInfo = (msg, opts) => toast(msg, { ...opts, type: 'info' })
  const toastWarning = (msg, opts) => toast(msg, { ...opts, type: 'warning' })

  /**
   * Promise-based confirm dialog. Component (e.g. App.vue) renders the dialog
   * based on confirmDialog state and calls resolveConfirm() when user picks.
   */
  function confirm({ title = 'Подтвердите', message = '', confirmText = 'OK', cancelText = 'Отмена', danger = false }) {
    return new Promise((resolve) => {
      confirmDialog.value = {
        title, message, confirmText, cancelText, danger, resolve,
      }
    })
  }

  function resolveConfirm(result) {
    if (!confirmDialog.value) return
    confirmDialog.value.resolve(result)
    confirmDialog.value = null
  }

  // === Prompt dialog ===
  // Promise-based text-input dialog, rendered as a top-anchored modal that
  // stays visible above the on-screen keyboard. Returns the entered string
  // on confirm, or null if the user cancelled.
  const promptDialog = ref(null)

  function prompt({
    title = 'Введите значение',
    initial = '',
    placeholder = '',
    multiline = false,
    rows = 4,
    inputType = 'text',
    inputMode = 'text',
    maxLength = 2000,
    confirmText = 'Сохранить',
    cancelText = 'Отмена',
    required = false,
  } = {}) {
    return new Promise((resolve) => {
      promptDialog.value = {
        title, initial, placeholder, multiline, rows,
        inputType, inputMode, maxLength,
        confirmText, cancelText, required,
        resolve,
      }
    })
  }

  function resolvePrompt(result) {
    if (!promptDialog.value) return
    promptDialog.value.resolve(result)
    promptDialog.value = null
  }

  return {
    // state
    toasts, confirmDialog, promptDialog,
    // actions
    toast, dismissToast, toastSuccess, toastError, toastInfo, toastWarning,
    confirm, resolveConfirm,
    prompt, resolvePrompt,
  }
})