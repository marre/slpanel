# Device snapshot API v1

## Current deployment

The existing Cloudflare Worker generates snapshots on demand. It resolves the assigned Scene or Schedule from D1 and uses the current Trafiklab provider to fetch normalized departures. For our small fleet this does not require a separate server, R2, a queue, scheduled ingestion or a CDN publication pipeline.

The device's existing HTTPS origin and stable ID remain provisioned over USB. Previously deployed firmware can continue using `/api/displays/:id` and `/api/departures/:siteId`.

## Device contract

New firmware requests `GET /api/v1/devices/{deviceId}/snapshot`.

The response is a versioned view: `version` is `1`, `mode` is `departures-list`, `off` or `unconfigured`, and `refresh_after_seconds` is within 15–300. The optional `generated_at` and `next_transition_at` fields are informational. `departures` contains at most four ready-to-render normalized records with the same fields as the legacy departure provider.

A minimal scheduled-Off response is:

```json
{
  "version": 1,
  "mode": "off",
  "refresh_after_seconds": 30,
  "generated_at": "2026-11-18T08:00:00.000Z",
  "next_transition_at": null,
  "departures": []
}
```

Off is selected only when the schedule has no active window. Unconfigured means there is no stop to show; it is not an instruction to blank a scheduled device. The panel never evaluates schedules or GTFS feeds locally. Network errors must not be interpreted as Off. Firmware retains usable live data only within its established stale-data limit and performs all retries using a monotonic clock.

The body deliberately excludes device ID, owner ID, stop ID, filters and schedule details. Two devices using the same scene can therefore consume the same future precomputed snapshot without changing the firmware schema.

For now the Worker sets `Cache-Control: no-store`. The request path is still per-device; do not assume that identical snapshot bodies make these URLs safe or efficient to share through a CDN today.

## Future scaling

A small Go or Rust service may later ingest the shared SL real-time feed, calculate departures for commonly used Scenes and publish versioned shared snapshots. The server and routing layer must map each device to an active shared snapshot without doing an uncached Worker request for every device refresh. The firmware HTTPS implementation currently does not follow redirects, so the migration must preserve the response endpoint or explicitly add supported redirection before relying on it.

Measure the Worker requests, D1 reads, upstream API requests, cache hit rate and snapshot sizes before scaling beyond the current small fleet. A future producer must preserve the v1 response schema.

## Security and rollout

The eight-character owner ID and public device ID are not authentication. Introduce authorization before exposing multi-tenant administrative writes or private device data. Shared cache mappings must not leak data between owners.

Deploy the new Worker endpoint before flashing new firmware from the companion SLPanel Rust PR. Keep the existing endpoints available to previously flashed devices. Verify Scene changes, scheduled Off, network loss, invalid JSON and reconnection on real hardware before rollout.
