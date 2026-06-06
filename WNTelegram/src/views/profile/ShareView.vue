<template>
  <div class="page">
    <header class="header">
      <button class="back-btn" @click="goBack" aria-label="Назад">←</button>
      <h1 class="title">Поделиться</h1>
    </header>

    <div v-if="workplace.current" class="content">
      <ImportSharesSection />
    </div>
    <div v-else class="empty">
      <p>Сначала выбери заведение в Профиле.</p>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useWorkplaceStore } from '@/stores/workplace'
import ImportSharesSection from './ImportSharesSection.vue'

const router = useRouter()
const workplace = useWorkplaceStore()

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'profile' })
  }
}
</script>

<style scoped>
.page {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
  background-color: var(--wn-bg);
  min-height: 100vh;
  color: var(--wn-ink);
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.back-btn {
  background: none;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--wn-ink);
  cursor: pointer;
  padding: 4px 8px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  margin: 0;
  color: var(--wn-ink);
}

.empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--wn-ink-mute);
  font-size: 14px;
}
</style>