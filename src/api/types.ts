export interface DisplayRecord {
  id: string;
  owner_id: string;
  display_id: string;
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
  line_numbers: string[];
  directions: string[];
  modes: string[];
}

export interface CreateDisplayInput {
  owner_id: string;
  name: string;
  site_id: string | null;
  site_name: string | null;
  refresh_interval: number;
  line_numbers: string[];
  directions: string[];
  modes: string[];
}

export interface UpdateDisplayInput {
  name?: string;
  site_id?: string | null;
  site_name?: string | null;
  refresh_interval?: number;
  line_numbers?: string[];
  directions?: string[];
  modes?: string[];
}

export interface StopSearchResult {
  site_id: string;
  name: string;
  type: string;
  stop_area_name: string;
}

export interface DepartureRecord {
  line_number: string;
  destination: string;
  display_time: string;
  minutes_until_departure: number;
  scheduled_at: string | null;
  expected_at: string | null;
  transport_mode: string;
  platform: string;
  state: 'EXPECTED' | 'CANCELLED';
}

export interface DeparturesQuery {
  site_id: string;
  lines: string[];
  directions: string[];
  modes: string[];
  forecast: number;
}
