<template>
  <transition name="fade">
    <div v-if="ui.confirmDialog" class="overlay" @click.self="cancel">
      <div class="dialog" role="dialog" aria-modal="true">
        <h3 class="title">{{ ui.confirmDialog.title }}</h3>
        <p v-if="ui.confirmDialog.message" class="message">
          {{ ui.confirmDialog.message }}
        </p>
        <div class="actions">
          <button class="btn btn--ghost" @click="cancel">
            {{ ui.confirmDialog.cancelText }}
          </button>
          <button
            class="btn"
            :class="ui.confirmDialog.danger ? 'btn--danger' : 'btn--primary'"
            @click="ok"
          >
            {{ ui.confirmDialog.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { useUiStore } from '@/stores/ui'
const ui = useUiStore()

function ok() {
  ui.resolveConfirm(true)
}
function cancel() {
  ui.resolveConfirm(false)
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.dialog {
  background-color: #fff;
  border-radius: 16px;
  padding: 20px;
  width: 100%;
  max-width: 360px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.title {
  margin: 0 0 8px 0;
  font-size: 17px;
  font-weight: 600;
  color: #1a1a1a;
}

.message {
  margin: 0 0 18px 0;
  font-size: 14px;
  line-height: 1.45;
  color: #555;
}

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn {
  padding: 9px 16px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.btn:active {
  opacity: 0.8;
}

.btn--ghost {
  background-color: transparent;
  color: #666;
}

.btn--primary {
  background-color: #4caf50;
  color: #fff;
}

.btn--danger {
  background-color: #d32f2f;
  color: #fff;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>