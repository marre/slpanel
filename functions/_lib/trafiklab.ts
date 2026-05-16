import type { Departure, DepartureResponse, StopSearchResponse, StopSearchResult } from '../../src/lib/types'

const TRANSPORT_API_BASE_URL = 'https://transport.integration.sl.se/v1'

export class UpstreamError extends Error {
  readonly status: number
  readonly statusText: string

  constructor(message: string, status: number, statusText: string) {
    super(message)
    this.status = status
    this.statusText = statusText
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }

  return value.trim()
}

function readOptionalText(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim()
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return null
}

function toDisplayTime(isoTimestamp: string | null, now: Date): { minutes: number | null; label: string } {
  if (!isoTimestamp) {
    return { minutes: null, label: '—' }
  }

  const departureTime = new Date(isoTimestamp)

  if (Number.isNaN(departureTime.getTime())) {
    return { minutes: null, label: isoTimestamp }
  }

  const diffMinutes = Math.max(0, Math.ceil((departureTime.getTime() - now.getTime()) / 60000))

  if (diffMinutes === 0) {
    return { minutes: 0, label: 'Now' }
  }

  return { minutes: diffMinutes, label: `${diffMinutes} min` }
}

export function buildStopSearchUrl(query: string): URL {
  const url = new URL(`${TRANSPORT_API_BASE_URL}/sites`)
  url.searchParams.set('expand', 'true')
  url.searchParams.set('q', readText(query, 'q'))
  return url
}

export function buildDeparturesUrl(siteId: string): URL {
  const trimmedSiteId = readText(siteId, 'siteId')
  return new URL(`${TRANSPORT_API_BASE_URL}/sites/${encodeURIComponent(trimmedSiteId)}/departures`)
}

export async function fetchTransportApi<T>(
  url: URL,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: {
      accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new UpstreamError(
      `Transport API request failed with status ${response.status}`,
      response.status,
      response.statusText,
    )
  }

  return (await response.json()) as T
}

export function normalizeStopSearchResponse(query: string, payload: unknown): StopSearchResponse {
  const root = asRecord(payload)
  const rawResults = root ? asArray(root.results) : asArray(payload)

  const results = rawResults
    .map((item): StopSearchResult | null => {
      const record = asRecord(item)

      if (!record) {
        return null
      }

      const siteId = readOptionalText(record.id) ?? readOptionalText(record.siteId)
      const name = readOptionalText(record.name) ?? readOptionalText(record.sname)

      if (!siteId || !name) {
        return null
      }

      const stopArea = asRecord(record.stop_area)

      return {
        site_id: siteId,
        name,
        type: readOptionalText(record.type),
        stop_area_name: stopArea ? readOptionalText(stopArea.name) : null,
      }
    })
    .filter((item): item is StopSearchResult => item !== null)

  return {
    query: query.trim(),
    results,
  }
}

export function normalizeDeparturesResponse(
  siteId: string,
  payload: unknown,
  now: Date = new Date(),
): DepartureResponse {
  const root = asRecord(payload)
  const rawResults = root ? asArray(root.departures) : asArray(payload)

  const departures = rawResults
    .map((item): Departure | null => {
      const record = asRecord(item)

      if (!record) {
        return null
      }

      const line = asRecord(record.line)
      const stopPoint = asRecord(record.stop_point)
      const scheduledAt = readOptionalText(record.scheduled)
      const expectedAt = readOptionalText(record.expected)
      const primaryTime = expectedAt ?? scheduledAt
      const time = toDisplayTime(primaryTime, now)
      const lineNumber =
        (line ? readOptionalText(line.designation) : null) ??
        (line ? readOptionalText(line.name) : null) ??
        readOptionalText(record.display) ??
        '—'
      const destination = readOptionalText(record.destination) ?? readOptionalText(record.direction) ?? 'Unknown'

      return {
        line_number: lineNumber,
        destination,
        display_time: time.label,
        minutes_until_departure: time.minutes,
        scheduled_at: scheduledAt,
        expected_at: expectedAt,
        transport_mode:
          (line ? readOptionalText(line.transport_mode) : null) ?? readOptionalText(record.transport_mode),
        platform:
          (stopPoint ? readOptionalText(stopPoint.designation) : null) ?? readOptionalText(record.platform),
        state: readOptionalText(record.state),
      }
    })
    .filter((item): item is Departure => item !== null)
    .sort((left, right) => {
      const leftTime = Date.parse(left.expected_at ?? left.scheduled_at ?? '')
      const rightTime = Date.parse(right.expected_at ?? right.scheduled_at ?? '')

      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
        return 0
      }

      return leftTime - rightTime
    })

  return {
    site_id: siteId,
    departures,
  }
}
