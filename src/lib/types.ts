export interface Display {
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

export interface DisplayInput {
  owner_id: string
  name?: string
  site_id?: string | null
  site_name?: string | null
  refresh_interval?: number
}

export interface DisplayUpdateInput {
  name?: string
  site_id?: string | null
  site_name?: string | null
  refresh_interval?: number
}

export interface StopSearchResult {
  id?: string
  siteId?: string
  name?: string
  [key: string]: unknown
}

export interface StopSearchResponse {
  results?: StopSearchResult[]
  [key: string]: unknown
}

export interface DepartureResponse {
  departures?: Array<Record<string, unknown>>
  [key: string]: unknown
}
