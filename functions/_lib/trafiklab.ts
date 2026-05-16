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

function readText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`)
  }

  return value.trim()
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
