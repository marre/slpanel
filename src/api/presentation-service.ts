import { ApiError } from './errors';
import type {
  DataSourceInput,
  ManualSelection,
  PanelControl,
  PanelControlInput,
  PresentationInput,
  ScheduleRule,
  ScheduleRuleInput,
  SelectionMode,
} from './presentation-types';

const DISPLAY_ID = /^[A-Za-z0-9]{8}-[A-Za-z0-9]{12}$/;
const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const SOURCE_ID = /^[A-Za-z0-9:_-]{1,128}$/;

function bad(message: string): never {
  throw new ApiError(400, 'validation_error', message);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    bad('Expected a JSON object.');
  return value as Record<string, unknown>;
}
function required(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    bad(label + ' must be a nonempty string.');
  return value.trim();
}
function id(value: unknown, label: string): string {
  const result = required(value, label);
  if (!SOURCE_ID.test(result)) bad(label + ' is invalid.');
  return result;
}
function name(value: unknown): string {
  const result = required(value, 'name');
  if (result.length > 120) bad('Name must be at most 120 characters.');
  return result;
}
function strings(value: unknown, label: string, uppercase = false): string[] {
  if (!Array.isArray(value) || value.length > 100)
    bad(label + ' must be an array of at most 100 strings.');
  return [
    ...new Set(
      value.map((item) => {
        const normalized = required(item, label);
        if (normalized.length > 100)
          bad(label + ' entries must be at most 100 characters.');
        return uppercase ? normalized.toUpperCase() : normalized;
      }),
    ),
  ];
}
export function parseDataSource(value: unknown): DataSourceInput {
  const input = object(value);
  const siteId =
    input.site_id === null ? null : required(input.site_id, 'site_id');
  if (siteId !== null && !/^[0-9]+$/.test(siteId))
    bad('site_id must be numeric.');
  const interval =
    input.refresh_interval === undefined ? 30 : input.refresh_interval;
  if (
    typeof interval !== 'number' ||
    !Number.isInteger(interval) ||
    interval < 5 ||
    interval > 3600
  )
    bad('refresh_interval must be between 5 and 3600 seconds.');
  return {
    owner_id: required(input.owner_id, 'owner_id'),
    name: name(input.name),
    site_id: siteId,
    site_name: siteId
      ? input.site_name === null || input.site_name === undefined
        ? null
        : required(input.site_name, 'site_name')
      : null,
    refresh_interval: interval as number,
    line_numbers: strings(input.line_numbers ?? [], 'line_numbers'),
    directions: strings(input.directions ?? [], 'directions'),
    modes: strings(input.modes ?? [], 'modes', true),
  };
}
export function parsePresentation(value: unknown): PresentationInput {
  const input = object(value);
  const visualization = input.visualization ?? 'departures-list';
  if (visualization !== 'departures-list')
    bad(
      'Only departures-list is currently supported by the device. Other visualizations require a firmware update.',
    );
  return {
    owner_id: required(input.owner_id, 'owner_id'),
    name: name(input.name),
    data_source_id: id(input.data_source_id, 'data_source_id'),
    visualization,
  };
}
function optionalId(value: unknown, label: string): string | null {
  return value === null || value === undefined || value === ''
    ? null
    : id(value, label);
}
function mode(value: unknown): SelectionMode {
  if (value !== 'off' && value !== 'presentation')
    bad('mode must be off or presentation.');
  return value as SelectionMode;
}
function selected(modeValue: SelectionMode, presentationId: string | null) {
  if (modeValue === 'presentation' && !presentationId)
    bad('A presentation must be selected.');
  if (modeValue === 'off' && presentationId)
    bad('Off cannot include a presentation.');
}
function minute(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
export function parsePanelControl(value: unknown): PanelControlInput {
  const input = object(value);
  const timezone = required(input.timezone, 'timezone');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    bad('Unknown IANA timezone.');
  }
  const defaultId = optionalId(
    input.default_presentation_id,
    'default_presentation_id',
  );
  let manual: ManualSelection | null = null;
  if (input.manual !== null && input.manual !== undefined) {
    const entry = object(input.manual);
    const selection = mode(entry.mode);
    const presentationId = optionalId(entry.presentation_id, 'presentation_id');
    selected(selection, presentationId);
    let until: string | null = null;
    if (
      entry.until !== null &&
      entry.until !== undefined &&
      entry.until !== ''
    ) {
      until = required(entry.until, 'until');
      if (
        !/^\d{4}-\d{2}-\d{2}T/.test(until) ||
        !Number.isFinite(Date.parse(until)) ||
        !/(?:Z|[+-]\d{2}:\d{2})$/.test(until)
      )
        bad('until must be an ISO timestamp with timezone.');
    }
    manual = { mode: selection, presentation_id: presentationId, until };
  }
  if (!Array.isArray(input.rules) || input.rules.length > 64)
    bad('rules must be an array of at most 64 rules.');
  const rules: ScheduleRuleInput[] = input.rules.map((item) => {
    const entry = object(item);
    if (
      !Array.isArray(entry.days) ||
      entry.days.length === 0 ||
      entry.days.length > 7 ||
      entry.days.some(
        (day) =>
          !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6,
      )
    )
      bad('Each rule needs one or more weekdays (0=Mon through 6=Sun).');
    const start = required(entry.start_time, 'start_time');
    const end = required(entry.end_time, 'end_time');
    if (!TIME.test(start) || !TIME.test(end)) bad('Times must be HH:mm.');
    const selection = mode(entry.mode);
    const presentationId = optionalId(entry.presentation_id, 'presentation_id');
    selected(selection, presentationId);
    return {
      days: [...new Set(entry.days as number[])].sort(),
      start_time: start,
      end_time: end,
      mode: selection,
      presentation_id: presentationId,
    };
  });
  // Reject conflicting rules, including windows that cross Sunday midnight.
  const occupied = new Uint8Array(7 * 1440);
  rules.forEach((rule) => {
    const start = minute(rule.start_time);
    const end = minute(rule.end_time);
    const duration = (end - start + 1440) % 1440 || 1440;
    for (const day of rule.days) {
      for (let offset = 0; offset < duration; offset++) {
        const slot = (day * 1440 + start + offset) % occupied.length;
        if (occupied[slot])
          bad('Schedule rules overlap. Adjust the days or times.');
        occupied[slot] = 1;
      }
    }
  });
  return { timezone, default_presentation_id: defaultId, manual, rules };
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function localMinute(
  at: Date,
  timezone: string,
): { day: number; minute: number; year: number; month: number; date: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return {
    day: WEEKDAY.indexOf(get('weekday')),
    minute: Number(get('hour')) * 60 + Number(get('minute')),
    year: Number(get('year')),
    month: Number(get('month')),
    date: Number(get('day')),
  };
}
function matches(rule: ScheduleRule, day: number, localTime: number): boolean {
  const start = minute(rule.start_time);
  const end = minute(rule.end_time);
  if (start === end) return rule.days.includes(day);
  if (start < end)
    return rule.days.includes(day) && localTime >= start && localTime < end;
  return (
    (rule.days.includes(day) && localTime >= start) ||
    (rule.days.includes((day + 6) % 7) && localTime < end)
  );
}
export function chooseSelection(
  control: PanelControl,
  at: Date,
): {
  mode: SelectionMode | 'legacy';
  presentation_id: string | null;
  reason: 'manual' | 'schedule' | 'default' | 'legacy';
} {
  if (
    control.manual &&
    (!control.manual.until || Date.parse(control.manual.until) > at.getTime())
  )
    return { ...control.manual, reason: 'manual' };
  const local = localMinute(at, control.timezone);
  const rule = control.rules.find((entry) =>
    matches(entry, local.day, local.minute),
  );
  if (rule)
    return {
      mode: rule.mode,
      presentation_id: rule.presentation_id,
      reason: 'schedule',
    };
  if (control.default_presentation_id)
    return {
      mode: 'presentation',
      presentation_id: control.default_presentation_id,
      reason: 'default',
    };
  return { mode: 'legacy', presentation_id: null, reason: 'legacy' };
}
// Optional transition hint. The periodic configuration check remains authoritative;
// DST transitions and very short windows must never depend on this hint alone.
export function findNextTransition(
  control: PanelControl,
  now: Date,
): string | null {
  const candidates = new Set<number>();
  const local = localMinute(now, control.timezone);
  const localMidnight = Date.UTC(local.year, local.month - 1, local.date);
  for (let day = 0; day <= 8; day++) {
    for (const rule of control.rules)
      for (const hhmm of [rule.start_time, rule.end_time]) {
        const naive = localMidnight + day * 86400000 + minute(hhmm) * 60000;
        const offsets = new Set<number>();
        for (const diff of [-86400000, -43200000, 0, 43200000, 86400000]) {
          const sample = naive + diff;
          const p = localMinute(new Date(sample), control.timezone);
          const localEpoch = Date.UTC(
            p.year,
            p.month - 1,
            p.date,
            Math.floor(p.minute / 60),
            p.minute % 60,
          );
          offsets.add(localEpoch - Math.floor(sample / 60000) * 60000);
        }
        for (const offset of offsets) candidates.add(naive - offset);
      }
  }
  if (control.manual?.until) candidates.add(Date.parse(control.manual.until));
  const previousKey = (at: Date) => {
    const selection = chooseSelection(control, at);
    return (
      selection.mode + ':' + selection.presentation_id + ':' + selection.reason
    );
  };
  for (const timestamp of [...candidates]
    .filter((value) => value > now.getTime())
    .sort((a, b) => a - b)) {
    if (
      previousKey(new Date(timestamp - 1000)) !==
      previousKey(new Date(timestamp))
    )
      return new Date(timestamp).toISOString();
  }
  return null;
}
export function assertDisplayId(value: string): string {
  if (!DISPLAY_ID.test(value)) bad('Invalid display ID.');
  return value;
}
