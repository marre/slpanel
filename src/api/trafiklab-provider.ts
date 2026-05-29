import { ApiError } from './errors';
import type { TransitProvider } from './transit-provider';
import type { DeparturesQuery, DepartureRecord } from './types';

const DEFAULT_BASE_URL = 'https://transport.integration.sl.se/v1';

type RawSite = {
  id: number;
  name: string;
  note?: string;
  type?: string;
};

type RawDeparture = {
  destination?: string;
  direction?: string;
  direction_code?: number;
  state?: string;
  display?: string;
  scheduled?: string;
  expected?: string;
  stop_point?: {
    designation?: string;
  };
  line?: {
    designation?: string;
    transport_mode?: string;
  };
  deviations?: Array<{
    consequence?: string;
  }>;
};

type RawDeparturesResponse = {
  departures?: RawDeparture[];
};

interface TrafiklabOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
}

export function createTrafiklabProvider(
  options: TrafiklabOptions = {},
): TransitProvider {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

  return {
    async searchStops(query) {
      const url = new URL(`${baseUrl}/sites`);
      url.searchParams.set('q', query);

      const sites = await fetchJson<RawSite[]>(fetchImpl, url);

      return rankSites(sites, query)
        .slice(0, 25)
        .map((site) => ({
          site_id: String(site.id),
          name: site.name,
          type: site.type ?? 'STOP',
          stop_area_name: site.note ?? site.name,
        }));
    },

    async getDepartures(query) {
      const url = new URL(`${baseUrl}/sites/${query.site_id}/departures`);
      url.searchParams.set('forecast', String(query.forecast));

      const response = await fetchJson<RawDeparturesResponse>(fetchImpl, url);

      return (response.departures ?? [])
        .filter((departure) => matchesDepartureFilters(departure, query))
        .map((departure) => normalizeDeparture(departure))
        .sort(
          (left, right) =>
            left.minutes_until_departure - right.minutes_until_departure ||
            left.line_number.localeCompare(right.line_number),
        );
    },
  };
}

async function fetchJson<T>(fetchImpl: typeof fetch, url: URL): Promise<T> {
  const response = await fetchImpl(url.toString(), {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new ApiError(
      502,
      'provider_error',
      `Transit provider request failed with status ${response.status}.`,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(
      502,
      'provider_error',
      'Transit provider returned invalid JSON.',
    );
  }
}

function rankSites(sites: RawSite[], query: string): RawSite[] {
  const searchKey = normalize(query);

  return [...sites]
    .map((site) => ({
      site,
      score: scoreSite(site, searchKey),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.site.name.localeCompare(right.site.name, 'sv'),
    )
    .map((entry) => entry.site);
}

function scoreSite(site: RawSite, query: string): number {
  const name = normalize(site.name);
  const note = normalize(site.note ?? '');

  if (name === query) {
    return 500;
  }

  if (name.startsWith(query)) {
    return 400;
  }

  if (note.startsWith(query)) {
    return 250;
  }

  if (name.includes(query)) {
    return 200;
  }

  if (note.includes(query)) {
    return 100;
  }

  return 0;
}

function matchesDepartureFilters(
  departure: RawDeparture,
  query: DeparturesQuery,
): boolean {
  if (
    query.lines.length > 0 &&
    !query.lines.includes(departure.line?.designation ?? '')
  ) {
    return false;
  }

  if (
    query.modes.length > 0 &&
    !query.modes.includes((departure.line?.transport_mode ?? '').toUpperCase())
  ) {
    return false;
  }

  if (query.directions.length === 0) {
    return true;
  }

  const expectedDirections = query.directions.map(normalize);
  const directionName = normalize(departure.direction ?? '');
  const directionCode = String(departure.direction_code ?? '');

  return (
    expectedDirections.includes(directionName) ||
    expectedDirections.includes(directionCode)
  );
}

function normalizeDeparture(departure: RawDeparture): DepartureRecord {
  const minutesUntilDeparture = readMinutesUntilDeparture(departure);

  return {
    line_number: departure.line?.designation ?? '',
    destination: departure.destination ?? '',
    display_time:
      minutesUntilDeparture === 0 ? 'Now' : `${minutesUntilDeparture} min`,
    minutes_until_departure: minutesUntilDeparture,
    scheduled_at: departure.scheduled ?? null,
    expected_at: departure.expected ?? departure.scheduled ?? null,
    transport_mode: departure.line?.transport_mode ?? 'UNKNOWN',
    platform: departure.stop_point?.designation ?? '',
    state: deriveState(departure),
  };
}

function readMinutesUntilDeparture(departure: RawDeparture): number {
  const display = (departure.display ?? '').trim().toLowerCase();

  if (display === 'nu' || display === 'now') {
    return 0;
  }

  const minuteMatch = display.match(/^(\d+)\s*min/);

  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  const timestamp = departure.expected ?? departure.scheduled;

  if (!timestamp) {
    return 0;
  }

  const parsed = Date.parse(timestamp);

  if (Number.isNaN(parsed)) {
    return 0;
  }

  return Math.max(0, Math.ceil((parsed - Date.now()) / 60_000));
}

function deriveState(departure: RawDeparture): 'EXPECTED' | 'CANCELLED' {
  if (departure.state === 'CANCELLED') {
    return 'CANCELLED';
  }

  if (
    departure.deviations?.some(
      (deviation) => deviation.consequence === 'CANCELLED',
    )
  ) {
    return 'CANCELLED';
  }

  return 'EXPECTED';
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}
