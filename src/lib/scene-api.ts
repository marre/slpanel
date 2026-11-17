import type {
  DataSourceInput, DataSourceRecord, DeviceAssignment, DeviceAssignmentInput,
  EffectiveScene, SceneInput, SceneRecord, ScheduleInput, ScheduleRecord,
} from '@/api/scene-types';
import type { DisplayRecord } from '@/api/types';
import { ConfigApiError } from './config-api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json() as { error?: { code?: string; message?: string } };
  if (!response.ok)
    throw new ConfigApiError(payload.error?.message ?? 'Request failed.', { status: response.status, code: payload.error?.code });
  return payload as T;
}
const query = (owner: string) => '?owner=' + encodeURIComponent(owner);
const write = (body: unknown, update = false): RequestInit => ({
  method: update ? 'PUT' : 'POST', body: JSON.stringify(body),
});

export const listSources = async (owner: string) =>
  (await request<{data_sources:DataSourceRecord[]}>('/api/data-sources'+query(owner))).data_sources;
export const saveSource = async (input: DataSourceInput, id?: string) =>
  (await request<{data_source:DataSourceRecord}>(id ? '/api/data-sources/'+encodeURIComponent(id) : '/api/data-sources',write(input,Boolean(id)))).data_source;

export const listScenes = async (owner: string) =>
  (await request<{scenes:SceneRecord[]}>('/api/scenes'+query(owner))).scenes;
export const saveScene = async (input: SceneInput, id?: string) =>
  (await request<{scene:SceneRecord}>(id ? '/api/scenes/'+encodeURIComponent(id) : '/api/scenes',write(input,Boolean(id)))).scene;
export const removeScene = async (owner: string, id: string) =>
  request<void>('/api/scenes/'+encodeURIComponent(id)+query(owner),{method:'DELETE'});

export const listSchedules = async (owner: string) =>
  (await request<{schedules:ScheduleRecord[]}>('/api/schedules'+query(owner))).schedules;
export const saveSchedule = async (input: ScheduleInput, id?: string) =>
  (await request<{schedule:ScheduleRecord}>(id ? '/api/schedules/'+encodeURIComponent(id) : '/api/schedules',write(input,Boolean(id)))).schedule;
export const removeSchedule = async (owner: string,id: string) =>
  request<void>('/api/schedules/'+encodeURIComponent(id)+query(owner),{method:'DELETE'});

export interface DeviceConfiguration {
  display: DisplayRecord;
  assignment: DeviceAssignment | null;
  effective: EffectiveScene;
}
export const getDeviceConfiguration = (id: string) =>
  request<DeviceConfiguration>('/api/displays/'+encodeURIComponent(id)+'/assignment');
export const saveDeviceAssignment = (id: string, input: DeviceAssignmentInput) =>
  request<DeviceConfiguration>('/api/displays/'+encodeURIComponent(id)+'/assignment',write(input,true));
