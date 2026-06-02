/**
 * Mock backend handlers. Each function mirrors a real endpoint.
 * Throws ApiError just like axios interceptors would, so stores
 * don't see any difference between mock and real backend.
 */
import { db, tx, ensureMe } from './db'
import { ApiError } from '@/api/client'
import { newId } from '@/utils/nanoid'

// =====================
// Helpers
// =====================

const NETWORK_DELAY_MIN = 80
const NETWORK_DELAY_MAX = 220

function utcTs() {
  return Math.floor(Date.now() / 1000)
}

function delay() {
  const ms = NETWORK_DELAY_MIN + Math.random() * (NETWORK_DELAY_MAX - NETWORK_DELAY_MIN)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function notFound(what) {
  return new ApiError(`${what} не найдено`, { status: 404, detail: 'not found' })
}

function conflict(message) {
  return new ApiError(message, { status: 409, detail: message })
}

function badRequest(message) {
  return new ApiError(message, { status: 400, detail: message })
}

function forbidden(message) {
  return new ApiError(message, { status: 403, detail: message })
}

/** Deep-clone a record so callers can't accidentally mutate the mock DB. */
function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj))
}

function findIndex(list, id) {
  return list.findIndex((x) => x.id === id)
}

function find(list, id) {
  return list.find((x) => x.id === id)
}

// Verify membership: in mock, current user is automatically owner of every
// workplace they create, and the only one. Sharing isn't simulated yet.
function hasAccess(workplaceId, userId) {
  return db.workplace_members.some(
    (m) => m.workplace_id === workplaceId && m.user_id === userId,
  )
}

function getRole(workplaceId, userId) {
  const m = db.workplace_members.find(
    (x) => x.workplace_id === workplaceId && x.user_id === userId,
  )
  return m ? m.role : null
}

// =====================
// /me
// =====================

export async function getMe() {
  await delay()
  ensureMe()
  return clone(db.me)
}

export async function updateMe(patch) {
  await delay()
  ensureMe()
  const allowed = ['language', 'timezone', 'is_onboarding_completed', 'accent_key', 'theme']
  tx(() => {
    for (const k of allowed) {
      if (patch[k] !== undefined) db.me[k] = patch[k]
    }
    db.me.updated_at = utcTs()
  })
  return clone(db.me)
}

// =====================
// Workplaces
// =====================

function workplaceWithRole(w, userId) {
  return { ...clone(w), my_role: getRole(w.id, userId) || 'member' }
}

export async function listWorkplaces({ includeArchived = false } = {}) {
  await delay()
  const me = ensureMe()
  const myMemberships = db.workplace_members.filter((m) => m.user_id === me.id)
  const workplaceIds = new Set(myMemberships.map((m) => m.workplace_id))
  let list = db.workplaces.filter((w) => workplaceIds.has(w.id))
  if (!includeArchived) list = list.filter((w) => !w.is_archived)
  list.sort((a, b) => a.position - b.position)
  return list.map((w) => workplaceWithRole(w, me.id))
}

export async function getWorkplace(id) {
  await delay()
  const me = ensureMe()
  const w = find(db.workplaces, id)
  if (!w || !hasAccess(id, me.id)) throw notFound('Заведение')
  return workplaceWithRole(w, me.id)
}

export async function createWorkplace(body) {
  await delay()
  const me = ensureMe()
  if (find(db.workplaces, body.id)) throw conflict('Workplace с таким id уже существует')

  const ownPositions = db.workplaces
    .filter((w) => w.owner_id === me.id)
    .map((w) => w.position)
  const maxPos = ownPositions.length ? Math.max(...ownPositions) : -1

  const now = utcTs()
  const wp = {
    id: body.id,
    owner_id: me.id,
    title: body.title,
    timezone: body.timezone,
    currency: body.currency,
    service_percent_default: body.service_percent_default,
    shift_type_default: body.shift_type_default,
    pay_for_shift_default: body.pay_for_shift_default,
    position: maxPos + 1,
    is_archived: false,
    created_at: now,
    updated_at: now,
  }

  tx(() => {
    db.workplaces.push(wp)
    db.workplace_members.push({
      id: cryptoRandomId(),
      workplace_id: wp.id,
      user_id: me.id,
      role: 'owner',
      joined_at: now,
    })
    db.me.last_workplace_id = wp.id
    db.me.updated_at = now
  })

  return workplaceWithRole(wp, me.id)
}

export async function updateWorkplace(id, patch) {
  await delay()
  const me = ensureMe()
  const w = find(db.workplaces, id)
  if (!w || !hasAccess(id, me.id)) throw notFound('Заведение')

  const allowed = [
    'title', 'timezone', 'currency',
    'service_percent_default', 'shift_type_default', 'pay_for_shift_default',
  ]
  tx(() => {
    for (const k of allowed) {
      if (patch[k] !== undefined) w[k] = patch[k]
    }
    w.updated_at = utcTs()
  })
  return workplaceWithRole(w, me.id)
}

export async function archiveWorkplace(id) {
  return setWorkplaceArchived(id, true)
}
export async function unarchiveWorkplace(id) {
  return setWorkplaceArchived(id, false)
}

async function setWorkplaceArchived(id, value) {
  await delay()
  const me = ensureMe()
  const w = find(db.workplaces, id)
  if (!w || !hasAccess(id, me.id)) throw notFound('Заведение')
  if (w.owner_id !== me.id) throw forbidden('owner access required')
  tx(() => {
    w.is_archived = value
    w.updated_at = utcTs()
  })
  return workplaceWithRole(w, me.id)
}

export async function deleteWorkplace(id) {
  await delay()
  const me = ensureMe()
  const w = find(db.workplaces, id)
  if (!w || !hasAccess(id, me.id)) throw notFound('Заведение')
  if (w.owner_id !== me.id) throw forbidden('owner access required')

  // cascade
  tx(() => {
    cascadeDeleteWorkplace(id)
    if (db.me.last_workplace_id === id) db.me.last_workplace_id = null
  })
}

function cascadeDeleteWorkplace(workplaceId) {
  const hallIds = db.halls.filter((h) => h.workplace_id === workplaceId).map((h) => h.id)
  const tableIds = db.tables.filter((t) => hallIds.includes(t.hall_id)).map((t) => t.id)
  const catIds = db.menu_categories
    .filter((c) => c.workplace_id === workplaceId)
    .map((c) => c.id)
  const itemIds = db.menu_items.filter((i) => catIds.includes(i.category_id)).map((i) => i.id)
  const shiftIds = db.shifts.filter((s) => s.workplace_id === workplaceId).map((s) => s.id)
  const orderIds = db.orders.filter((o) => shiftIds.includes(o.shift_id)).map((o) => o.id)

  db.tables = db.tables.filter((t) => !tableIds.includes(t.id))
  db.halls = db.halls.filter((h) => !hallIds.includes(h.id))
  db.menu_items = db.menu_items.filter((i) => !itemIds.includes(i.id))
  db.menu_categories = db.menu_categories.filter((c) => !catIds.includes(c.id))
  db.order_items = db.order_items.filter((oi) => !orderIds.includes(oi.order_id))
  db.orders = db.orders.filter((o) => !orderIds.includes(o.id))
  db.shifts = db.shifts.filter((s) => !shiftIds.includes(s.id))
  db.notes = db.notes.filter(
    (n) => n.workplace_id !== workplaceId && !shiftIds.includes(n.shift_id),
  )
  db.workplace_members = db.workplace_members.filter((m) => m.workplace_id !== workplaceId)
  db.workplaces = db.workplaces.filter((w) => w.id !== workplaceId)
}

export async function reorderWorkplaces(ids) {
  await delay()
  const me = ensureMe()
  tx(() => {
    let pos = 0
    for (const id of ids) {
      const w = find(db.workplaces, id)
      if (w && w.owner_id === me.id) {
        w.position = pos++
        w.updated_at = utcTs()
      }
    }
  })
}

export async function selectWorkplace(id) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(id, me.id)) throw notFound('Заведение')
  tx(() => {
    db.me.last_workplace_id = id
    db.me.updated_at = utcTs()
  })
}

// =====================
// Halls + Tables
// =====================

function tablesOfHall(hallId) {
  return db.tables.filter((t) => t.hall_id === hallId).map(clone)
}

function hallWithTables(h) {
  const cloned = clone(h)
  cloned.tables = tablesOfHall(h.id)
  return cloned
}

export async function listHalls(workplaceId) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  const halls = db.halls
    .filter((h) => h.workplace_id === workplaceId)
    .sort((a, b) => a.position - b.position)
  return halls.map(hallWithTables)
}

export async function createHall(workplaceId, body) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  if (find(db.halls, body.id)) throw conflict('Hall id already exists')

  const positions = db.halls
    .filter((h) => h.workplace_id === workplaceId)
    .map((h) => h.position)
  const maxPos = positions.length ? Math.max(...positions) : -1

  const hall = {
    id: body.id,
    workplace_id: workplaceId,
    name: body.name,
    width: body.width,
    height: body.height,
    scale: body.scale,
    position: maxPos + 1,
  }
  tx(() => db.halls.push(hall))
  return hallWithTables(hall)
}

export async function getHall(hallId) {
  await delay()
  const me = ensureMe()
  const h = find(db.halls, hallId)
  if (!h || !hasAccess(h.workplace_id, me.id)) throw notFound('Зал')
  return hallWithTables(h)
}

export async function updateHall(hallId, patch) {
  await delay()
  const me = ensureMe()
  const h = find(db.halls, hallId)
  if (!h || !hasAccess(h.workplace_id, me.id)) throw notFound('Зал')
  const allowed = ['name', 'width', 'height', 'scale']
  tx(() => {
    for (const k of allowed) if (patch[k] !== undefined) h[k] = patch[k]
  })
  return hallWithTables(h)
}

export async function deleteHall(hallId) {
  await delay()
  const me = ensureMe()
  const h = find(db.halls, hallId)
  if (!h || !hasAccess(h.workplace_id, me.id)) throw notFound('Зал')
  tx(() => {
    const tableIds = db.tables.filter((t) => t.hall_id === hallId).map((t) => t.id)
    db.tables = db.tables.filter((t) => t.hall_id !== hallId)
    // Detach orders from these tables (mirror SET NULL on backend)
    for (const o of db.orders) {
      if (tableIds.includes(o.table_id)) {
        o.table_id = null
        o.hall_id = null
      }
    }
    db.halls = db.halls.filter((x) => x.id !== hallId)
  })
}

export async function reorderHalls(workplaceId, ids) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  tx(() => {
    let pos = 0
    for (const id of ids) {
      const h = find(db.halls, id)
      if (h && h.workplace_id === workplaceId) h.position = pos++
    }
  })
}

export async function createTable(hallId, body) {
  await delay()
  const me = ensureMe()
  const hall = find(db.halls, hallId)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Зал')
  if (find(db.tables, body.id)) throw conflict('Table id already exists')

  const dup = db.tables.find((t) => t.hall_id === hallId && t.number === body.number)
  if (dup) throw conflict(`Стол №${body.number} уже существует в этом зале`)

  const table = {
    id: body.id,
    hall_id: hallId,
    order_id: null,
    number: body.number,
    x: body.x,
    y: body.y,
    width: body.width,
    height: body.height,
    rotation: body.rotation,
    border_radius: body.border_radius,
    status: 'free',
  }
  tx(() => db.tables.push(table))
  return clone(table)
}

export async function updateTable(tableId, patch) {
  await delay()
  const me = ensureMe()
  const t = find(db.tables, tableId)
  if (!t) throw notFound('Стол')
  const hall = find(db.halls, t.hall_id)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Стол')

  if (patch.number !== undefined && patch.number !== t.number) {
    const dup = db.tables.find(
      (x) => x.hall_id === t.hall_id && x.number === patch.number && x.id !== t.id,
    )
    if (dup) throw conflict(`Стол №${patch.number} уже существует`)
  }

  const allowed = ['number', 'x', 'y', 'width', 'height', 'rotation', 'border_radius', 'status']
  tx(() => {
    for (const k of allowed) if (patch[k] !== undefined) t[k] = patch[k]
  })
  return clone(t)
}

export async function deleteTable(tableId) {
  await delay()
  const me = ensureMe()
  const t = find(db.tables, tableId)
  if (!t) throw notFound('Стол')
  const hall = find(db.halls, t.hall_id)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Стол')
  tx(() => {
    for (const o of db.orders) {
      if (o.table_id === tableId) {
        o.table_id = null
      }
    }
    db.tables = db.tables.filter((x) => x.id !== tableId)
  })
}

// =====================
// Hall Layouts (Templates)
// =====================

/**
 * Helper: shape a layout DTO with its embedded positions for the API.
 * Positions stay sorted by table_number for deterministic UI rendering.
 */
function layoutWithPositions(layout) {
  const cloned = clone(layout)
  cloned.positions = db.table_positions
    .filter((p) => p.layout_id === layout.id)
    .sort((a, b) => a.table_number - b.table_number)
    .map(clone)
  return cloned
}

/** List saved layouts for a hall. */
export async function listLayouts(hallId) {
  await delay()
  const me = ensureMe()
  const hall = find(db.halls, hallId)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Зал')
  return db.hall_layouts
    .filter((l) => l.hall_id === hallId)
    .sort((a, b) => a.created_at - b.created_at)
    .map(layoutWithPositions)
}

/**
 * Save the hall's *current* table arrangement as a new layout.
 * The caller doesn't pass positions — we snapshot from the live `tables`
 * so the layout always reflects what the user sees on screen at the moment
 * they hit "save".
 */
export async function createLayout(hallId, { id, name }) {
  await delay()
  const me = ensureMe()
  const hall = find(db.halls, hallId)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Зал')
  if (!id) throw badRequest('id is required')
  if (!name || !name.trim()) throw badRequest('name is required')

  const layoutId = id
  return tx(() => {
    const now = utcTs()
    const layout = {
      id: layoutId,
      hall_id: hallId,
      name: name.trim(),
      created_at: now,
      updated_at: now,
    }
    db.hall_layouts.push(layout)

    // Snapshot every current table in this hall.
    for (const t of db.tables.filter((x) => x.hall_id === hallId)) {
      db.table_positions.push({
        id: newId(),
        layout_id: layoutId,
        table_number: t.number,
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        rotation: t.rotation,
        border_radius: t.border_radius,
      })
    }
    return layoutWithPositions(layout)
  })
}

/** Rename a layout. */
export async function updateLayout(layoutId, { name }) {
  await delay()
  const me = ensureMe()
  const layout = find(db.hall_layouts, layoutId)
  if (!layout) throw notFound('Шаблон')
  const hall = find(db.halls, layout.hall_id)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Шаблон')
  if (!name || !name.trim()) throw badRequest('name is required')
  return tx(() => {
    layout.name = name.trim()
    layout.updated_at = utcTs()
    return layoutWithPositions(layout)
  })
}

/** Delete a layout (and its positions). */
export async function deleteLayout(layoutId) {
  await delay()
  const me = ensureMe()
  const layout = find(db.hall_layouts, layoutId)
  if (!layout) throw notFound('Шаблон')
  const hall = find(db.halls, layout.hall_id)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Шаблон')
  tx(() => {
    db.table_positions = db.table_positions.filter((p) => p.layout_id !== layoutId)
    db.hall_layouts = db.hall_layouts.filter((l) => l.id !== layoutId)
  })
}

/**
 * Apply a layout to its hall.
 *
 * Behavior:
 *   - For each `TablePosition` in the layout, find the table with the
 *     matching `number` in the hall:
 *       * exists  → move/resize it to match the position
 *       * missing → create a new table with these settings
 *   - Tables in the hall whose number is NOT in the layout are "extras":
 *       * by default, kept where they are
 *       * if `delete_extras` is true, removed — UNLESS they have an active
 *         order, in which case they're kept and reported in `kept_extras`
 *
 * Returns: { moved, created, kept_extras, deleted_extras }
 *   so the UI can show a summary toast and pulse the new/moved tables.
 *
 * Each new table needs a fresh nanoid; caller (frontend) generates one per
 * "missing number" via `new_table_ids` map — keeps id generation client-side
 * to match the rest of the API contract.
 */
export async function applyLayout(layoutId, { delete_extras = false, new_table_ids = {} } = {}) {
  await delay()
  const me = ensureMe()
  const layout = find(db.hall_layouts, layoutId)
  if (!layout) throw notFound('Шаблон')
  const hall = find(db.halls, layout.hall_id)
  if (!hall || !hasAccess(hall.workplace_id, me.id)) throw notFound('Шаблон')

  const positions = db.table_positions.filter((p) => p.layout_id === layoutId)
  const positionsByNumber = new Map(positions.map((p) => [p.table_number, p]))

  const moved = []
  const created = []
  const kept_extras = []
  const deleted_extras = []

  tx(() => {
    // Pass 1: move existing tables, create missing ones
    for (const pos of positions) {
      const existing = db.tables.find(
        (t) => t.hall_id === hall.id && t.number === pos.table_number,
      )
      if (existing) {
        existing.x = pos.x
        existing.y = pos.y
        existing.width = pos.width
        existing.height = pos.height
        existing.rotation = pos.rotation
        existing.border_radius = pos.border_radius
        moved.push(existing.id)
      } else {
        const tid = new_table_ids[pos.table_number] || newId()
        db.tables.push({
          id: tid,
          hall_id: hall.id,
          order_id: null,
          number: pos.table_number,
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
          rotation: pos.rotation,
          border_radius: pos.border_radius,
          status: 'free',
        })
        created.push(tid)
      }
    }

    // Pass 2: handle "extras" — tables in hall but not in layout
    if (delete_extras) {
      const extras = db.tables.filter(
        (t) => t.hall_id === hall.id && !positionsByNumber.has(t.number),
      )
      for (const t of extras) {
        // Safety: never delete a table with an active order. Demote the
        // intent — keep the table, surface this in `kept_extras`.
        const hasActiveOrder =
          t.order_id !== null && t.order_id !== undefined ||
          db.orders.some(
            (o) => o.table_id === t.id && !o.is_paid,
          )
        if (hasActiveOrder) {
          kept_extras.push({ id: t.id, number: t.number, reason: 'active_order' })
        } else {
          // Detach any historical (paid) orders' table_id refs to be safe
          for (const o of db.orders) {
            if (o.table_id === t.id) o.table_id = null
          }
          db.tables = db.tables.filter((x) => x.id !== t.id)
          deleted_extras.push(t.id)
        }
      }
    }
  })

  return {
    moved,
    created,
    kept_extras,
    deleted_extras,
  }
}

// =====================
// Menu
// =====================

function itemsOfCategory(catId) {
  return db.menu_items
    .filter((i) => i.category_id === catId)
    .sort((a, b) => a.position - b.position)
    .map(clone)
}

function categoryWithItems(c, { activeOnly = false } = {}) {
  const cloned = clone(c)
  let items = itemsOfCategory(c.id)
  if (activeOnly) items = items.filter((i) => i.is_active)
  cloned.items = items
  return cloned
}

export async function getMenuTree(workplaceId, { activeOnly = false } = {}) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  let cats = db.menu_categories
    .filter((c) => c.workplace_id === workplaceId)
    .sort((a, b) => a.position - b.position)
  if (activeOnly) cats = cats.filter((c) => c.is_active)
  return cats.map((c) => categoryWithItems(c, { activeOnly }))
}

export async function createCategory(workplaceId, body) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  if (find(db.menu_categories, body.id)) throw conflict('Category id already exists')
  const positions = db.menu_categories
    .filter((c) => c.workplace_id === workplaceId)
    .map((c) => c.position)
  const maxPos = positions.length ? Math.max(...positions) : -1
  const cat = {
    id: body.id,
    workplace_id: workplaceId,
    title: body.title,
    position: maxPos + 1,
    is_active: true,
  }
  tx(() => db.menu_categories.push(cat))
  return categoryWithItems(cat)
}

export async function updateCategory(categoryId, patch) {
  await delay()
  const me = ensureMe()
  const c = find(db.menu_categories, categoryId)
  if (!c || !hasAccess(c.workplace_id, me.id)) throw notFound('Категория')
  const allowed = ['title', 'is_active']
  tx(() => {
    for (const k of allowed) if (patch[k] !== undefined) c[k] = patch[k]
  })
  return categoryWithItems(c)
}

export async function deleteCategory(categoryId) {
  await delay()
  const me = ensureMe()
  const c = find(db.menu_categories, categoryId)
  if (!c || !hasAccess(c.workplace_id, me.id)) throw notFound('Категория')
  tx(() => {
    const itemIds = db.menu_items.filter((i) => i.category_id === categoryId).map((i) => i.id)
    db.menu_items = db.menu_items.filter((i) => i.category_id !== categoryId)
    // OrderItem.menu_item_id -> NULL on linked order_items (mirror SET NULL)
    for (const oi of db.order_items) {
      if (itemIds.includes(oi.menu_item_id)) oi.menu_item_id = null
    }
    db.menu_categories = db.menu_categories.filter((x) => x.id !== categoryId)
  })
}

export async function reorderCategories(workplaceId, ids) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  tx(() => {
    let pos = 0
    for (const id of ids) {
      const c = find(db.menu_categories, id)
      if (c && c.workplace_id === workplaceId) c.position = pos++
    }
  })
}

export async function createItem(categoryId, body) {
  await delay()
  const me = ensureMe()
  const c = find(db.menu_categories, categoryId)
  if (!c || !hasAccess(c.workplace_id, me.id)) throw notFound('Категория')
  if (find(db.menu_items, body.id)) throw conflict('Item id already exists')
  const positions = db.menu_items
    .filter((i) => i.category_id === categoryId)
    .map((i) => i.position)
  const maxPos = positions.length ? Math.max(...positions) : -1
  const item = {
    id: body.id,
    category_id: categoryId,
    title: body.title,
    description: body.description ?? null,
    portion: body.portion ?? null,
    price: body.price,
    position: maxPos + 1,
    is_active: true,
  }
  tx(() => db.menu_items.push(item))
  return clone(item)
}

export async function updateItem(itemId, patch) {
  await delay()
  const me = ensureMe()
  const item = find(db.menu_items, itemId)
  if (!item) throw notFound('Позиция меню')
  const cat = find(db.menu_categories, item.category_id)
  if (!cat || !hasAccess(cat.workplace_id, me.id)) throw notFound('Позиция меню')

  const result = tx(() => {
    if (patch.category_id !== undefined && patch.category_id !== item.category_id) {
      const newCat = find(db.menu_categories, patch.category_id)
      if (!newCat || !hasAccess(newCat.workplace_id, me.id)) {
        throw badRequest('target category not found or access denied')
      }
      if (newCat.workplace_id !== cat.workplace_id) {
        throw badRequest('cross-workplace move not allowed')
      }
      const positions = db.menu_items
        .filter((i) => i.category_id === patch.category_id)
        .map((i) => i.position)
      const maxPos = positions.length ? Math.max(...positions) : -1
      item.category_id = patch.category_id
      item.position = maxPos + 1
    }
    const allowed = ['title', 'description', 'portion', 'price', 'is_active']
    for (const k of allowed) if (patch[k] !== undefined) item[k] = patch[k]
    return item
  })
  return clone(result)
}

export async function deleteItem(itemId) {
  await delay()
  const me = ensureMe()
  const item = find(db.menu_items, itemId)
  if (!item) throw notFound('Позиция меню')
  const cat = find(db.menu_categories, item.category_id)
  if (!cat || !hasAccess(cat.workplace_id, me.id)) throw notFound('Позиция меню')
  tx(() => {
    for (const oi of db.order_items) {
      if (oi.menu_item_id === itemId) oi.menu_item_id = null
    }
    db.menu_items = db.menu_items.filter((x) => x.id !== itemId)
  })
}

export async function reorderItems(categoryId, ids) {
  await delay()
  const me = ensureMe()
  const c = find(db.menu_categories, categoryId)
  if (!c || !hasAccess(c.workplace_id, me.id)) throw notFound('Категория')
  tx(() => {
    let pos = 0
    for (const id of ids) {
      const i = find(db.menu_items, id)
      if (i && i.category_id === categoryId) i.position = pos++
    }
  })
}

// =====================
// Shifts
// =====================

function recomputeShiftAggregates(shift) {
  const paidOrders = db.orders.filter((o) => o.shift_id === shift.id && o.is_paid)
  shift.order_count = paidOrders.length
  shift.total_cash_register = round2(paidOrders.reduce((s, o) => s + o.total_price, 0))
  shift.total_tips = round2(paidOrders.reduce((s, o) => s + o.tips, 0))
  if (shift.shift_type === 'percent') {
    shift.total_pay_for_shift = round2(
      shift.total_cash_register * (shift.service_percent / 100),
    )
  } else {
    shift.total_pay_for_shift = shift.pay_for_shift
  }
}

function round2(x) {
  return Math.round(x * 100) / 100
}

export async function getCurrentShift(workplaceId) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  const shift = db.shifts.find(
    (s) => s.workplace_id === workplaceId && s.opened_by_user_id === me.id && !s.is_closed,
  )
  return shift ? clone(shift) : null
}

export async function openShift(workplaceId, body) {
  await delay()
  const me = ensureMe()
  const wp = find(db.workplaces, workplaceId)
  if (!wp || !hasAccess(workplaceId, me.id)) throw notFound('Заведение')

  const existing = db.shifts.find(
    (s) => s.workplace_id === workplaceId && s.opened_by_user_id === me.id && !s.is_closed,
  )
  if (existing) throw conflict('У вас уже есть открытая смена в этом заведении')

  if (find(db.shifts, body.id)) throw conflict('Shift id already exists')

  const now = utcTs()
  const shift = {
    id: body.id,
    workplace_id: workplaceId,
    opened_by_user_id: me.id,
    start_time: now,
    is_closed: false,
    end_time: null,
    place_work_title: wp.title,
    currency: wp.currency,
    service_percent: wp.service_percent_default,
    shift_type: wp.shift_type_default,
    pay_for_shift: wp.pay_for_shift_default,
    total_pay_for_shift: wp.pay_for_shift_default,
    total_tips: 0,
    total_cash_register: 0,
    order_count: 0,
    duration: 0,
  }
  tx(() => {
    db.shifts.push(shift)
    db.me.last_workplace_id = workplaceId
  })
  return clone(shift)
}

export async function listShifts(workplaceId, opts = {}) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  const { limit = 50, offset = 0, onlyMine = true, closedOnly = true } = opts
  let list = db.shifts.filter((s) => s.workplace_id === workplaceId)
  if (onlyMine) list = list.filter((s) => s.opened_by_user_id === me.id)
  if (closedOnly) list = list.filter((s) => s.is_closed)
  list.sort((a, b) => b.start_time - a.start_time)
  return list.slice(offset, offset + limit).map(clone)
}

export async function getShift(shiftId) {
  await delay()
  const me = ensureMe()
  const s = find(db.shifts, shiftId)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Смена')
  return clone(s)
}

export async function closeShift(shiftId, { force = false } = {}) {
  await delay()
  const me = ensureMe()
  const s = find(db.shifts, shiftId)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Смена')
  if (s.opened_by_user_id !== me.id) throw forbidden('only opener can close')
  if (s.is_closed) throw conflict('Смена уже закрыта')

  const unpaidCount = db.orders.filter((o) => o.shift_id === s.id && !o.is_paid).length
  if (unpaidCount && !force) {
    throw conflict(`У смены ${unpaidCount} неоплаченных заказов; передайте force=true`)
  }
  const result = tx(() => {
    recomputeShiftAggregates(s)
    // Detach any unpaid orders' tables — otherwise tables stay marked as
    // occupied (red) after the shift is force-closed, but `orderByTable`
    // can't find them (they don't belong to the current open shift).
    // The orders themselves are kept for history; only the table link
    // is cleared.
    const unpaidIds = db.orders
      .filter((o) => o.shift_id === s.id && !o.is_paid)
      .map((o) => o.id)
    for (const t of db.tables) {
      if (t.order_id && unpaidIds.includes(t.order_id)) {
        t.order_id = null
        t.status = 'free'
      }
    }
    const now = utcTs()
    s.end_time = now
    s.is_closed = true
    s.duration = Math.max(0, now - s.start_time)
    return s
  })
  return clone(result)
}

export async function recomputeShift(shiftId) {
  await delay()
  const me = ensureMe()
  const s = find(db.shifts, shiftId)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Смена')
  if (s.opened_by_user_id !== me.id) throw forbidden('only opener')
  tx(() => recomputeShiftAggregates(s))
  return clone(s)
}

export async function deleteShift(shiftId) {
  await delay()
  const me = ensureMe()
  const s = find(db.shifts, shiftId)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Смена')
  if (s.opened_by_user_id !== me.id) throw forbidden('only opener')
  if (!s.is_closed) throw conflict('Нельзя удалить открытую смену; сначала закройте её')
  tx(() => {
    const orderIds = db.orders.filter((o) => o.shift_id === shiftId).map((o) => o.id)
    db.order_items = db.order_items.filter((oi) => !orderIds.includes(oi.order_id))
    db.orders = db.orders.filter((o) => o.shift_id !== shiftId)
    db.shifts = db.shifts.filter((x) => x.id !== shiftId)
  })
}

// =====================
// Orders
// =====================

function itemsOfOrder(orderId) {
  return db.order_items.filter((oi) => oi.order_id === orderId).map(clone)
}

function orderWithItems(o) {
  const cloned = clone(o)
  cloned.items = itemsOfOrder(o.id)
  return cloned
}

function recomputeOrderTotal(orderId) {
  const items = db.order_items.filter((oi) => oi.order_id === orderId)
  const o = find(db.orders, orderId)
  if (o) o.total_price = round2(items.reduce((s, x) => s + x.total_price, 0))
}

function attachOrderToTable(orderId, tableId, hasItems) {
  const t = find(db.tables, tableId)
  if (t) {
    t.order_id = orderId
    // hasItems=false → "waiting" (заказ открыт, ничего не пробито).
    // hasItems=true  → "waiting" too — позиции есть, но они "не поданы"
    // по умолчанию (served=false). Жёлтый сигнал = "готовим, не подавали".
    // Красным стол станет только когда все позиции отмечены как served
    // (см. recomputeTableStatusForOrder).
    t.status = 'waiting'
  }
}

/**
 * Recompute a table's `status` from the current state of its attached
 * order. Called whenever items are added/removed/served-toggled so the
 * map reflects the real situation:
 *
 *   no items                    → waiting (just opened)
 *   has items, none served      → waiting (cooking)
 *   has items, some served      → waiting (still cooking some)
 *   has items, ALL served       → occupied (ready to pay)
 *
 * Free / reserved statuses are managed elsewhere; this only flips between
 * waiting/occupied while an order is attached.
 */
function recomputeTableStatusForOrder(orderId) {
  const o = find(db.orders, orderId)
  if (!o || !o.table_id) return
  const t = find(db.tables, o.table_id)
  if (!t || t.order_id !== o.id) return
  const items = itemsOfOrder(o.id)
  if (items.length === 0) {
    t.status = 'waiting'
    return
  }
  const allServed = items.every((i) => i.served)
  t.status = allServed ? 'occupied' : 'waiting'
}

function detachOrderFromTable(order) {
  if (!order.table_id) return
  const t = find(db.tables, order.table_id)
  if (t && t.order_id === order.id) {
    t.order_id = null
    t.status = 'free'
  }
}

export async function listOrdersForShift(shiftId, { onlyActive = false, onlyPaid = false } = {}) {
  await delay()
  const me = ensureMe()
  const s = find(db.shifts, shiftId)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Смена')
  let list = db.orders.filter((o) => o.shift_id === shiftId)
  if (onlyActive) list = list.filter((o) => !o.is_paid)
  if (onlyPaid) list = list.filter((o) => o.is_paid)
  list.sort((a, b) => b.created_at - a.created_at)
  return list.map(orderWithItems)
}

export async function getOrder(orderId) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')
  return orderWithItems(o)
}

function buildOrder({ orderId, shift, tableId, items, comments }) {
  if (shift.is_closed) throw conflict('Нельзя создать заказ в закрытой смене')
  if (find(db.orders, orderId)) throw conflict('Order id already exists')

  let tableSnap = { table_id: null, hall_id: null, table_number: null, hall_name: null }
  if (tableId) {
    const t = find(db.tables, tableId)
    if (!t) throw notFound('Стол')
    if (t.order_id) throw conflict('У стола уже есть активный заказ')
    const h = find(db.halls, t.hall_id)
    if (!h) throw notFound('Зал')
    if (h.workplace_id !== shift.workplace_id) throw badRequest('Стол из другого заведения')
    tableSnap = {
      table_id: t.id,
      hall_id: h.id,
      table_number: t.number,
      hall_name: h.name,
    }
  }

  const now = utcTs()
  const order = {
    id: orderId,
    shift_id: shift.id,
    ...tableSnap,
    comments: comments ?? null,
    created_at: now,
    updated_at: now,
    closed_at: null,
    tips: 0,
    total_price: 0,
    is_paid: false,
    is_done: false,
  }
  db.orders.push(order)

  for (const raw of items) {
    db.order_items.push({
      id: raw.id,
      order_id: order.id,
      menu_item_id: raw.menu_item_id ?? null,
      title: raw.title,
      price: raw.price,
      quantity: raw.quantity,
      total_price: round2(raw.price * raw.quantity),
      comment: raw.comment ?? null,
      served: false,
    })
  }
  recomputeOrderTotal(order.id)

  if (tableId) attachOrderToTable(order.id, tableId, items.length > 0)
  return order
}

export async function createOrderInShift(shiftId, body) {
  await delay()
  const me = ensureMe()
  const s = find(db.shifts, shiftId)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Смена')
  if (s.opened_by_user_id !== me.id) {
    throw forbidden('Только владелец смены может создавать в ней заказы')
  }
  const order = tx(() =>
    buildOrder({
      orderId: body.id,
      shift: s,
      tableId: body.table_id,
      items: body.items || [],
      comments: body.comments,
    }),
  )
  return orderWithItems(order)
}

export async function createOrderInCurrentShift(workplaceId, body) {
  await delay()
  const me = ensureMe()
  if (!hasAccess(workplaceId, me.id)) throw notFound('Заведение')
  const shift = db.shifts.find(
    (s) => s.workplace_id === workplaceId && s.opened_by_user_id === me.id && !s.is_closed,
  )
  if (!shift) throw conflict('Нет открытой смены — сначала откройте смену')
  const order = tx(() =>
    buildOrder({
      orderId: body.id,
      shift,
      tableId: body.table_id,
      items: body.items || [],
      comments: body.comments,
    }),
  )
  return orderWithItems(order)
}

function ensureEditable(o) {
  if (o.is_paid) throw conflict('Нельзя изменить оплаченный заказ')
}

export async function updateOrder(orderId, patch) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')
  ensureEditable(o)
  tx(() => {
    if (patch.comments !== undefined) o.comments = patch.comments
    if (patch.is_done !== undefined) o.is_done = patch.is_done
    o.updated_at = utcTs()
  })
  return orderWithItems(o)
}

export async function deleteOrder(orderId) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')

  tx(() => {
    const wasPaid = o.is_paid
    detachOrderFromTable(o)
    db.order_items = db.order_items.filter((oi) => oi.order_id !== orderId)
    db.orders = db.orders.filter((x) => x.id !== orderId)
    if (wasPaid) recomputeShiftAggregates(s)
  })
}

export async function addOrderItems(orderId, items) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')
  ensureEditable(o)

  tx(() => {
    for (const raw of items) {
      if (find(db.order_items, raw.id)) {
        throw conflict(`Order item id ${raw.id} already exists`)
      }
      db.order_items.push({
        id: raw.id,
        order_id: o.id,
        menu_item_id: raw.menu_item_id ?? null,
        title: raw.title,
        price: raw.price,
        quantity: raw.quantity,
        total_price: round2(raw.price * raw.quantity),
        comment: raw.comment ?? null,
        served: false,
      })
    }
    recomputeOrderTotal(o.id)
    o.updated_at = utcTs()
    // New items default to served=false, so the table should reflect
    // "not all served" → waiting. The recompute helper handles this.
    recomputeTableStatusForOrder(o.id)
  })
  return orderWithItems(o)
}

export async function updateOrderItem(itemId, patch) {
  await delay()
  const me = ensureMe()
  const oi = find(db.order_items, itemId)
  if (!oi) throw notFound('Позиция заказа')
  const o = find(db.orders, oi.order_id)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Позиция заказа')

  // Allow toggling `served` on paid orders too — it doesn't affect money,
  // it just records whether the dish was physically brought to the table.
  // All other fields require the order to be editable.
  const touchesMoney =
    patch.title !== undefined ||
    patch.price !== undefined ||
    patch.quantity !== undefined ||
    patch.comment !== undefined
  if (touchesMoney) ensureEditable(o)

  tx(() => {
    if (patch.title !== undefined) oi.title = patch.title
    if (patch.price !== undefined) oi.price = patch.price
    if (patch.quantity !== undefined) oi.quantity = patch.quantity
    if (patch.comment !== undefined) oi.comment = patch.comment
    if (patch.served !== undefined) oi.served = !!patch.served
    oi.total_price = round2(oi.price * oi.quantity)
    recomputeOrderTotal(o.id)
    o.updated_at = utcTs()
    // Toggling served may flip the table between waiting (some still cooking)
    // and occupied (all served, ready to pay). Recompute unconditionally —
    // it's a quick scan over the order's items.
    recomputeTableStatusForOrder(o.id)
  })
  return orderWithItems(o)
}

export async function removeOrderItem(itemId) {
  await delay()
  const me = ensureMe()
  const oi = find(db.order_items, itemId)
  if (!oi) throw notFound('Позиция заказа')
  const o = find(db.orders, oi.order_id)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Позиция заказа')
  ensureEditable(o)

  tx(() => {
    db.order_items = db.order_items.filter((x) => x.id !== itemId)
    recomputeOrderTotal(o.id)
    o.updated_at = utcTs()
    recomputeTableStatusForOrder(o.id)
  })
  return orderWithItems(o)
}

export async function moveOrder(orderId, newTableId) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')
  ensureEditable(o)
  if (newTableId === o.table_id) return orderWithItems(o)

  tx(() => {
    detachOrderFromTable(o)
    if (newTableId == null) {
      o.table_id = null
      o.hall_id = null
      o.table_number = null
      o.hall_name = null
    } else {
      const t = find(db.tables, newTableId)
      if (!t) throw notFound('Целевой стол')
      if (t.order_id) throw conflict('У целевого стола уже есть заказ')
      const h = find(db.halls, t.hall_id)
      if (!h) throw notFound('Зал')
      if (h.workplace_id !== s.workplace_id) throw badRequest('Стол из другого заведения')
      o.table_id = t.id
      o.hall_id = h.id
      o.table_number = t.number
      o.hall_name = h.name
      attachOrderToTable(o.id, t.id, itemsOfOrder(o.id).length > 0)
      recomputeTableStatusForOrder(o.id)
    }
    o.updated_at = utcTs()
  })
  return orderWithItems(o)
}

export async function payOrder(orderId, { tips = 0 } = {}) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')
  if (o.is_paid) throw conflict('Заказ уже оплачен')
  if (itemsOfOrder(o.id).length === 0) throw badRequest('Нельзя оплатить пустой заказ')

  tx(() => {
    o.tips = tips
    o.is_paid = true
    o.is_done = true
    o.closed_at = utcTs()
    o.updated_at = o.closed_at
    detachOrderFromTable(o)
    recomputeShiftAggregates(s)
  })
  return orderWithItems(o)
}

/**
 * Edit a paid order (in the *current* open shift).
 *
 * Use cases:
 *   - waiter accidentally rang in 2 cappuccinos instead of 1
 *   - tip amount needs adjustment
 *   - comment needs fixing
 *
 * Constraints:
 *   - order must be paid AND its shift must be the caller's open shift
 *   - we don't reattach to a table (it stays "closed", just edited)
 *   - aggregates are recomputed from scratch (handles diffs naturally)
 *
 * Body:
 *   - items?: full replacement list of {id, menu_item_id, title, price, quantity, comment}
 *   - tips?: number
 *   - comments?: string|null
 */
export async function editPaidOrder(orderId, patch) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')

  if (!o.is_paid) throw conflict('Заказ ещё не оплачен')
  if (s.is_closed) throw conflict('Смена закрыта — заказ нельзя редактировать')
  if (s.opened_by_user_id !== me.id) {
    throw forbidden('Только владелец смены может редактировать заказы')
  }

  tx(() => {
    if (Array.isArray(patch.items)) {
      // Full replacement: drop old order_items, insert new.
      db.order_items = db.order_items.filter((oi) => oi.order_id !== o.id)
      for (const raw of patch.items) {
        const qty = Math.max(1, Number(raw.quantity) || 1)
        const price = Number(raw.price) || 0
        db.order_items.push({
          id: raw.id || newId(),
          order_id: o.id,
          menu_item_id: raw.menu_item_id ?? null,
          title: raw.title || 'Без названия',
          price,
          quantity: qty,
          total_price: round2(price * qty),
          comment: raw.comment ?? null,
          served: false,
        })
      }
      recomputeOrderTotal(o.id)
    }
    if (patch.tips !== undefined) o.tips = Number(patch.tips) || 0
    if (patch.comments !== undefined) o.comments = patch.comments
    o.updated_at = utcTs()
    recomputeShiftAggregates(s)
  })
  return orderWithItems(o)
}


/**
 * Reopen a paid order so the waiter can continue serving the same guest
 * (e.g., they decided to add another item after paying).
 *
 * Constraints — all enforced server-side:
 *   - the order must currently be paid
 *   - it must belong to the *current open shift* of the caller
 *     (we can't reopen orders from past, closed shifts — their aggregates
 *     are frozen, and re-attaching to a different shift would shift money
 *     between waiters' reports)
 *   - the original table, if any, must be free (otherwise we'd double-book)
 *
 * On success: order returns to active state, original table is re-attached
 * (status = "occupied" or "waiting" depending on items), shift aggregates
 * are recomputed (tips & cash come back out).
 */
export async function reopenOrder(orderId) {
  await delay()
  const me = ensureMe()
  const o = find(db.orders, orderId)
  if (!o) throw notFound('Заказ')
  const s = find(db.shifts, o.shift_id)
  if (!s || !hasAccess(s.workplace_id, me.id)) throw notFound('Заказ')

  if (!o.is_paid) throw conflict('Заказ ещё не оплачен')
  if (s.is_closed) throw conflict('Смена закрыта — заказ нельзя вернуть в активные')
  if (s.opened_by_user_id !== me.id) {
    throw forbidden('Только владелец смены может возвращать заказы')
  }

  // Verify the table (if order had one) is not currently held by another order
  if (o.table_id) {
    const t = find(db.tables, o.table_id)
    if (t && t.order_id && t.order_id !== o.id) {
      throw conflict('Стол уже занят другим заказом')
    }
  }

  tx(() => {
    o.is_paid = false
    o.is_done = false
    o.closed_at = 0
    o.tips = 0
    o.updated_at = utcTs()
    if (o.table_id) {
      const items = itemsOfOrder(o.id)
      attachOrderToTable(o.id, o.table_id, items.length > 0)
      recomputeTableStatusForOrder(o.id)
    }
    recomputeShiftAggregates(s)
  })
  return orderWithItems(o)
}

// =====================
// Notes
// =====================

export async function listNotes(opts = {}) {
  await delay()
  const me = ensureMe()
  const {
    scope, workplaceId, shiftId,
    includeArchived = false, pinnedOnly = false,
    limit = 100, offset = 0,
  } = opts
  let list = db.notes.filter((n) => n.user_id === me.id)
  if (scope) list = list.filter((n) => n.scope === scope)
  if (workplaceId) list = list.filter((n) => n.workplace_id === workplaceId)
  if (shiftId) list = list.filter((n) => n.shift_id === shiftId)
  if (!includeArchived) list = list.filter((n) => !n.is_archived)
  if (pinnedOnly) list = list.filter((n) => n.pinned)
  list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updated_at - a.updated_at
  })
  return list.slice(offset, offset + limit).map(clone)
}

export async function createNote(body) {
  await delay()
  const me = ensureMe()
  if (find(db.notes, body.id)) throw conflict('Note id already exists')

  // scope consistency mirror
  const { scope, workplace_id, shift_id } = body
  if (scope === 'global' && (workplace_id || shift_id)) {
    throw badRequest('global notes must not have workplace_id/shift_id')
  }
  if (scope === 'workplace' && (!workplace_id || shift_id)) {
    throw badRequest('workplace notes require workplace_id and no shift_id')
  }
  if (scope === 'shift' && !shift_id) {
    throw badRequest('shift notes require shift_id')
  }
  if (workplace_id && !hasAccess(workplace_id, me.id)) throw badRequest('workplace not accessible')
  if (shift_id) {
    const s = find(db.shifts, shift_id)
    if (!s || !hasAccess(s.workplace_id, me.id)) throw badRequest('shift not accessible')
  }

  const now = utcTs()
  const note = {
    id: body.id,
    user_id: me.id,
    scope,
    workplace_id: workplace_id ?? null,
    shift_id: shift_id ?? null,
    header: body.header,
    content: body.content ?? null,
    pinned: body.pinned ?? false,
    is_archived: false,
    created_at: now,
    updated_at: now,
  }
  tx(() => db.notes.push(note))
  return clone(note)
}

export async function getNote(id) {
  await delay()
  const me = ensureMe()
  const n = find(db.notes, id)
  if (!n || n.user_id !== me.id) throw notFound('Заметка')
  return clone(n)
}

export async function updateNote(id, patch) {
  await delay()
  const me = ensureMe()
  const n = find(db.notes, id)
  if (!n || n.user_id !== me.id) throw notFound('Заметка')
  const allowed = ['header', 'content', 'pinned', 'is_archived']
  tx(() => {
    for (const k of allowed) if (patch[k] !== undefined) n[k] = patch[k]
    n.updated_at = utcTs()
  })
  return clone(n)
}

export async function deleteNote(id) {
  await delay()
  const me = ensureMe()
  const n = find(db.notes, id)
  if (!n || n.user_id !== me.id) throw notFound('Заметка')
  tx(() => {
    db.notes = db.notes.filter((x) => x.id !== id)
  })
}

// =====================
// Helpers
// =====================

function cryptoRandomId() {
  // Membership IDs etc. — not user-facing, just need uniqueness.
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-'
  let s = ''
  for (let i = 0; i < 21; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}