# Devices, Scenes and Schedules

## Agreed domain model

- **Device** = physical SLPanel with a permanent `display_id` already provisioned in firmware.
- **Scene** = reusable named configuration binding one departure data source to one supported full-screen visualization. A scene may be used directly by many devices or within many schedules.
- **Schedule** = reusable set of non-overlapping weekday time windows, each pointing to one scene.
- **Outside all schedule windows the result is always Off.** There is no schedule default scene, configurable fallback, or explicit Off rule.
- **Device assignment** = exactly one selected scene **or** one selected schedule. A schedule can be assigned to multiple devices, all of which resolve to the same scene or Off at the same moment.
- The internal reusable `data_sources` table retains normalized stops, lines, directions, transport modes and refresh interval; scenes can share a data source.
- One full-screen renderer is active per device. No split-screen or composition is required.
- The worker, not the device, evaluates weekly rules in an IANA timezone, including overnight windows and daylight-saving changes.

```text
Devices (physical IDs preserved)
  ├── fixed Scene
  └── shared Schedule
         ├── Mon–Fri 06:00–09:00 → Morning Scene
         ├── Mon–Fri 17:00–22:00 → Evening Scene
         └── everything else   → Off (implicit, not configurable)

Scene → Data source (stop + filters) + Visualization (firmware renderer)
```

## UI

Three primary workspace pages:

1. **Devices** (`/devices`): create/rename/remove physical panel configuration; select a direct scene or reusable schedule; open USB configuration and live preview. Identifiers stay stable.
2. **Scenes** (`/scenes`): save scene names, find a stop, configure filters and refresh interval, choose a supported visualization, preview departures. Data sources can be reused between scenes; changing a shared source affects all referencing scenes.
3. **Schedules** (`/schedules`): create reusable schedules, set timezone and add scene time windows by day. Off outside windows is displayed prominently and never offered as an editable default. Overlapping intervals are rejected, including across midnight/Sunday.

Owner ID selection is shared across these pages and restored from browser local storage. The owner ID is **not** authentication.

Old `/config` and `/presentations` URLs redirect to the corresponding new pages. The standalone live display preview remains at `/display/:displayId`, and the USB provisioning utility at `/device`.

## Storage and migration

`migrations/0002_scenes_schedules.sql` creates `data_sources` and normalized source filter tables, `scenes`, `schedules`, `schedule_rules`, and `device_assignments`.

A device assignment has a database CHECK constraint enforcing either exactly one `scene_id` or exactly one `schedule_id`. Rules always have a non-null `scene_id`; the resolver returns Off when no rule matches. The schedule itself has no default field.

Existing devices are migrated into an imported data source and a scene selected directly by the same physical device. All permanent IDs and legacy display fields are preserved. New devices can be provisioned from the Devices page and assigned to a scene or schedule.

**Deploy order:** run D1 migration **before** deploying the worker. This `0002` schema replaces the unmerged previous proposal, not an already-deployed migration. If a local database already applied the experimental `0002_presentations.sql`, recreate that local D1 database before applying the renamed migration.

## API contract

- Existing `GET /api/displays/:id` remains available for firmware. It returns a flattened effective `display` with the stop and filters selected by either the fixed scene or active schedule window.
- An additional `effective` object gives `mode: 'scene' | 'off' | 'legacy'`, selected scene, source, reason and optional next transition timestamp.
- When Off, the effective flat display has `site_id: null` for older firmware compatibility.
- Configuration management endpoints:
  - `GET/POST /api/scenes`, `PUT/DELETE /api/scenes/:id`
  - `GET/POST /api/schedules`, `PUT/DELETE /api/schedules/:id`
  - `GET/PUT /api/displays/:id/assignment`
  - Reusable source management: `/api/data-sources` and `/api/data-sources/:id`.

Schedule rules are end-exclusive HH:mm ranges with weekdays 0=Monday through 6=Sunday. Same start/end means a full day; end earlier than start crosses midnight. Inputs reject overlaps, unknown scene references, invalid timezones, and attempts to configure any other default than Off. Multiple devices can reference the same schedule without copying its rules.

The resolver uses an injectable clock for deterministic tests. `next_transition_at` is advisory: clients must still poll configuration periodically.

## Firmware integration and limitations

Firmware still calls the old config endpoint with its permanent physical display ID. Scene-only switches work on old firmware on its existing configuration polling cadence. Hardware blanking, departure polling suspension and fast wake-up when a schedule switches to Off still require the separate slpanel-rust implementation. Legacy firmware may display a missing-stop state rather than fully blanking the HUB75 panel.

The firmware should consume only the *effective* scene/mode; it must not implement local timezone or recurrence logic. Renderers receive normalized departure snapshots; switching renderers with the same source must not trigger unnecessary network fetches. A new data source invalidates stale previous-stop data before rendering.

## Acceptance criteria

- Three focused, mobile-friendly management pages; keyboard-operable controls and clear validation/confirmation.
- One schedule can be shared by at least two devices.
- A device can select a direct scene instead of a schedule.
- A schedule cannot select multiple scenes simultaneously; gaps are unconditionally Off.
- Migration retains current display identities and cached legacy stop/filter settings.
- Existing device firmware continues to read the flat config.
- Test regular weekdays, overnight windows, cross-Sunday rollover, Swedish DST changes, cross-owner references, schedule deletion while assigned, and frontend workflows.
- `npm run lint`, `npm run test`, `npm run format`, and `npm run build` pass.

## Security and rollout

The project currently uses an unauthenticated eight-character owner ID. Ownership checks prevent accidental cross-owner assignment in the stores, but **do not establish authorization**. The entire write API should be placed behind genuine authentication/access controls before public multi-user use. Do not expose ownership IDs as secrets or rely on them as a security boundary.

No backwards compatibility is promised for the unmerged experimental presentation schema. Firmware compatibility, however, remains a requirement.
