import type { DisplayInput, DisplayUpdateInput } from '../../src/lib/types'

const OWNER_ID_PATTERN = /^[A-Za-z0-9]{8}$/
const DISPLAY_ID_PATTERN = /^[A-Za-z0-9]{12}$/
const DISPLAY_RESOURCE_PATTERN = /^[A-Za-z0-9]{8}-[A-Za-z0-9]{12}$/

export class ValidationError extends Error {}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOptionalText(value: unknown, fieldName: string): string | null | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`)
  }

  return value.trim()
}

function parseRefreshInterval(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ValidationError('refresh_interval must be a positive integer')
  }

  return value
}

export function isValidOwnerId(value: string): boolean {
  return OWNER_ID_PATTERN.test(value)
}

export function isValidDisplayId(value: string): boolean {
  return DISPLAY_ID_PATTERN.test(value)
}

export function isValidDisplayResourceId(value: string): boolean {
  return DISPLAY_RESOURCE_PATTERN.test(value)
}

export function parseCreateDisplayInput(payload: unknown): DisplayInput {
  if (!isPlainObject(payload)) {
    throw new ValidationError('Display payload must be an object')
  }

  if (typeof payload.owner_id !== 'string' || !isValidOwnerId(payload.owner_id.trim())) {
    throw new ValidationError('owner_id must be an 8-character alphanumeric string')
  }

  const name = parseOptionalText(payload.name, 'name')
  const siteId = parseOptionalText(payload.site_id, 'site_id')
  const siteName = parseOptionalText(payload.site_name, 'site_name')
  const refreshInterval = parseRefreshInterval(payload.refresh_interval)

  return {
    owner_id: payload.owner_id.trim(),
    name: name ?? '',
    site_id: siteId ?? null,
    site_name: siteName ?? null,
    refresh_interval: refreshInterval ?? 30,
  }
}

export function parseUpdateDisplayInput(payload: unknown): DisplayUpdateInput {
  if (!isPlainObject(payload)) {
    throw new ValidationError('Display payload must be an object')
  }

  const result: DisplayUpdateInput = {}

  if (Object.keys(payload).length === 0) {
    return result
  }

  if ('name' in payload) {
    result.name = parseOptionalText(payload.name, 'name') ?? ''
  }

  if ('site_id' in payload) {
    result.site_id = parseOptionalText(payload.site_id, 'site_id') ?? null
  }

  if ('site_name' in payload) {
    result.site_name = parseOptionalText(payload.site_name, 'site_name') ?? null
  }

  if ('refresh_interval' in payload) {
    result.refresh_interval = parseRefreshInterval(payload.refresh_interval)
  }

  return result
}
