# Release checklist: Devices, Scenes and Schedules (PR #10)

This release changes both the Cloudflare Worker and the **production D1 database**.
The GitHub CI checks code, but **does not apply remote migrations**. Cloudflare
Workers Builds deploys automatically when `main` changes, so apply the additive
D1 migration **before merging**, not after.

## 1. Verify and back up production data

Use a terminal authenticated to the **correct Cloudflare account**. Run all
commands from the branch containing `migrations/0002_scenes_schedules.sql`:

```bash
git fetch origin
git switch docs/presentation-architecture-plan
git pull --ff-only
npm ci
npx wrangler whoami
npx wrangler d1 migrations list slpanel --remote
npx wrangler d1 execute slpanel --remote --command "SELECT COUNT(*) AS devices_before FROM displays"
npx wrangler d1 execute slpanel --remote --command "SELECT COUNT(*) AS lines_before FROM display_line_filters"
npx wrangler d1 execute slpanel --remote --command "SELECT COUNT(*) AS directions_before FROM display_direction_filters"
npx wrangler d1 execute slpanel --remote --command "SELECT COUNT(*) AS modes_before FROM display_mode_filters"
npx wrangler d1 export slpanel --remote --output "./slpanel-before-scenes-$(date +%Y%m%d-%H%M%S).sql"
```

Do not commit the export; it contains user and stop configuration data. Store it
securely. The D1 migration command also captures a Cloudflare backup, but this
separate SQL export gives an independent recovery point.

**Stop if** the live migration list does not match the repository's existing
migration history or if `0002_scenes_schedules.sql` is already applied.
Never overwrite or reset production to force a migration through.

## 2. Apply the additive migration while the old Worker is still deployed

```bash
npm run db:migrate:remote
npx wrangler d1 migrations list slpanel --remote
```

This executes the existing `0002` SQL:

- Create normalized reusable data sources, scenes, schedules, and exclusive
  device assignments.
- Copy every existing physical device's stop, refresh cadence and filters into
  an imported source and scene.
- Select that imported scene directly for each existing physical device.
- Preserve all existing `owners`, `displays` and old filter tables **unchanged**.

The currently deployed Worker still reads the old tables, so it can continue
running during this step. New shared schedules will be created through the UI
after deployment; migration does not invent schedules or change any device
into Off.

## 3. Verify the migrated rows before merging

```bash
npx wrangler d1 execute slpanel --remote --command "SELECT (SELECT COUNT(*) FROM displays) AS devices, (SELECT COUNT(*) FROM scenes WHERE id LIKE 'legacy-scene:%') AS imported_scenes, (SELECT COUNT(*) FROM device_assignments) AS assignments"
npx wrangler d1 execute slpanel --remote --command "SELECT (SELECT COUNT(*) FROM display_line_filters) AS old_lines, (SELECT COUNT(*) FROM data_source_line_filters) AS new_lines, (SELECT COUNT(*) FROM display_direction_filters) AS old_directions, (SELECT COUNT(*) FROM data_source_direction_filters) AS new_directions, (SELECT COUNT(*) FROM display_mode_filters) AS old_modes, (SELECT COUNT(*) FROM data_source_mode_filters) AS new_modes"
npx wrangler d1 execute slpanel --remote --command "SELECT COUNT(*) AS invalid_references FROM device_assignments a LEFT JOIN scenes s ON a.scene_id=s.id LEFT JOIN schedules t ON a.schedule_id=t.id WHERE (a.kind='scene' AND s.id IS NULL) OR (a.kind='schedule' AND t.id IS NULL)"
npx wrangler d1 execute slpanel --remote --command "PRAGMA foreign_key_check"
```

Expected:

1. **devices = imported_scenes = assignments** immediately after migration,
   before new UI writes.
2. Old and new counts match for each of the three filter families.
3. `invalid_references` is zero; `PRAGMA foreign_key_check` returns no rows.
4. `d1 migrations list --remote` shows no unapplied migrations.

Also verify the preview URL against this D1 database **read-only** before merge,
and confirm the existing production device configuration endpoint continues
to serve an existing display. Do not perform preview writes against production.

The repository CI additionally runs `python3 scripts/test_d1_migration.py`
against a seeded SQLite fixture covering preservation, FKs and shared schedules.

## 4. Merge and verify deployment

After migration verification and successful PR checks, merge
[slpanel PR #10](https://github.com/marre/slpanel/pull/10) into `main`.
Cloudflare Git integration will then build and deploy the new Worker. Confirm
the production build succeeded.

Smoke checks for a known owner and existing display (replace placeholders):

```bash
curl -fsS https://panel.xr.se/api/health
curl -fsS "https://panel.xr.se/api/scenes?owner=YOUR_OWNER_ID"
curl -fsS "https://panel.xr.se/api/schedules?owner=YOUR_OWNER_ID"
curl -fsS "https://panel.xr.se/api/displays/YOUR_FULL_DISPLAY_ID"
```

Existing displays should retain their selected departures. The new web app
has three pages, **Devices / Scenes / Schedules**. A device can select a fixed
scene or a reusable schedule. Schedules select scenes within configured
non-overlapping windows, and **Off at all other times** (not configurable).

**Firmware caveat:** old slpanel-rust firmware may show a missing-stop
placeholder when the server resolves Off. True blank screen/power savings
requires a separate firmware release. Keep schedule Off testing explicit.

## 5. Recovery and future releases

If the deployment fails, roll back the **Worker** first while leaving the
additive migration in place. The previous Worker ignores the new tables.
Do not automatically restore the D1 export: doing so would discard changes
made since backup. A D1 Time Travel rollback is likewise an explicit,
potentially destructive action requiring impact assessment.

For future releases, move database migrations into a guarded release
pipeline so deployment cannot precede required schema updates. Do not
run production D1 migrations automatically on ordinary PR builds.
