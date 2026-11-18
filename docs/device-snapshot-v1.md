# Device protocol v1: configuration and view data

## Simple deployment

Both endpoints run inside the existing Cloudflare Worker, using D1 for device, Scene and Schedule configuration and the existing Trafiklab provider for departures. No queue, R2, central GTFS worker or external server is needed for the small fleet. Firmware continues using the same provisioned HTTPS origin and permanent device ID.

## Configuration

`GET /api/v1/devices/{deviceId}/config` returns the currently effective mode and a server-selected relative data path:

```json
{
  "version": 1,
  "mode": "departures-list",
  "refresh_after_seconds": 30,
  "data_refresh_seconds": 30,
  "data_path": "/api/v1/data/aB3xZ9kQ/source-id",
  "departures": []
}
```

`mode` is `departures-list`, `off` or `unconfigured`. An Off/unconfigured config has `data_path: null` and the device must not request departures. The Worker evaluates weekly schedules, DST and shared Scenes. The panel knows none of those concepts. Config is refreshed every 30 seconds, so schedule changes have up to one polling interval plus network latency of delay.

The v1 config retains the bounded `departures: []` envelope for reuse of the firmware's incremental view decoder; config never carries live departures. `refresh_after_seconds` is the config poll interval and `data_refresh_seconds` is the separate data poll interval, both 15–300 seconds. The client validates relative paths on the configured origin, without redirects or arbitrary cross-origin URLs.

## View data

`GET {data_path}` returns a versioned, ready-to-render view:

```json
{
  "version": 1,
  "mode": "departures-list",
  "refresh_after_seconds": 30,
  "departures": [
    {
      "line_number": "17",
      "destination": "Hagsätra",
      "display_time": "5 min",
      "minutes_until_departure": 5,
      "scheduled_at": null,
      "expected_at": null,
      "transport_mode": "METRO",
      "platform": "1",
      "state": "EXPECTED"
    }
  ]
}
```

The current Worker filters, normalizes and sorts departures before returning at most four rows, preserving the firmware's bounded 8 KiB JSON stream. A data source shared by multiple Scenes/devices yields the same `data_path` for all of them. Unmigrated legacy displays use a device-specific fallback route.

Both responses currently use `Cache-Control: no-store`; this is intentional until access controls and correct CDN cache behavior are designed. Device IDs and owner IDs are not authentication.

## Firmware transitions and future backend

Firmware reads config first, then polls view data independently. A new `data_path` or a change to Off invalidates old departures; stale in-flight replies cannot be applied to a newer request. On transient errors, firmware retries and retains bounded stale data while appropriate; Off never lights the display due to a transport failure.

In a larger deployment the same origin can route shared `data_path` objects to a CDN or static store, while device config can be published/cached separately. The firmware contract and relative paths stay stable; CDN publication, cache invalidation, access control and central GTFS aggregation can all be implemented later behind these endpoints. Because firmware does not follow redirects, routing must happen server-side at the stable origin.

Keep the old `/api/displays/:id` and `/api/departures/:siteId` endpoints available for already deployed firmware. Deploy the new Worker endpoints before flashing companion firmware. Smoke-test Scene switching, scheduled Off, network loss, JSON rejection and reconnect on hardware.
