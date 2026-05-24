import { nanoid } from 'nanoid'

/**
 * Generate a 21-char nanoid. All client-generated IDs use this.
 * Backend validates format with regex ^[A-Za-z0-9_-]{21}$.
 */
export function newId() {
  return nanoid(21)
}