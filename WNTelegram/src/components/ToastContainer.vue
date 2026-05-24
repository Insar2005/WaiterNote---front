<template>
  <div class="toast-stack" aria-live="polite">
    <transition-group name="toast">
      <ToastItem
        v-for="t in ui.toasts"
        :key="t.id"
        :toast="t"
        @dismiss="ui.dismissToast(t.id)"
      />
    </transition-group>
  </div>
</template>

<script setup>
import { useUiStore } from '@/stores/ui'
import ToastItem from './ToastItem.vue'
const ui = useUiStore()
</script>

<style scoped>
.toast-stack {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 12px);
  left: 12px;
  right: 12px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>