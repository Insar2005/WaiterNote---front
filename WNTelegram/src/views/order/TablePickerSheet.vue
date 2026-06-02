<template>
  <transition name="fade">
    <div v-if="visible" class="overlay" @click.self="$emit('close')">
      <div class="sheet">
        <header class="sheet-header">
          <h3 class="sheet-title">Выбрать стол</h3>
          <button class="close-btn" @click="$emit('close')">×</button>
        </header>

        <div class="halls-tabs" v-if="hall.sortedHalls.length > 1">
          <button
            v-for="h in hall.sortedHalls"
            :key="h.id"
            class="hall-tab"
            :class="{ 'hall-tab--active': h.id === activeHallId }"
            @click="activeHallId = h.id"
          >
            {{ h.name }}
          </button>
        </div>

        <div class="map-wrap" v-if="activeHall">
          <svg
            class="map"
            :viewBox="`0 0 ${activeHall.width} ${activeHall.height}`"
            preserveAspectRatio="xMidYMid meet"
          >
            <rect
              :width="activeHall.width"
              :height="activeHall.height"
              class="pick-bg"
              stroke-width="2"
            />
            <g
              v-for="t in tables"
              :key="t.id"
              :transform="`translate(${t.x} ${t.y}) rotate(${t.rotation || 0} ${t.width/2} ${t.height/2})`"
              :class="[
                'pick-table',
                `pick-table--${t.status}`,
                {
                  'pick-table--current': t.id === currentTableId,
                  'pick-table--blocked': isBlocked(t),
                },
              ]"
              @click="!isBlocked(t) && onPick(t)"
            >
              <rect
                :width="t.width"
                :height="t.height"
                :rx="t.border_radius"
                :ry="t.border_radius"
                class="pick-table-rect"
              />
              <text
                :x="t.width / 2"
                :y="t.height / 2"
                text-anchor="middle"
                dominant-baseline="central"
                class="pick-table-num"
              >
                {{ t.number }}
              </text>
            </g>
          </svg>
        </div>
        <div v-else class="empty">
          <p>В этом заведении пока нет залов.</p>
        </div>

        <div class="legend">
          <span class="legend-item"><span class="legend-dot legend-dot--free" />Свободен</span>
          <span class="legend-item"><span class="legend-dot legend-dot--waiting" />Не подано</span>
          <span class="legend-item"><span class="legend-dot legend-dot--occupied" />Ждёт оплаты</span>
          <span class="legend-item"><span class="legend-dot legend-dot--reserved" />Резерв</span>
        </div>

        <footer class="sheet-footer">
          <button
            class="btn btn--ghost"
            @click="$emit('select', null)"
          >
            Без стола
          </button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useHallStore } from '@/stores/hall'

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** Currently selected table id (highlighted differently in the picker). */
  currentTableId: { type: String, default: null },
  /**
   * The user wants to pick a *free* table for a *new* order.
   * Setting this to true greys out tables with active orders.
   */
  freeOnly: { type: Boolean, default: true },
})

const emit = defineEmits(['close', 'select'])

const hall = useHallStore()

const activeHallId = ref(hall.activeHallId)

watch(
  () => props.visible,
  (v) => {
    if (v) activeHallId.value = hall.activeHallId || hall.sortedHalls[0]?.id || null
  },
)

const activeHall = computed(() =>
  hall.halls.find((h) => h.id === activeHallId.value) || null,
)

const tables = computed(() =>
  activeHallId.value ? hall.tablesOfHall(activeHallId.value) : [],
)

function isBlocked(t) {
  if (t.id === props.currentTableId) return false
  if (props.freeOnly && t.order_id) return true
  return false
}

function onPick(t) {
  emit('select', t.id)
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 260;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  background-color: var(--wn-bg-elevated);
  border-top-left-radius: 18px;
  border-top-right-radius: 18px;
  width: 100%;
  max-width: 600px;
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px 20px;
  border-bottom: 1px solid var(--wn-glass-border-subtle);
}

.sheet-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  line-height: 1;
  color: var(--wn-ink-mute);
  cursor: pointer;
  padding: 4px 8px;
}

.halls-tabs {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  overflow-x: auto;
  scrollbar-width: none;
  border-bottom: 1px solid var(--wn-glass-border-subtle);
}

.halls-tabs::-webkit-scrollbar {
  display: none;
}

.hall-tab {
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--wn-glass-border-subtle);
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  color: var(--wn-ink-soft);
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
}

.hall-tab--active {
  background-color: var(--wn-accent);
  border-color: var(--wn-accent-text);
  color: #fff;
}

.map-wrap {
  flex: 1;
  padding: 12px 16px;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map {
  width: 100%;
  max-height: 380px;
  display: block;
}

.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wn-ink-mute);
  padding: 40px 20px;
}

.pick-bg {
  fill: var(--wn-bg);
  stroke: var(--wn-glass-border-subtle);
}

.pick-table {
  cursor: pointer;
}

.pick-table-rect {
  stroke-width: 2;
  transition: fill 0.15s ease, stroke 0.15s ease;
}

.pick-table-num {
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 20px;
  font-weight: 600;
  pointer-events: none;
}

.pick-table--free .pick-table-rect {
  fill: var(--wn-bg-elevated);
  stroke: var(--wn-glass-border-subtle);
}
.pick-table--free .pick-table-num {
  fill: var(--wn-ink-soft);
}

/* Не подано — акцентный неон */
.pick-table--waiting .pick-table-rect {
  fill: color-mix(in srgb, var(--wn-accent) 16%, var(--wn-bg-elevated));
  stroke: var(--wn-accent);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--wn-accent) 65%, transparent));
}
.pick-table--waiting .pick-table-num {
  fill: var(--wn-accent-text);
}

/* Ждёт оплаты — всегда красный неон */
.pick-table--occupied .pick-table-rect {
  fill: color-mix(in srgb, var(--wn-danger) 16%, var(--wn-bg-elevated));
  stroke: var(--wn-danger);
  stroke-width: 2.5;
  filter: drop-shadow(0 0 5px color-mix(in srgb, var(--wn-danger) 65%, transparent));
}
.pick-table--occupied .pick-table-num {
  fill: var(--wn-danger);
}

.pick-table--reserved .pick-table-rect {
  fill: color-mix(in srgb, #42a5f5 15%, var(--wn-bg-elevated));
  stroke: #42a5f5;
}
.pick-table--reserved .pick-table-num {
  fill: #1565c0;
}

.pick-table--current .pick-table-rect {
  stroke: var(--wn-accent);
  stroke-width: 4;
  fill: color-mix(in srgb, var(--wn-accent) 22%, var(--wn-bg-elevated));
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--wn-accent) 70%, transparent));
}
.pick-table--current .pick-table-num {
  fill: var(--wn-accent-text);
}

.pick-table--blocked {
  cursor: not-allowed;
  opacity: 0.5;
}

.pick-table:not(.pick-table--blocked):active .pick-table-rect {
  filter: brightness(0.95);
}

.legend {
  display: flex;
  gap: 14px;
  padding: 8px 16px;
  font-size: 11px;
  color: var(--wn-ink-mute);
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  display: inline-block;
}

.legend-dot--free {
  background-color: var(--wn-bg-elevated);
  border: 1.5px solid var(--wn-glass-border-subtle);
}
.legend-dot--waiting {
  background-color: color-mix(in srgb, var(--wn-accent) 22%, var(--wn-bg-elevated));
  border: 1.5px solid var(--wn-accent);
}
.legend-dot--occupied {
  background-color: color-mix(in srgb, var(--wn-danger) 22%, var(--wn-bg-elevated));
  border: 1.5px solid var(--wn-danger);
}
.legend-dot--reserved {
  background-color: color-mix(in srgb, #42a5f5 18%, var(--wn-bg-elevated));
  border: 1.5px solid #42a5f5;
}

.sheet-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--wn-glass-border-subtle);
}

.btn {
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
}

.btn--ghost {
  background-color: var(--wn-bg);
  color: var(--wn-ink-soft);
}

.btn--ghost:active {
  opacity: 0.85;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.fade-enter-active .sheet,
.fade-leave-active .sheet {
  transition: transform 0.22s ease;
}
.fade-enter-from .sheet,
.fade-leave-to .sheet {
  transform: translateY(100%);
}
</style>