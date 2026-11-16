import type {
  DataSourceInput,
  DataSourceRecord,
  EffectivePresentation,
  PanelControl,
  PanelControlInput,
  PresentationInput,
  PresentationRecord,
} from '@/api/presentation-types';
import type { DisplayRecord } from '@/api/types';
import { ConfigApiError } from '@/lib/config-api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as {
    error?: { code?: string; message?: string };
    [key: string]: unknown;
  };
  if (!response.ok)
    throw new ConfigApiError(
      payload.error?.message ?? 'Unable to save changes.',
      {
        status: response.status,
        code: payload.error?.code,
      },
    );
  return payload as T;
}
const ownerPath = (owner: string) => '?owner=' + encodeURIComponent(owner);
const body = (data: unknown) => JSON.stringify(data);
export const listSources = async (owner: string): Promise<DataSourceRecord[]> =>
  (
    await request<{ data_sources: DataSourceRecord[] }>(
      '/api/data-sources' + ownerPath(owner),
    )
  ).data_sources;
export const saveSource = async (
  source: DataSourceInput,
  id?: string,
): Promise<DataSourceRecord> =>
  (
    await request<{ data_source: DataSourceRecord }>(
      id ? '/api/data-sources/' + encodeURIComponent(id) : '/api/data-sources',
      {
        method: id ? 'PUT' : 'POST',
        body: body(source),
      },
    )
  ).data_source;
export const removeSource = async (owner: string, id: string): Promise<void> =>
  request<void>(
    '/api/data-sources/' + encodeURIComponent(id) + ownerPath(owner),
    { method: 'DELETE' },
  );

export const listPresentations = async (
  owner: string,
): Promise<PresentationRecord[]> =>
  (
    await request<{ presentations: PresentationRecord[] }>(
      '/api/presentations' + ownerPath(owner),
    )
  ).presentations;
export const savePresentation = async (
  presentation: PresentationInput,
  id?: string,
): Promise<PresentationRecord> =>
  (
    await request<{ presentation: PresentationRecord }>(
      id
        ? '/api/presentations/' + encodeURIComponent(id)
        : '/api/presentations',
      { method: id ? 'PUT' : 'POST', body: body(presentation) },
    )
  ).presentation;
export const removePresentation = async (
  owner: string,
  id: string,
): Promise<void> =>
  request<void>(
    '/api/presentations/' + encodeURIComponent(id) + ownerPath(owner),
    { method: 'DELETE' },
  );

export interface PanelControlResponse {
  display: DisplayRecord;
  control: PanelControl;
  effective: EffectivePresentation;
}
export const getPanelControl = (id: string): Promise<PanelControlResponse> =>
  request<PanelControlResponse>(
    '/api/displays/' + encodeURIComponent(id) + '/control',
  );
export const savePanelControl = (
  id: string,
  data: PanelControlInput,
): Promise<PanelControlResponse> =>
  request<PanelControlResponse>(
    '/api/displays/' + encodeURIComponent(id) + '/control',
    {
      method: 'PUT',
      body: body(data),
    },
  );
