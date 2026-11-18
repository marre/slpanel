# Device snapshot API v1

## Deployment choice

For the current handful of physical panels, the existing Cloudflare Worker reads
D1 configuration, resolves the active scene or schedule, calls the existing
Trafiklab departures provider, and returns a **single bounded snapshot**.
There is no new VM, R2 write path, queue, scheduled ingestion or cache migration.

The immutable device identifier and HTTPS service origin remain provisioned over
USB. Old `/api/displays/:id` and `/api/departures/:siteId` APIs remain available
for installed firmware and the browser preview.

## Contract

`GET /api/v1/devices/{deviceId}/snapshot` (no authentication in v1; see security).

A successful response looks like:

```json
{
  "version": 1,
  "device_id": "aB3xZ9kQ-fG7mNpQr2wLt",
  "mode": "departures-list",
  "generated_at": "2026-11-18T08:00:00.000Z",
  "next_transition_at": "2026-11-18T09:00:00.000Z",
  "display": {
    "id": "aB3xZ9kQ-fG7mNpQr2wLt",
    "name": "Hallway",
    "site_id": "9192",
    "refresh_interval": 30
  },
  "departures": [
    {
      "line_number": "17",
      "destination": "Hagsätra",
      "display_time": "5 min",
      "minutes_until_departure": 5,
      "scheduled_at": "2026-11-18T08:05:00+01:00",
      "expected_at": "2026-11-18T08:05:00+01:00",
      "transport_mode": "METRO",
      "platform": "1",
      "state": "EXPECTED"
    }
  ]
}
```

`mode` is `departures-list`, `off`, or `unconfigured`. Off is produced only
when a schedule has no active rule; unconfigured means there is no selected
stop and is not equivalent to blanking a scheduled display. For Off and
unconfigured, departures are empty and `display.site_id` is null. The response
returns at most four rows, matching the current 128x32 rendering capacity.

`refresh_interval` is clamped to 15–300 seconds. Firmware should honor it,
use local monotonic deadlines/retries, and never write configuration to flash
on polling. `generated_at` and `next_transition_at` are advisory metadata,
not instructions to evaluate schedules locally. On errors, firmware must
retain its previously rendered content only within the existing stale-data
limit; never reinterpret a transport failure as Off.

The endpoint emits `Cache-Control: no-store` for now. Snapshot generation and
per-device lookups are fine for a few panels, not thousands. Never cache a
personalized device-id URL as a public shared scene without redesigning the key.

## Scale migration without device API churn

1. Centralize Trafiklab polling and GTFS timetable processing on a small
   Go/Rust service. It outputs the **same v1 snapshot shape**.
2. Group common scenes and schedules, construct identical shared snapshots,
   and distribute those via versioned immutable CDN URLs. Mapping device ID to
   active shared snapshot must not produce one uncached Worker call per refresh.
3. Route the stable `/api/v1/devices/{id}/snapshot` host/path through an
   appropriate edge/static publication mechanism. The firmware keeps the same
   v1 schema and HTTPS origin; introduce redirects only if the embedded HTTPS
   stack supports them (it currently does not).
4. Instrument Worker request and D1 rows-read counts, upstream API calls,
   snapshot size, R2 operations (if used), and CDN cache hit rate before
   targeting thousands of devices.

## Security and rollout

Owner IDs and device IDs are not authentication. Before exposing write APIs or
private device data broadly, add authentication and authorization and consider
how shared cache keys avoid cross-owner leakage. A predictable ID must not grant
administrative access.

Deploy the backend endpoint before flashing firmware built to use v1 snapshots.
Keep the old routes during migration; run host tests and physical smoke tests
including scene changes, scheduled Off, Wi-Fi loss and corrupted responses.
