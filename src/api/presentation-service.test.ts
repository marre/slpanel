import { describe, expect, it } from 'vitest';
import {
  chooseSelection,
  findNextTransition,
  parsePanelControl,
} from './presentation-service';
import type { PanelControl } from './presentation-types';

const sample: PanelControl = {
  display_id: 'aB3xZ9kQ-fG7mNpQr2wLt',
  timezone: 'Europe/Stockholm',
  default_presentation_id: 'default',
  manual: null,
  rules: [
    {
      id: 'weekday-morning',
      days: [0, 1, 2, 3, 4],
      start_time: '06:00',
      end_time: '09:00',
      mode: 'presentation',
      presentation_id: 'morning',
    },
    {
      id: 'night',
      days: [0, 1, 2, 3, 4, 5, 6],
      start_time: '22:00',
      end_time: '06:00',
      mode: 'off',
      presentation_id: null,
    },
  ],
};
describe('presentation scheduling', () => {
  it('resolves a weekday schedule and a window crossing midnight', () => {
    expect(
      chooseSelection(sample, new Date('2026-11-16T06:10:00Z')),
    ).toMatchObject({
      presentation_id: 'morning',
      reason: 'schedule',
    });
    expect(
      chooseSelection(sample, new Date('2026-11-16T22:30:00Z')),
    ).toMatchObject({
      mode: 'off',
      reason: 'schedule',
    });
    expect(
      chooseSelection(sample, new Date('2026-11-17T04:30:00Z')),
    ).toMatchObject({
      mode: 'off',
    });
    expect(
      chooseSelection(sample, new Date('2026-11-16T11:00:00Z')),
    ).toMatchObject({
      presentation_id: 'default',
      reason: 'default',
    });
  });
  it('gives manual override precedence, then expires automatically', () => {
    const control: PanelControl = {
      ...sample,
      manual: {
        mode: 'off',
        presentation_id: null,
        until: '2026-11-16T07:30:00Z',
      },
    };
    expect(
      chooseSelection(control, new Date('2026-11-16T07:00:00Z')).reason,
    ).toBe('manual');
    expect(
      chooseSelection(control, new Date('2026-11-16T07:30:00Z')).reason,
    ).toBe('schedule');
  });
  it('handles the repeated Swedish autumn hour and spring clock jump', () => {
    const control: PanelControl = {
      ...sample,
      rules: [
        {
          id: 'sunday',
          days: [6],
          start_time: '02:00',
          end_time: '03:00',
          mode: 'off',
          presentation_id: null,
        },
      ],
    };
    expect(
      chooseSelection(control, new Date('2026-10-25T00:30:00Z')).mode,
    ).toBe('off');
    expect(
      chooseSelection(control, new Date('2026-10-25T01:30:00Z')).mode,
    ).toBe('off');
    expect(
      chooseSelection(control, new Date('2026-03-29T01:30:00Z')).mode,
    ).toBe('presentation');
  });
  it('rejects overlapping and invalid rules before writing to storage', () => {
    const raw = {
      timezone: 'Europe/Stockholm',
      default_presentation_id: 'default',
      manual: null,
      rules: [
        {
          days: [0],
          start_time: '23:00',
          end_time: '03:00',
          mode: 'off',
          presentation_id: null,
        },
        {
          days: [1],
          start_time: '02:00',
          end_time: '04:00',
          mode: 'off',
          presentation_id: null,
        },
      ],
    };
    expect(() => parsePanelControl(raw)).toThrow(/overlap/i);
    expect(() =>
      parsePanelControl({ ...raw, timezone: 'Invalid/Zone', rules: [] }),
    ).toThrow(/timezone/i);
    expect(() =>
      parsePanelControl({ ...raw, rules: [{ ...raw.rules[0], days: [] }] }),
    ).toThrow(/weekday/i);
  });
  it('computes the next weekday transition in UTC', () => {
    const next = findNextTransition(sample, new Date('2026-11-16T04:45:00Z'));
    expect(next).toBe('2026-11-16T05:00:00.000Z');
  });
  it('accepts a full-day rule and rejects manual off with an attached presentation', () => {
    const valid = parsePanelControl({
      timezone: 'Europe/Stockholm',
      default_presentation_id: null,
      manual: null,
      rules: [
        {
          days: [5],
          start_time: '00:00',
          end_time: '00:00',
          mode: 'off',
          presentation_id: null,
        },
      ],
    });
    expect(valid.rules).toHaveLength(1);
    expect(() =>
      parsePanelControl({
        ...valid,
        manual: { mode: 'off', presentation_id: 'wrong', until: null },
      }),
    ).toThrow(/off cannot/i);
  });
});
