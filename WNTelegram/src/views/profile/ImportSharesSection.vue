<template>
  <section class="section">
    <h2 class="section-title">Поделиться меню и залами</h2>
    <p class="section-hint">
      Создайте временную ссылку — коллеги смогут скопировать ваше меню
      и расстановку столов в своё заведение.
    </p>

    <!-- Active shares list -->
    <div v-if="imports.activeShares.length > 0" class="shares-list">
      <ShareCard
        v-for="share in imports.activeShares"
        :key="share.id"
        :share="share"
        :bot-username="botUsername"
        @copy-code="copyCode"
        @copy-link="copyLink"
        @share-link="shareLink"
        @revoke="onRevoke"
      />
    </div>

    <!-- Single CTA when nothing's active -->
    <div v-else-if="!imports.isLoadingShares" class="empty">
      <p class="empty-text">Активных ссылок нет.</p>
    </div>

    <button
      class="btn-create"
      :disabled="creating"
      @click="onCreateClick"
    >
      {{ creating ? 'Создаём…' : '+ Создать ссылку' }}
    </button>

    <!-- Import side: enter someone else's code -->
    <button class="btn-import" @click="goToImport">
      ⤓ Импортировать по коду
    </button>

    <!-- TTL prompt sheet -->
    <transition name="fade">
      <div v-if="ttlPromptOpen" class="overlay" @click.self="ttlPromptOpen = false">
        <div class="prompt-sheet" role="dialog" aria-modal="true">
          <h3 class="prompt-title">На сколько часов открыть доступ?</h3>
          <p class="prompt-hint">
            По умолчанию 24 часа. Можно от 1 до 168 (неделя).
          </p>
          <input
            v-model.number="ttlHours"
            type="number"
            min="1"
            max="168"
            step="1"
            class="prompt-input"
            @keydown.enter="confirmCreate"
          />
          <div class="prompt-actions">
            <button class="btn btn--ghost" @click="ttlPromptOpen = false">
              Отмена
            </button>
            <button
              class="btn btn--primary"
              :disabled="!ttlValid"
              @click="confirmCreate"
            >
              Создать
            </button>
          </div>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useImportsStore } from '@/stores/imports'
import { useWorkplaceStore } from '@/stores/workplace'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import ShareCard from './ShareCard.vue'

const router = useRouter()
const imports = useImportsStore()
const workplace = useWorkplaceStore()
const auth = useAuthStore()
const ui = useUiStore()

const creating = ref(false)
const ttlPromptOpen = ref(false)
const ttlHours = ref(24)

const ttlValid = computed(
  () => Number.isFinite(ttlHours.value) && ttlHours.value >= 1 && ttlHours.value <= 168,
)

// Bot username comes from /me/bot-access (cached in auth store). We use
// it to build the t.me/<bot>?startapp=import_<code> deep link.
const botUsername = computed(() => auth.botUsername || 'waiternote_bot')

onMounted(() => {
  if (workplace.currentId) {
    imports.fetchShares(workplace.currentId).catch((e) => {
      ui.toastError(e.message)
    })
  }
})

function goToImport() {
  router.push({ name: 'import' })
}

function onCreateClick() {
  // Only the owner can create. The button is shown regardless of role —
  // backend returns 403 if not owner — but we surface a friendlier message
  // up front for non-owners.
  if (!workplace.isCurrentOwner) {
    ui.toastError('Только владелец заведения может создавать ссылки')
    return
  }
  ttlHours.value = 24
  ttlPromptOpen.value = true
}

async function confirmCreate() {
  if (!ttlValid.value || creating.value) return
  creating.value = true
  ttlPromptOpen.value = false
  try {
    const share = await imports.createShare(workplace.currentId, {
      ttl_hours: ttlHours.value,
    })
    ui.toastSuccess(`Ссылка создана: ${share.code}`)
    // Auto-copy the deep link on creation — saves a tap.
    copyLink(share)
  } catch (e) {
    ui.toastError(e.message)
  } finally {
    creating.value = false
  }
}

async function onRevoke(share) {
  const ok = await ui.confirm({
    title: 'Закрыть доступ?',
    message: 'После этого ссылку нельзя будет использовать.',
    confirmText: 'Закрыть',
    cancelText: 'Отмена',
    danger: true,
  })
  if (!ok) return
  try {
    await imports.revokeShare(share.id)
    ui.toastSuccess('Ссылка отозвана')
  } catch (e) {
    ui.toastError(e.message)
  }
}

// ----- Clipboard / share helpers -----

function shareUrlFor(share) {
  return `https://t.me/${botUsername.value}?startapp=import_${share.code}`
}

async function copyCode(share) {
  await writeToClipboard(share.code)
  ui.toastSuccess('Код скопирован')
}

async function copyLink(share) {
  await writeToClipboard(shareUrlFor(share))
  ui.toastSuccess('Ссылка скопирована')
}

/**
 * Build the message text that goes into the share. Includes both the
 * code (so the recipient can type/paste it) and the deep-link URL (so
 * one tap in Telegram opens the import screen with the code prefilled).
 * Kept verbose on purpose — recipients see this raw in their chat, so
 * a short instruction line is worth the bytes.
 */
function buildShareText(share) {
  const url = shareUrlFor(share)
  return (
    `Привет! Делюсь с тобой меню и расстановкой столов из Waiter Note.\n\n` +
    `Код для импорта: ${share.code}\n\n` +
    `Открой ссылку — она откроет мини-приложение и подставит код:\n${url}`
  )
}

/**
 * Share the link. Inside Telegram we open t.me/share/url which spawns
 * Telegram's native "Forward to chat" picker — the user picks a chat
 * and the message is sent there. Outside Telegram (browser) we fall
 * back to the Web Share API, then to clipboard.
 */
async function shareLink(share) {
  const url = shareUrlFor(share)
  const text = buildShareText(share)

  const tg = window.Telegram?.WebApp
  if (tg?.openTelegramLink) {
    // t.me/share/url is Telegram's official sharing entry point. It opens
    // the chat picker inside Telegram itself — the user chooses where to
    // forward and the message lands there with the URL + text we built.
    // We pass only `text` (no separate `url`) because Telegram appends
    // its own preview to whichever URL is in the text body, and putting
    // the URL both in `url=` and inside `text=` would duplicate it.
    const shareHref =
      
      `&text=${encodeURIComponent(text)}`
    try {
      tg.openTelegramLink(shareHref)
      return
    } catch {
      /* fall through to other options */
    }
  }

  // Outside Telegram: native Web Share if supported (mobile Safari etc.)
  if (navigator.share) {
    try {
      await navigator.share({ text, url })
      return
    } catch {
      /* user cancelled or unsupported */
    }
  }

  // Last resort: copy the rich text so the user can paste it manually.
  await writeToClipboard(text)
  ui.toastSuccess('Скопировано в буфер')
}

/**
 * Robust clipboard write — navigator.clipboard isn't available inside
 * every Telegram WebApp version, so we fall back to a hidden textarea.
 */
async function writeToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      /* fall through */
    }
  }
  // Legacy fallback for older WebKit shells.
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.top = '-1000px'
  document.body.appendChild(el)
  el.select()
  try {
    document.execCommand('copy')
  } finally {
    document.body.removeChild(el)
  }
}
</script>

<style scoped>
.section {
  background-color: #fff;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
}

.section-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
}

.section-hint {
  margin: 0 0 14px;
  font-size: 13px;
  color: #666;
  line-height: 1.4;
}

.shares-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.empty {
  padding: 12px 0;
}

.empty-text {
  margin: 0;
  font-size: 13px;
  color: #999;
  text-align: center;
}

.btn-create {
  width: 100%;
  padding: 12px;
  background-color: #4caf50;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.btn-create:disabled {
  opacity: 0.6;
}

.btn-import {
  width: 100%;
  padding: 12px;
  background-color: transparent;
  color: #4caf50;
  border: 1px solid #4caf50;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  margin-top: 8px;
}
.btn-import:active {
  background-color: rgba(76, 175, 80, 0.08);
}

/* TTL prompt */
.overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  z-index: 300;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.prompt-sheet {
  background-color: #fff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  width: 100%;
  max-width: 500px;
  padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
}

.prompt-title {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 600;
}

.prompt-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: #666;
}

.prompt-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 16px;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-sizing: border-box;
  margin-bottom: 16px;
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  padding: 9px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}
.btn--ghost {
  background-color: transparent;
  color: #666;
}
.btn--primary {
  background-color: #4caf50;
  color: #fff;
}
.btn--primary:disabled {
  opacity: 0.5;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>