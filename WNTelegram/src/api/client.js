import axios from 'axios'
import { getInitData } from '@/utils/telegram'

/**
 * If true, all api/* modules dispatch to src/mocks/handlers.js instead of network.
 * Set VITE_USE_MOCK=true in .env to enable.
 */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

export const apiClient = axios.create({
  baseURL,
  timeout: 15000,
})

apiClient.interceptors.request.use((config) => {
  const initData = getInitData()
  if (initData) {
    config.headers['X-Init-Data'] = initData
  }
  return config
})

/**
 * Normalised API error. Stores rely on these fields.
 * Mock handlers throw the same shape so stores can't tell the difference.
 */
export class ApiError extends Error {
  constructor(message, { status = 0, detail = null, original = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.original = original
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (!error.response) {
      throw new ApiError('Сеть недоступна', { original: error })
    }
    const { status, data } = error.response
    const detail = data?.detail || data?.message || null

    let message
    if (status === 401) message = detail || 'Не авторизован'
    else if (status === 403) message = detail || 'Нет доступа'
    else if (status === 404) message = detail || 'Не найдено'
    else if (status === 409) message = detail || 'Конфликт состояния'
    else if (status >= 500) message = 'Ошибка сервера'
    else message = detail || `Ошибка ${status}`

    throw new ApiError(message, { status, detail, original: error })
  },
)

export async function apiGet(url, config) {
  const r = await apiClient.get(url, config)
  return r.data
}

export async function apiPost(url, body, config) {
  const r = await apiClient.post(url, body, config)
  return r.data
}

export async function apiPatch(url, body, config) {
  const r = await apiClient.patch(url, body, config)
  return r.data
}

export async function apiDelete(url, config) {
  const r = await apiClient.delete(url, config)
  return r.data
}