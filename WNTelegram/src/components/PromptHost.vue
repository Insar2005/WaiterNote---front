<template>
  <PromptModal
    :visible="!!d"
    :title="d?.title || ''"
    :initial="d?.initial || ''"
    :placeholder="d?.placeholder || ''"
    :multiline="!!d?.multiline"
    :rows="d?.rows || 4"
    :input-type="d?.inputType || 'text'"
    :input-mode="d?.inputMode || 'text'"
    :max-length="d?.maxLength || 2000"
    :confirm-text="d?.confirmText || 'Сохранить'"
    :cancel-text="d?.cancelText || 'Отмена'"
    :required="!!d?.required"
    @confirm="onConfirm"
    @cancel="onCancel"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import PromptModal from './PromptModal.vue'

const ui = useUiStore()
const d = computed(() => ui.promptDialog)

function onConfirm(value) {
  ui.resolvePrompt(value)
}

function onCancel() {
  ui.resolvePrompt(null)
}
</script>