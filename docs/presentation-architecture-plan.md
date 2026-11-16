# Panel presentations: target architecture and implementation plan

> Planning document only. This PR documents the agreed end state; it does not implement it.
> Companion repository: [slpanel](https://github.com/marre/slpanel) / [slpanel-rust](https://github.com/marre/slpanel-rust).

## Product requirements and decisions

- A physical panel has a stable identity and can change the stop it shows remotely, without USB reprovisioning.
- A **data source** defines what information is fetched (initially SL departures: site ID, line/direction/mode filters, refresh interval).
- A **visualization** defines how a normalized data snapshot is rendered (initially the existing departure list; later countdown, timeline, etc.).
- A **presentation** combines one data source with one visualization and its settings.
- Exactly **one full-screen visualization** is active on a panel at a time. No split-screen, compositing or layers.
- A panel can select a default presentation, switch manually, or follow a weekly schedule; schedules can also choose **Off**.
- Multiple presentations can reuse a data source; switching visualizations must not cause an unnecessary data refetch.
- Off is a controller/device state, **not** a special visualization or fake stop.
- Prefer server-resolved schedules (IANA timezone, including DST), so the firmware only consumes effective configuration.

## Conceptual model

```text
Physical panel (stable display_id)
   -> effective assignment resolver (manual override > schedule > default)
      -> Off
      -> Presentation
           -> Data source (departures, future types)
           -> Visualization type + validated renderer settings
                -> firmware full-screen renderer -> HUB75
```

The server owns reusable configuration, assignments and schedule evaluation. Firmware owns fetching/caching data, choosing a built-in renderer, and hardware output. The web app manages profiles, preview, overrides and schedules.

## Shared API contract (proposed)

Retain `GET /api/displays/:id` as the device configuration endpoint during migration. Return an effective, flattened configuration so firmware does not have to resolve schedules:

```json
{
  "display_id": "existing-device-id",
  "output_mode": "presentation",
  "presentation_id": "presentation-uuid",
  "data_source": {
    "id": "source-uuid",
    "type": "departures",
    "site_id": 9192,
    "line_numbers": [],
    "directions": [],
    "modes": [],
    "refresh_interval": 30
  },
  "visualization": {
    "type": "departures-list",
    "version": 1,
    "settings": {}
  },
  "next_transition_at": "2026-11-16T22:00:00Z"
}
```

When Off: `output_mode: "off"`, no active presentation, and an optional next transition timestamp. Field names/IDs are illustrative and must be reconciled with the current device contract. Keep a compatibility path for older firmware; version the effective config contract before introducing incompatible response changes. Validate supported visualization types and settings; never download executable renderer code. Unknown types should fail safely, not display stale data.

## Behavioral rules

1. Manual overrides may have an expiry; precedence: active manual override, then matching schedule, then default presentation.
2. Reject overlapping schedule windows initially; model overnight intervals unambiguously (split at midnight or document explicit semantics). Resolve in configured IANA timezone; test DST gaps/repeated hours.
3. A visualization-only change with the same data-source identity and compatible settings reuses the current normalized snapshot and polling cadence.
4. A data-source change invalidates prior departures before showing the new source. Do not show old-stop departures while waiting for new data.
5. Off clears displayed content, suspends departure polling and disables HUB75 output where supported, while preserving configuration connectivity. Verify actual electrical power savings; blank pixels alone may not reduce panel scan power.
6. Missing stop, offline/stale data, invalid renderer and intentionally Off are distinct states.
7. Avoid relying on Cloudflare Cron for recurring transitions: resolve the effective assignment on config reads and return `next_transition_at`; device polls periodically and/or refreshes at transition boundaries. Define clock-skew and offline behavior.
8. Authorization must protect management operations; a predictable owner/display identifier is not sufficient authentication.

## Delivery sequence across both repositories

1. **Firmware renderer extraction**: preserve existing visuals, introduce a renderer interface and normalized departure snapshot, with one registered `departures-list` renderer.
2. **Backend data-source/presentation model**: migrate existing display stop/filter fields into reusable data sources and presentations; keep stable display IDs and compatibility.
3. **Manual selection**: management APIs and Vue UI for changing active presentations; shorten effective-config polling to an acceptable latency (target ~30–60 seconds, subject to measurement).
4. **Off mode**: server response, explicit firmware state, blank/disable hardware output, polling behavior and power tests.
5. **Schedules**: weekly rules, Europe/Stockholm and other IANA zones, overrides, next transition, UI preview and boundary tests.
6. **More renderers**: countdown/timeline/minimal layouts against the same snapshot; no additional fetch when switching renderer.

Each step should be delivered as reviewable implementation PRs with tests; this document is the shared roadmap, not a single large implementation PR.

## Cross-project acceptance criteria

- Existing configured panels continue to function throughout migration.
- A user changes the stop/presentation in the web UI without reprovisioning USB.
- Same-source renderer switching does not trigger an extra departure request.
- Different-source switching never renders cached departures from the previous stop.
- Exactly one full-screen renderer runs at a time.
- Off is distinguishable from errors and reduces hardware activity where feasible.
- Schedules transition correctly across midnight, DST, reconnect and manual-override expiry.
- Server, firmware (including streaming JSON decoder), UI preview and tests agree on the effective configuration contract.

## slpanel-specific implementation notes

Current code points: `migrations/0001_initial.sql` stores stop and filters directly on `displays`; `src/api/types.ts` exposes `DisplayRecord`; `src/api/display-store.ts` with D1/memory implementations; `src/api/app.ts` serves `/api/displays/:id`, `/api/stops/search` and `/api/departures/:siteId`; `src/routes/config-page.vue` edits the stop directly and `src/routes/display-page.vue` loads configuration only on initial page load.

### Proposed backend work

1. Add `data_sources` (type + typed departures config), source-specific filter tables, `presentations` (source FK, renderer ID, version, settings JSON), `display_assignments` (default + expiring manual override), and `display_schedule_rules` (timezone, weekdays, local start/end, action, presentation FK). Keep `displays` as physical identity.
2. Migrate each existing display's site, filters and refresh interval into a data source and default presentation transactionally; avoid orphaning existing records. Define referential delete behavior for active presentations and schedules.
3. Implement an effective-configuration resolver with injectable clock for deterministic schedule tests; enforce ownership, schema validation, overlap detection, and override precedence.
4. Preserve the device endpoint and rollout compatibility; add authenticated CRUD for data sources/presentations, assignment and schedule management. Ensure device-facing response never exposes unrelated owner configuration.
5. Update Vue config UI to edit reusable sources and presentations, choose active/default presentation, manage weekly schedule and Off periods, and preview the _effective_ result. Refresh the browser preview when assignment changes.
6. Tests: migration, D1/memory parity, authorization, invalid renderer/settings, deleted source references, timezone/DST boundaries, overnight windows, override expiry and backward-compatible device reads.

### Ownership boundary

This repository owns schedule evaluation and the authoritative effective configuration. It must not implement firmware rendering. Coordinate API contract and rollout with the companion firmware plan.
