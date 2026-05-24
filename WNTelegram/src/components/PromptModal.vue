<template>
  <transition name="prompt-fade">
    <div
      v-if="visible"
      class="prompt-overlay"
      @click.self="onCancel"
    >
      <div
        class="prompt-modal"
        role="dialog"
        aria-modal="true"
      >
        <header class="prompt-header">
          <h3 class="prompt-title">{{ title }}</h3>
          <button class="prompt-close" @click="onCancel" aria-label="Закрыть">×</button>
        </header>

        <div class="prompt-body">
          <textarea
            v-if="multiline"
            ref="inputRef"
            v-model="value"
            class="prompt-input prompt-input--multiline"
            :placeholder="placeholder"
            :maxlength="maxLength"
            :rows="rows"
            @keydown.esc.prevent="onCancel"
          />
          <input
            v-else
            ref="inputRef"
            v-model="value"
            class="prompt-input"
            :type="inputType"
            :placeholder="placeholder"
            :maxlength="maxLength"
            :inputmode="inputMode"
            @keydown.enter.prevent="onConfirm"
            @keydown.esc.prevent="onCancel"
          />
        </div>

        <footer class="prompt-footer">
          <button class="btn btn--ghost" @click="onCancel">
            {{ cancelText }}
          </button>
          <button
            class="btn btn--primary"
            :disabled="!canConfirm"
            @click="onConfirm"
          >
            {{ confirmText }}
          </button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: 'Введите значение' },
  initial: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  multiline: { type: Boolean, default: false },
  rows: { type: Number, default: 4 },
  /** Forwarded to <input type="..."> when single-line. */
  inputType: { type: String, default: 'text' },
  /** Hint for soft keyboard: 'text', 'numeric', 'decimal', 'tel', 'email', 'url'. */
  inputMode: { type: String, default: 'text' },
  maxLength: { type: Number, default: 2000 },
  confirmText: { type: String, default: 'Сохранить' },
  cancelText: { type: String, default: 'Отмена' },
  /** When true, an empty/whitespace-only value can't be confirmed. */
  required: { type: Boolean, default: false },
})

const emit = defineEmits(['confirm', 'cancel'])

const value = ref('')
const inputRef = ref(null)

/**
 * Reset to initial whenever the modal opens. We use the `visible` edge so
 * a parent can leave `initial` set across sessions without it overriding
 * what the user is currently typing.
 */
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      value.value = props.initial || ''
      await nextTick()
      // Auto-focus the input so the keyboard appears immediately — this is
      // the whole point of this modal over inline inputs that get hidden
      // by the keyboard.
      inputRef.value?.focus()
      // iOS sometimes ignores the first focus; nudge with a second tick.
      await nextTick()
      inputRef.value?.focus()
    }
  },
)

const canConfirm = (() => {
  return () => {
    if (!props.required) return true
    return (value.value || '').trim().length > 0
  }
})()

function onConfirm() {
  if (!canConfirm()) return
  emit('confirm', value.value)
}

function onCancel() {
  emit('cancel')
}
</script>

<style scoped>
/* The overlay covers the screen and centers the modal vertically near the
   top — far from where the on-screen keyboard appears. This is the core
   reason this component exists: inline inputs in bottom sheets get covered
   by the keyboard; a modal at the top stays visible. */
.prompt-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 56px 16px 16px;
  /* Block touch scroll on the backdrop so taps don't move the underlying page. */
  touch-action: none;
}

.prompt-modal {
  width: 100%;
  max-width: 480px;
  background-color: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  /* Re-enable touch interactions inside the modal so the input receives taps. */
  touch-action: auto;
}

.prompt-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 8px 16px;
}

.prompt-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
  flex: 1;
  min-width: 0;
}

.prompt-close {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: #888;
  cursor: pointer;
  padding: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.prompt-body {
  padding: 4px 16px 12px 16px;
}

.prompt-input {
  width: 100%;
  font-family: inherit;
  font-size: 15px;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 10px;
  outline: none;
  box-sizing: border-box;
  background-color: #fafafa;
  color: #1a1a1a;
  transition: border-color 0.15s ease;
}

.prompt-input:focus {
  border-color: var(--wn-accent, #4caf50);
  background-color: #fff;
}

.prompt-input--multiline {
  resize: vertical;
  min-height: 80px;
  line-height: 1.4;
}

.prompt-footer {
  display: flex;
  gap: 8px;
  padding: 8px 16px 16px 16px;
}

.btn {
  flex: 1;
  padding: 11px 16px;
  border: none;
  border-radius: 12px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.15s ease, opacity 0.15s ease;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--ghost {
  background-color: #f0f0f2;
  color: #1a1a1a;
}

.btn--ghost:active {
  background-color: #e5e5e8;
}

.btn--primary {
  background-color: var(--wn-accent, #4caf50);
  color: #fff;
}

.btn--primary:active {
  background-color: #3d8b40;
}

/* Transition */
.prompt-fade-enter-active,
.prompt-fade-leave-active {
  transition: opacity 0.18s ease;
}
.prompt-fade-enter-from,
.prompt-fade-leave-to {
  opacity: 0;
}
.prompt-fade-enter-active .prompt-modal,
.prompt-fade-leave-active .prompt-modal {
  transition: transform 0.18s ease;
}
.prompt-fade-enter-from .prompt-modal,
.prompt-fade-leave-to .prompt-modal {
  transform: translateY(-8px);
}
</style>