import type {
  CreateDisplayInput,
  DepartureRecord,
  DisplayRecord,
  StopSearchResult,
  UpdateDisplayInput,
} from '@/api/types';

type ErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ConfigApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(
    message: string,
    options: { status: number; code?: string; details?: unknown },
  ) {
    super(message);
    this.name = 'ConfigApiError';
    this.status = options.status;
    this.code = options.code ?? 'request_failed';
    this.details = options.details ?? null;
  }
}

export async function listDisplays(
  ownerId: string,
  signal?: AbortSignal,
): Promise<DisplayRecord[]> {
  const response = await requestJson<{ displays: DisplayRecord[] }>(
    `/api/displays?owner=${encodeURIComponent(ownerId)}`,
    {
      signal,
    },
  );

  return response.displays;
}

export async function createDisplay(
  input: CreateDisplayInput,
  signal?: AbortSignal,
): Promise<DisplayRecord> {
  const response = await requestJson<{ display: DisplayRecord }>(
    '/api/displays',
    {
      method: 'POST',
      signal,
      body: JSON.stringify(input),
    },
  );

  return response.display;
}

export async function getDisplay(
  displayId: string,
  signal?: AbortSignal,
): Promise<DisplayRecord> {
  const response = await requestJson<{ display: DisplayRecord }>(
    `/api/displays/${encodeURIComponent(displayId)}`,
    {
      signal,
    },
  );

  return response.display;
}

export async function updateDisplay(
  displayId: string,
  input: UpdateDisplayInput,
  signal?: AbortSignal,
): Promise<DisplayRecord> {
  const response = await requestJson<{ display: DisplayRecord }>(
    `/api/displays/${encodeURIComponent(displayId)}`,
    {
      method: 'PUT',
      signal,
      body: JSON.stringify(input),
    },
  );

  return response.display;
}

export async function deleteDisplay(
  displayId: string,
  signal?: AbortSignal,
): Promise<void> {
  await requestJson(`/api/displays/${encodeURIComponent(displayId)}`, {
    method: 'DELETE',
    signal,
  });
}

export async function searchStops(
  query: string,
  signal?: AbortSignal,
): Promise<StopSearchResult[]> {
  const response = await requestJson<{ results: StopSearchResult[] }>(
    `/api/stops/search?q=${encodeURIComponent(query)}`,
    {
      signal,
    },
  );

  return response.results;
}

export async function listDepartures(
  siteId: string,
  options: {
    forecast?: number;
    lines?: string[];
    directions?: string[];
    modes?: string[];
    signal?: AbortSignal;
  } = {},
): Promise<DepartureRecord[]> {
  const searchParams = new URLSearchParams();

  for (const lineNumber of options.lines ?? []) {
    searchParams.append('line', lineNumber);
  }

  for (const direction of options.directions ?? []) {
    searchParams.append('direction', direction);
  }

  for (const mode of options.modes ?? []) {
    searchParams.append('mode', mode);
  }

  if (options.forecast) {
    searchParams.set('forecast', String(options.forecast));
  }

  const suffix = searchParams.size > 0 ? `?${searchParams.toString()}` : '';
  const response = await requestJson<{ departures: DepartureRecord[] }>(
    `/api/departures/${encodeURIComponent(siteId)}${suffix}`,
    {
      signal: options.signal,
    },
  );

  return response.departures;
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new ConfigApiError('Request failed.', {
        status: response.status,
      });
    }

    throw new ConfigApiError('Response was not valid JSON.', {
      status: response.status,
      code: 'invalid_response',
    });
  }

  if (!response.ok) {
    const errorPayload = payload as ErrorPayload;

    throw new ConfigApiError(errorPayload.error?.message ?? 'Request failed.', {
      status: response.status,
      code: errorPayload.error?.code,
      details: errorPayload.error?.details,
    });
  }

  return payload as T;
}
