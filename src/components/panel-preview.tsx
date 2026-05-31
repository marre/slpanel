import type { DepartureRecord } from '@/api/types';
import { DisplayBoard } from '@/components/display-board';

const previewDepartures: DepartureRecord[] = [
  {
    line_number: '17',
    destination: 'Hagsatra',
    display_time: '1 min',
    minutes_until_departure: 1,
    scheduled_at: '2026-05-29T12:01:00Z',
    expected_at: '2026-05-29T12:01:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
  {
    line_number: '18',
    destination: 'Farsta strand',
    display_time: '4 min',
    minutes_until_departure: 4,
    scheduled_at: '2026-05-29T12:04:00Z',
    expected_at: '2026-05-29T12:04:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
  {
    line_number: '17',
    destination: 'Skarpnack',
    display_time: '7 min',
    minutes_until_departure: 7,
    scheduled_at: '2026-05-29T12:07:00Z',
    expected_at: '2026-05-29T12:07:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
  {
    line_number: '18',
    destination: 'Farsta strand',
    display_time: '11 min',
    minutes_until_departure: 11,
    scheduled_at: '2026-05-29T12:11:00Z',
    expected_at: '2026-05-29T12:11:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  },
];

export function PanelPreview() {
  return (
    <DisplayBoard
      displayName="Landing page preview"
      siteName="Slussen"
      departures={previewDepartures}
      tone="live"
      headline="Live departures"
      detail="The same bitmap board component powers the public display route."
    />
  );
}
