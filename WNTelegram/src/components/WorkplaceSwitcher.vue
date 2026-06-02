<template>
  <div class="switcher">
    <!-- Single workplace: just a label -->
    <div v-if="workplace.activeList.length <= 1" class="label">
      {{ workplace.current?.title || 'Нет заведений' }}
    </div>

    <!-- Multiple: tap-to-open dropdown -->
    <template v-else>
      <button class="trigger" @click="open = !open">
        <span class="trigger-text">
          {{ workplace.current?.title || 'Выберите' }}
        </span>
        <span class="chev" :class="{ 'chev--open': open }">▾</span>
      </button>

      <transition name="drop">
        <div v-if="open" class="menu" @click.self="open = false">
          <div class="menu-list">
            <button
              v-for="w in workplace.activeList"
              :key="w.id"
              class="menu-item"
              :class="{ 'menu-item--current': w.id === workplace.currentId }"
              @click="select(w.id)"
            >
              <span class="menu-item-text">{{ w.title }}</span>
              <span v-if="w.id === workplace.currentId" class="menu-check">✓</span>
            </button>
          </div>
        </div>
      </transition>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useWorkplaceStore } from '@/stores/workplace'
import { useUiStore } from '@/stores/ui'

const workplace = useWorkplaceStore()
const ui = useUiStore()

const open = ref(false)

async function select(id) {
  open.value = false
  if (id === workplace.currentId) return
  try {
    await workplace.setCurrent(id)
  } catch (e) {
    ui.toastError(e.message)
  }
}
</script>

<style scoped>
.switcher {
  position: relative;
}

.label {
  font-size: 13px;
  color: var(--wn-ink-mute);
  font-weight: 500;
}

.trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background-color: var(--wn-bg-elevated);
  border: 1px solid var(--wn-glass-border-subtle);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--wn-ink-soft);
  cursor: pointer;
  font-family: inherit;
  transition: background-color 0.15s ease;
}

.trigger:active {
  background-color: var(--wn-bg-recessed);
}

.trigger-text {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chev {
  font-size: 9px;
  transition: transform 0.18s ease;
  color: var(--wn-ink-mute);
}

.chev--open {
  transform: rotate(180deg);
}

.menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 50;
  background-color: var(--wn-bg-elevated);
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.12);
  border: 1px solid var(--wn-glass-border-subtle);
  min-width: 200px;
  overflow: hidden;
}

.menu-list {
  display: flex;
  flex-direction: column;
}

.menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  padding: 10px 14px;
  font-size: 14px;
  color: var(--wn-ink);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background-color 0.12s ease;
}

.menu-item:active,
.menu-item:hover {
  background-color: var(--wn-bg-recessed);
}

.menu-item--current {
  font-weight: 600;
  color: var(--wn-accent-text);
}

.menu-item-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-check {
  color: var(--wn-accent-text);
  font-size: 14px;
  margin-left: 8px;
}

.drop-enter-active,
.drop-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.drop-enter-from,
.drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>