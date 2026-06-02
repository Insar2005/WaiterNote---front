import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

import { importsApi } from '@/api/imports'

/**
 * Two sides of the same feature share one store:
 *   - Owner side: list/create/revoke shares for the current workplace
 *   - Importer side: preview a code, apply a copy into the user's workplace
 *
 * State is intentionally narrow — we don't cache previews aggressively
 * because the source workplace can change between visits (the owner might
 * add a hall right before sharing). Each "open" of the import screen
 * refetches.
 */
export const useImportsStore = defineStore('imports', () => {
  // ----- Owner side -----
  const shares = ref([])
  const isLoadingShares = ref(false)

  const activeShares = computed(() =>
    shares.value.filter((s) => s.is_active),
  )

  async function fetchShares(workplaceId) {
    isLoadingShares.value = true
    try {
      shares.value = await importsApi.listShares(workplaceId)
    } finally {
      isLoadingShares.value = false
    }
  }

  async function createShare(workplaceId, { ttl_hours = 24 } = {}) {
    const share = await importsApi.createShare(workplaceId, { ttl_hours })
    // Prepend so the freshly-created one shows on top.
    shares.value = [share, ...shares.value]
    return share
  }

  async function revokeShare(shareId) {
    await importsApi.revokeShare(shareId)
    // Reflect locally — backend has marked revoked_at; recompute is_active.
    shares.value = shares.value.map((s) =>
      s.id === shareId
        ? { ...s, is_active: false, revoked_at: Math.floor(Date.now() / 1000) }
        : s,
    )
  }

  // ----- Importer side -----
  const preview = ref(null)        // { source_workplace_title, halls, categories }
  const previewCode = ref(null)    // currently previewed code (for retries)
  const isLoadingPreview = ref(false)

  async function fetchPreview(code) {
    isLoadingPreview.value = true
    previewCode.value = code
    try {
      preview.value = await importsApi.preview(code)
    } catch (e) {
      preview.value = null
      throw e
    } finally {
      isLoadingPreview.value = false
    }
  }

  function clearPreview() {
    preview.value = null
    previewCode.value = null
  }

  async function applyImport({
    code,
    target_workplace_id,
    hall_ids = [],
    category_ids = [],
    replace_halls = false,
    replace_categories = false,
  }) {
    return importsApi.apply(code, {
      target_workplace_id,
      hall_ids,
      category_ids,
      replace_halls,
      replace_categories,
    })
  }

  function reset() {
    shares.value = []
    preview.value = null
    previewCode.value = null
    isLoadingShares.value = false
    isLoadingPreview.value = false
  }

  return {
    // state
    shares, isLoadingShares, preview, previewCode, isLoadingPreview,
    // getters
    activeShares,
    // actions
    fetchShares, createShare, revokeShare,
    fetchPreview, clearPreview, applyImport,
    reset,
  }
})