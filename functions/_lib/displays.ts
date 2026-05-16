import type { Display, DisplayInput, DisplayUpdateInput } from '../../src/lib/types'
import { ValidationError, isValidDisplayId, isValidDisplayResourceId } from './validation'

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike
}

interface DisplayRow {
  id: string
  owner_id: string
  display_id: string
  name: string
  site_id: string | null
  site_name: string | null
  refresh_interval: number
  created_at: string
  updated_at: string
}

const DISPLAY_ID_LENGTH = 12
const ALPHANUMERIC_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function mapDisplayRow(row: DisplayRow): Display {
  return {
    id: row.id,
    owner_id: row.owner_id,
    display_id: row.display_id,
    name: row.name,
    site_id: row.site_id,
    site_name: row.site_name,
    refresh_interval: Number(row.refresh_interval),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function createFullDisplayId(ownerId: string, displayId: string): string {
  if (!isValidDisplayId(displayId)) {
    throw new ValidationError('display_id must be a 12-character alphanumeric string')
  }

  return `${ownerId}-${displayId}`
}

export function generateDisplayId(randomValue: () => number = Math.random): string {
  let result = ''

  while (result.length < DISPLAY_ID_LENGTH) {
    const index = Math.floor(randomValue() * ALPHANUMERIC_CHARS.length)
    result += ALPHANUMERIC_CHARS[index]
  }

  return result
}

export async function listDisplays(db: D1DatabaseLike, ownerId: string): Promise<Display[]> {
  const statement = db.prepare(
    `SELECT id, owner_id, display_id, name, site_id, site_name, refresh_interval, created_at, updated_at
     FROM displays
     WHERE owner_id = ?
     ORDER BY created_at ASC`,
  )

  const { results } = await statement.bind(ownerId).all<DisplayRow>()
  return results.map(mapDisplayRow)
}

export async function getDisplay(db: D1DatabaseLike, id: string): Promise<Display | null> {
  if (!isValidDisplayResourceId(id)) {
    throw new ValidationError('display id must match <owner-id>-<display-id>')
  }

  const statement = db.prepare(
    `SELECT id, owner_id, display_id, name, site_id, site_name, refresh_interval, created_at, updated_at
     FROM displays
     WHERE id = ?`,
  )

  const result = await statement.bind(id).first<DisplayRow>()
  return result ? mapDisplayRow(result) : null
}

export async function createDisplay(db: D1DatabaseLike, input: DisplayInput): Promise<Display> {
  const displayId = generateDisplayId()
  const id = createFullDisplayId(input.owner_id, displayId)

  const statement = db.prepare(
    `INSERT INTO displays (id, owner_id, display_id, name, site_id, site_name, refresh_interval)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )

  await statement
    .bind(
      id,
      input.owner_id,
      displayId,
      input.name ?? '',
      input.site_id ?? null,
      input.site_name ?? null,
      input.refresh_interval ?? 30,
    )
    .run()

  const createdDisplay = await getDisplay(db, id)

  if (!createdDisplay) {
    throw new Error('Created display could not be loaded')
  }

  return createdDisplay
}

export async function updateDisplay(
  db: D1DatabaseLike,
  id: string,
  input: DisplayUpdateInput,
): Promise<Display | null> {
  if (!isValidDisplayResourceId(id)) {
    throw new ValidationError('display id must match <owner-id>-<display-id>')
  }

  const assignments: string[] = []
  const values: unknown[] = []

  if (input.name !== undefined) {
    assignments.push('name = ?')
    values.push(input.name)
  }

  if (input.site_id !== undefined) {
    assignments.push('site_id = ?')
    values.push(input.site_id)
  }

  if (input.site_name !== undefined) {
    assignments.push('site_name = ?')
    values.push(input.site_name)
  }

  if (input.refresh_interval !== undefined) {
    assignments.push('refresh_interval = ?')
    values.push(input.refresh_interval)
  }

  if (assignments.length === 0) {
    return getDisplay(db, id)
  }

  values.push(id)

  const statement = db.prepare(
    `UPDATE displays
     SET ${assignments.join(', ')}, updated_at = datetime('now')
     WHERE id = ?`,
  )

  await statement.bind(...values).run()
  return getDisplay(db, id)
}

export async function deleteDisplay(db: D1DatabaseLike, id: string): Promise<boolean> {
  if (!isValidDisplayResourceId(id)) {
    throw new ValidationError('display id must match <owner-id>-<display-id>')
  }

  const existingDisplay = await getDisplay(db, id)

  if (!existingDisplay) {
    return false
  }

  await db.prepare('DELETE FROM displays WHERE id = ?').bind(id).run()
  return true
}
