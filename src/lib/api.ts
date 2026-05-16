import type {
  DepartureResponse,
  Display,
  DisplayInput,
  DisplayUpdateInput,
  StopSearchResponse,
} from './types'

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as
      | { error?: string; details?: string }
      | null

    const message = errorBody?.details ?? errorBody?.error ?? `Request failed: ${response.status}`
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function listDisplays(ownerId: string): Promise<Display[]> {
  const url = new URL('/api/displays', window.location.origin)
  url.searchParams.set('owner', ownerId)
  return requestJson<Display[]>(url)
}

export function createDisplay(payload: DisplayInput): Promise<Display> {
  return requestJson<Display>('/api/displays', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function getDisplay(id: string): Promise<Display> {
  return requestJson<Display>(`/api/displays/${id}`)
}

export function updateDisplay(id: string, payload: DisplayUpdateInput): Promise<Display> {
  return requestJson<Display>(`/api/displays/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteDisplay(id: string): Promise<void> {
  await requestJson<void>(`/api/displays/${id}`, {
    method: 'DELETE',
  })
}

export function searchStops(query: string): Promise<StopSearchResponse> {
  const url = new URL('/api/stops/search', window.location.origin)
  url.searchParams.set('q', query)
  return requestJson<StopSearchResponse>(url)
}

export function getDepartures(siteId: string): Promise<DepartureResponse> {
  return requestJson<DepartureResponse>(`/api/departures/${siteId}`)
}
