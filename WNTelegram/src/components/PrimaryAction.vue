<template>
  <button
    v-if="visible"
    class="primary-action"
    :class="{ 'primary-action--accent': !shift.isOpen }"
    @click="onClick"
  >
    <span class="primary-action-label">{{ label }}</span>
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useShiftStore } from '@/stores/shift'
import { useWorkplaceStore } from '@/stores/workplace'

const route = useRoute()
const router = useRouter()
const shift = useShiftStore()
const workplace = useWorkplaceStore()

/**
 * Visible on the main screens where the bottom nav is shown AND where this
 * action makes sense. We hide it on:
 *   - profile (no context for the action)
 *   - shifts (already shows its own open-shift block)
 * Inside order-builder / hall-editor it's auto-hidden via meta.hideBottomNav.
 */
const HIDE_ON_ROUTES = new Set(['profile', 'shifts'])

const visible = computed(() => {
  if (route.meta?.hideBottomNav) return false
  if (HIDE_ON_ROUTES.has(route.name)) return false
  // Need a workplace to do anything meaningful.
  if (!workplace.currentId) return false
  return true
})

const label = computed(() => (shift.isOpen ? '➕ Взять заказ' : '▶ Открыть смену'))

function onClick() {
  if (shift.isOpen) {
    // Jump straight into the order builder. The user picks a table inside
    // (or leaves the order tableless for takeaway).
    router.push({ name: 'order-builder' })
  } else {
    // Shift is closed — send the user to the Shifts screen so they can
    // review the workplace defaults (rate / percent) before opening.
    router.push({ name: 'shifts' })
  }
}
</script>

<style scoped>
/* Floats above the bottom nav. The exact offset uses the same safe-area
   padding as the bottom nav itself so it sits at a consistent distance
   above it on devices with home indicators. */
.primary-action {
  position: fixed;
  left: 50%;
  /* Bottom nav is 76px (incl. safe-area) — sit 12px above its top edge. */
  bottom: calc(76px + 12px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  min-width: 180px;
  height: 48px;
  padding: 0 24px;
  border: none;
  border-radius: 999px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;

  background-color: var(--wn-accent, #4caf50);
  box-shadow: 0 6px 20px rgba(76, 175, 80, 0.35);

  z-index: 60;
  transition:
    transform 0.15s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.18s ease;
}

.primary-action:active {
  transform: translateX(-50%) scale(0.96);
}

.primary-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* "Open shift" gets a slightly warmer-looking variant so it reads as the
   primary CTA when there's no active shift — same color but the larger
   shadow makes it feel like a "wake up" button. */
.primary-action--accent {
  box-shadow: 0 8px 24px rgba(76, 175, 80, 0.5);
}

.primary-action-label {
  white-space: nowrap;
}
</style>