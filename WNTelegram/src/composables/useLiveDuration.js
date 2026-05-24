import { computed } from 'vue'
import { useNow } from '@vueuse/core'

/**
 * Reactive duration in seconds between `startTime` (unix seconds) and now.
 * Returns 0 if startTime is falsy.
 *
 * Usage:
 *   const duration = useLiveDuration(() => shift.current?.start_time)
 *   formatDuration(duration.value) // updates every second
 */
export function useLiveDuration(startTimeGetter, { interval = 1000 } = {}) {
  const now = useNow({ interval })
  return computed(() => {
    const start = startTimeGetter()
    if (!start) return 0
    const seconds = Math.floor(now.value.getTime() / 1000) - Number(start)
    return Math.max(0, seconds)
  })
}