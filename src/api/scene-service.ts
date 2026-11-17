import { ApiError } from './errors';
import type {
  DataSourceInput, DeviceAssignmentInput, SceneInput, ScheduleInput,
  ScheduleRecord, ScheduleRuleInput,
} from './scene-types';

const RESOURCE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const OWNER = /^[A-Za-z0-9]{8}$/;
function bad(message: string): never { throw new ApiError(400, 'validation_error', message); }
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    bad('Expected a JSON object.');
  return value as Record<string, unknown>;
}
function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) bad(label + ' is required.');
  return value.trim();
}
function identifier(value: unknown, label: string): string {
  const parsed = required(value, label);
  if (!RESOURCE_ID.test(parsed)) bad(label + ' is invalid.');
  return parsed;
}
function owner(value: unknown): string {
  const parsed = required(value, 'owner_id');
  if (!OWNER.test(parsed)) bad('owner_id must be 8 alphanumeric characters.');
  return parsed;
}
function name(value: unknown): string {
  const parsed = required(value, 'name');
  if (parsed.length > 120) bad('Name must be 120 characters or fewer.');
  return parsed;
}
function strings(value: unknown, label: string, uppercase = false): string[] {
  if (!Array.isArray(value) || value.length > 100)
    bad(label + ' must be an array of at most 100 strings.');
  return [...new Set(value.map((entry) => {
    const parsed = required(entry, label);
    if (parsed.length > 100) bad(label + ' entries must be 100 characters or fewer.');
    return uppercase ? parsed.toUpperCase() : parsed;
  }))];
}
export function parseDataSource(value: unknown): DataSourceInput {
  const input = object(value);
  const siteId = input.site_id === null || input.site_id === undefined ? null : required(input.site_id, 'site_id');
  if (siteId !== null && !/^\d+$/.test(siteId)) bad('site_id must be numeric.');
  const seconds = input.refresh_interval ?? 30;
  if (typeof seconds !== 'number' || !Number.isInteger(seconds) || seconds < 5 || seconds > 3600)
    bad('refresh_interval must be between 5 and 3600 seconds.');
  return {
    owner_id: owner(input.owner_id), name: name(input.name),
    site_id: siteId,
    site_name: siteId && input.site_name != null ? required(input.site_name,'site_name') : null,
    refresh_interval: seconds,
    line_numbers: strings(input.line_numbers ?? [], 'line_numbers'),
    directions: strings(input.directions ?? [], 'directions'),
    modes: strings(input.modes ?? [], 'modes', true),
  };
}
export function parseScene(value: unknown): SceneInput {
  const input = object(value);
  if (input.visualization !== undefined && input.visualization !== 'departures-list')
    bad('This visualization is not yet supported by the firmware.');
  return {
    owner_id: owner(input.owner_id), name: name(input.name),
    data_source_id: identifier(input.data_source_id, 'data_source_id'),
    visualization: 'departures-list',
  };
}
export function parseDeviceAssignment(value: unknown): DeviceAssignmentInput {
  const input = object(value);
  if (input.kind === 'scene') {
    if (input.schedule_id != null) bad('A device can link to a scene or schedule, not both.');
    return { kind: 'scene', scene_id: identifier(input.scene_id, 'scene_id'), schedule_id: null };
  }
  if (input.kind === 'schedule') {
    if (input.scene_id != null) bad('A device can link to a scene or schedule, not both.');
    return { kind: 'schedule', scene_id: null, schedule_id: identifier(input.schedule_id, 'schedule_id') };
  }
  bad('Choose a scene or schedule for this device.');
}
function minute(time: string): number {
  return Number(time.slice(0,2)) * 60 + Number(time.slice(3));
}
export function parseSchedule(value: unknown): ScheduleInput {
  const input = object(value);
  if ('default_scene_id' in input || 'default_action' in input || 'default' in input)
    bad('The schedule default is always Off and cannot be configured.');
  const timezone = required(input.timezone,'timezone');
  if (timezone.length > 80) bad('Timezone is too long.');
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); }
  catch { bad('Unknown IANA timezone.'); }
  if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > 64)
    bad('Add at least one scene time window (maximum 64). Outside all windows the device is Off.');
  const rules: ScheduleRuleInput[] = input.rules.map((item) => {
    const entry = object(item);
    if ('mode' in entry && entry.mode !== 'scene') bad('Schedule rules can only show scenes; Off is the implicit default.');
    if (!Array.isArray(entry.days) || entry.days.length < 1 || entry.days.length > 7 ||
        entry.days.some((day) => !Number.isInteger(day) || day < 0 || day > 6))
      bad('Every time window must have one or more weekdays.');
    const start = required(entry.start_time, 'start_time');
    const end = required(entry.end_time, 'end_time');
    if (!TIME.test(start) || !TIME.test(end)) bad('Times must use HH:mm.');
    return {
      days: [...new Set(entry.days as number[])].sort(),
      start_time: start, end_time: end,
      scene_id: identifier(entry.scene_id,'scene_id'),
    };
  });
  // Occupancy of all seven days rejects overlaps, including overnight windows and Sunday rollover.
  const occupied = new Uint8Array(7 * 1440);
  for (const rule of rules) {
    const start = minute(rule.start_time);
    const end = minute(rule.end_time);
    const duration = (end - start + 1440) % 1440 || 1440;
    for (const day of rule.days)
      for (let offset = 0; offset < duration; offset++) {
        const slot = (day * 1440 + start + offset) % occupied.length;
        if (occupied[slot]) bad('Schedule windows overlap. Each time must select at most one scene.');
        occupied[slot] = 1;
      }
  }
  return { owner_id: owner(input.owner_id), name: name(input.name), timezone, rules };
}
const WEEKDAY = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const formatterCache = new Map<string,Intl.DateTimeFormat>();
function localTime(at: Date, timezone: string) {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    });
    if (formatterCache.size >= 24) formatterCache.clear();
    formatterCache.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    day: WEEKDAY.indexOf(get('weekday')),
    minute: Number(get('hour')) * 60 + Number(get('minute')),
    year: Number(get('year')),
    month: Number(get('month')),
    date: Number(get('day')),
  };
}
export function selectScheduledScene(schedule: ScheduleRecord, at: Date): string | null {
  const local = localTime(at,schedule.timezone);
  for (const rule of schedule.rules) {
    const start = minute(rule.start_time), end = minute(rule.end_time);
    const matches = start === end
      ? rule.days.includes(local.day)
      : start < end
        ? rule.days.includes(local.day) && local.minute >= start && local.minute < end
        : (rule.days.includes(local.day) && local.minute >= start) ||
          (rule.days.includes((local.day+6)%7) && local.minute < end);
    if (matches) return rule.scene_id;
  }
  // There is deliberately no editable default board/scene: gaps always mean Off.
  return null;
}
export function nextScheduleTransition(schedule: ScheduleRecord, now: Date): string | null {
  const local = localTime(now,schedule.timezone);
  const localMidnight = Date.UTC(local.year,local.month-1,local.date);
  const candidates = new Set<number>();
  for (let day = 0; day <= 8; day++) for (const rule of schedule.rules) {
    for (const hhmm of [rule.start_time,rule.end_time]) {
      const naive = localMidnight + day*86400000 + minute(hhmm)*60000;
      const offsets = new Set<number>();
      // Sample both sides of possible DST changes to disambiguate repeated local times.
      for (const diff of [-86400000,-43200000,0,43200000,86400000]) {
        const sample = naive+diff;
        const parts = localTime(new Date(sample),schedule.timezone);
        const localEpoch = Date.UTC(parts.year,parts.month-1,parts.date,
          Math.floor(parts.minute/60),parts.minute%60);
        offsets.add(localEpoch-Math.floor(sample/60000)*60000);
      }
      for (const offset of offsets) candidates.add(naive-offset);
    }
  }
  for (const timestamp of [...candidates].filter((value)=>value>now.getTime()).sort((a,b)=>a-b)) {
    const prev=selectScheduledScene(schedule,new Date(timestamp-1000));
    const next=selectScheduledScene(schedule,new Date(timestamp));
    if (prev!==next) return new Date(timestamp).toISOString();
  }
  return null;
}
