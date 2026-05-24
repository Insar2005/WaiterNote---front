import { apiGet, apiPatch, USE_MOCK } from './client'
import * as mock from '@/mocks/handlers'

export const meApi = {
  get() {
    return USE_MOCK ? mock.getMe() : apiGet('/me')
  },
  update(patch) {
    return USE_MOCK ? mock.updateMe(patch) : apiPatch('/me', patch)
  },
}