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

export interface Owner {
  id: string
  created_at: string
}

export interface StopSearchResult {
  site_id: string
  name: string
  type: string | null
  stop_area_name: string | null
}

export interface StopSearchResponse {
  query: string
  results: StopSearchResult[]
}

export interface Departure {
  line_number: string
  destination: string
  display_time: string
  minutes_until_departure: number | null
  scheduled_at: string | null
  expected_at: string | null
  transport_mode: string | null
  platform: string | null
  state: string | null
}

export interface DepartureResponse {
  site_id: string
  departures: Departure[]
}
