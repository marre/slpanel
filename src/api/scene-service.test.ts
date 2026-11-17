import { describe, expect, it } from 'vitest';
import {
  nextScheduleTransition,
  parseDeviceAssignment,
  parseSchedule,
  selectScheduledScene,
} from './scene-service';
import type { ScheduleRecord } from './scene-types';

const workdays: ScheduleRecord = {
  id: 'workdays',
  owner_id: 'aB3xZ9kQ',
  name: 'Workdays',
  timezone: 'Europe/Stockholm',
  rules: [
    {
      id: 'm',
      days: [0, 1, 2, 3, 4],
      start_time: '06:00',
      end_time: '09:00',
      scene_id: 'morning',
    },
    {
      id: 'e',
      days: [0, 1, 2, 3, 4],
      start_time: '17:00',
      end_time: '22:00',
      scene_id: 'evening',
    },
  ],
};
describe('shared scene scheduling', () => {
  it('selects a scene in a window and always Off in gaps', () => {
    expect(
      selectScheduledScene(workdays, new Date('2026-11-16T06:10:00Z')),
    ).toBe('morning');
    expect(
      selectScheduledScene(workdays, new Date('2026-11-16T12:00:00Z')),
    ).toBeNull();
    expect(
      selectScheduledScene(workdays, new Date('2026-11-16T19:10:00Z')),
    ).toBe('evening');
    expect(
      selectScheduledScene(workdays, new Date('2026-11-15T08:00:00Z')),
    ).toBeNull();
  });
  it('does not allow a configurable default', () => {
    const input = {
      owner_id: 'aB3xZ9kQ',
      name: 'Workdays',
      timezone: 'Europe/Stockholm',
      rules: [
        {
          days: [0],
          start_time: '07:00',
          end_time: '08:00',
          scene_id: 'morning',
        },
      ],
    };
    expect(parseSchedule(input).rules).toHaveLength(1);
    expect(() =>
      parseSchedule({ ...input, default_scene_id: 'evening' }),
    ).toThrow(/always Off/);
    expect(() => parseSchedule({ ...input, default_action: 'scene' })).toThrow(
      /always Off/,
    );
    expect(() => parseSchedule({ ...input, rules: [] })).toThrow(
      /at least one/,
    );
    expect(() =>
      parseSchedule({ ...input, rules: [{ ...input.rules[0], mode: 'off' }] }),
    ).toThrow(/only show scenes/);
  });
  it('rejects overlapping windows, including a Sunday overnight rollover', () => {
    expect(() =>
      parseSchedule({
        owner_id: 'aB3xZ9kQ',
        name: 'Night',
        timezone: 'Europe/Stockholm',
        rules: [
          { days: [6], start_time: '23:00', end_time: '03:00', scene_id: 'a' },
          { days: [0], start_time: '02:00', end_time: '04:00', scene_id: 'b' },
        ],
      }),
    ).toThrow(/overlap/);
    expect(() =>
      parseSchedule({
        owner_id: 'aB3xZ9kQ',
        name: 'Night',
        timezone: 'Unknown/Zone',
        rules: [
          { days: [0], start_time: '06:00', end_time: '07:00', scene_id: 'a' },
        ],
      }),
    ).toThrow(/timezone/i);
  });
  it('supports overnight windows and Swedish DST gaps and repetitions', () => {
    const schedule: ScheduleRecord = {
      ...workdays,
      rules: [
        {
          id: 'night',
          days: [5],
          start_time: '22:00',
          end_time: '03:00',
          scene_id: 'night',
        },
      ],
    };
    expect(
      selectScheduledScene(schedule, new Date('2026-10-25T00:30:00Z')),
    ).toBe('night');
    expect(
      selectScheduledScene(schedule, new Date('2026-10-25T01:30:00Z')),
    ).toBe('night');
    // Sunday night is not active at Monday noon.
    expect(
      selectScheduledScene(schedule, new Date('2026-10-26T11:00:00Z')),
    ).toBeNull();
    const spring: ScheduleRecord = {
      ...workdays,
      rules: [
        {
          id: 'spring',
          days: [6],
          start_time: '02:00',
          end_time: '03:00',
          scene_id: 'gap',
        },
      ],
    };
    expect(
      selectScheduledScene(spring, new Date('2026-03-29T01:30:00Z')),
    ).toBeNull();
  });
  it('reports next scene transition as a UTC hint', () => {
    expect(
      nextScheduleTransition(workdays, new Date('2026-11-16T04:45:00Z')),
    ).toBe('2026-11-16T05:00:00.000Z');
  });
  it('rejects ambiguous scene/schedule assignment', () => {
    expect(
      parseDeviceAssignment({ kind: 'schedule', schedule_id: 'schedule-1' }),
    ).toEqual({
      kind: 'schedule',
      scene_id: null,
      schedule_id: 'schedule-1',
    });
    expect(() =>
      parseDeviceAssignment({
        kind: 'schedule',
        schedule_id: 's1',
        scene_id: 'x',
      }),
    ).toThrow(/not both/);
    expect(() => parseDeviceAssignment({ kind: 'off' })).toThrow(
      /Choose a scene or schedule/,
    );
  });
});
