# SLPanel

SLPanel is a Cloudflare Worker and Vue Router SPA for building Stockholm SL-style departure displays.
The repository now includes the owner config flow and the first live public display board: one display can
load its saved filters, fetch normalized departures through the Worker API, and render the custom bitmap
font on a fixed 128x32 canvas.

## Stack

- Cloudflare Workers + Wrangler
- Hono for `/api/*` routes
- Vue 3 + Vue Router 4 + Nuxt UI 4 + TypeScript
- Vite 8
- Tailwind CSS 4
- Vitest + Testing Library
- ESLint + Prettier

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+
- Wrangler authentication when you want to deploy or provision Cloudflare resources

## Getting started

```bash
npm install
npm run dev
```

This starts:

- the Vite frontend at `http://localhost:5173`
- the local Worker at `http://localhost:8787`

The Vite dev server proxies `/api/*` requests to the Worker.

## Available scripts

- `npm run dev` starts the frontend and Worker
- `npm run build` typechecks the app and builds both frontend and worker output
- `npm run test` runs the Vitest suite
- `npm run lint` runs ESLint
- `npm run format` checks formatting with Prettier
- `npm run db:migrate:local` applies D1 migrations to the local database
- `npm run db:migrate:remote` applies D1 migrations to the remote database
- `npm run deploy` builds and deploys with Wrangler

## D1 setup

`wrangler.jsonc` already includes the Worker and static-asset setup.
The D1 binding is now configured for the `slpanel` database.

Apply the schema with:

```bash
npm run db:migrate:local
```

When you are ready to update the remote database too:

```bash
npm run db:migrate:remote
```

The initial migration lives in `migrations/0001_initial.sql` and creates:

- `owners`
- `displays`
- `display_line_filters`
- `display_direction_filters`
- `display_mode_filters`

## Current routes

- `/` landing page with links into config and display flows
- `/config` owner-based config workspace with a preview of unsaved filters
- `/device` USB device configuration with automatic live logs, clipboard copy, and download using Web Serial
- `/display/:displayId` public display board with live departures and auto-refresh
- `/api/health` Worker health endpoint
- `/api/displays` display CRUD root
- `/api/displays/:id` single display CRUD route
- `/api/stops/search` stop search adapter
- `/api/departures/:siteId` normalized departures adapter

Use `/display/demo-board` to preview the board UI without needing a saved display resource.

## API notes

- Display CRUD is backed by D1 and stores line, direction, and transport-mode filters explicitly.
- The Trafiklab provider lives behind a replaceable adapter boundary in the Worker.
- The stop search adapter currently fetches `/sites` and applies local filtering because the live API host does not appear to honor search query parameters consistently.

## REST API

The Worker exposes a JSON API under `/api`. When developing locally, use
`http://localhost:8787/api` directly or send requests to `/api` through the
Vite dev server at `http://localhost:5173`.

| Method   | Path                           | Description                      |
| -------- | ------------------------------ | -------------------------------- |
| `GET`    | `/api/health`                  | Check that the Worker is running |
| `GET`    | `/api/displays?owner=:ownerId` | List an owner's displays         |
| `POST`   | `/api/displays`                | Create a display                 |
| `GET`    | `/api/displays/:id`            | Get a display                    |
| `PUT`    | `/api/displays/:id`            | Update a display                 |
| `DELETE` | `/api/displays/:id`            | Delete a display                 |
| `GET`    | `/api/stops/search?q=:query`   | Search for stops                 |
| `GET`    | `/api/departures/:siteId`      | Get normalized departures        |

Owner IDs are exactly 8 alphanumeric characters. A display resource ID combines
that owner ID with a generated 12-character display ID, for example
`aB3xZ9kQ-fG7mNpQr2wLt`.

### Health

`GET /api/health`

Response (`200 OK`):

```json
{
  "ok": true,
  "service": "slpanel",
  "timestamp": "2026-05-29T08:13:30.000Z"
}
```

### Displays

`GET /api/displays?owner=aB3xZ9kQ` lists all displays belonging to an owner.

Response (`200 OK`):

```json
{
  "owner_id": "aB3xZ9kQ",
  "displays": [
    {
      "id": "aB3xZ9kQ-fG7mNpQr2wLt",
      "owner_id": "aB3xZ9kQ",
      "display_id": "fG7mNpQr2wLt",
      "name": "Southbound platform",
      "site_id": "1011",
      "site_name": "Slussen",
      "refresh_interval": 30,
      "line_numbers": ["17", "18"],
      "directions": ["Hagsätra"],
      "modes": ["METRO"]
    }
  ]
}
```

`POST /api/displays` creates a display. Only `owner_id` is required. The other
fields default to an empty name, no stop, a 30-second refresh interval, and no
filters. Transport modes are normalized to uppercase.

Request:

```json
{
  "owner_id": "aB3xZ9kQ",
  "name": "Southbound platform",
  "site_id": "1011",
  "site_name": "Slussen",
  "refresh_interval": 30,
  "line_numbers": ["17", "18"],
  "directions": ["Hagsätra"],
  "modes": ["METRO"]
}
```

Response (`201 Created`):

```json
{
  "display": {
    "id": "aB3xZ9kQ-fG7mNpQr2wLt",
    "owner_id": "aB3xZ9kQ",
    "display_id": "fG7mNpQr2wLt",
    "name": "Southbound platform",
    "site_id": "1011",
    "site_name": "Slussen",
    "refresh_interval": 30,
    "line_numbers": ["17", "18"],
    "directions": ["Hagsätra"],
    "modes": ["METRO"]
  }
}
```

`GET /api/displays/aB3xZ9kQ-fG7mNpQr2wLt` returns the same `display` response
shape as the create endpoint (`200 OK`).

`PUT /api/displays/aB3xZ9kQ-fG7mNpQr2wLt` partially updates a display. Include
only the fields to change; `id`, `owner_id`, and `display_id` are immutable. Set
`site_id` to `null` to clear the selected stop.

Request:

```json
{
  "name": "Evening service",
  "refresh_interval": 45,
  "line_numbers": ["19"]
}
```

Response (`200 OK`):

```json
{
  "display": {
    "id": "aB3xZ9kQ-fG7mNpQr2wLt",
    "owner_id": "aB3xZ9kQ",
    "display_id": "fG7mNpQr2wLt",
    "name": "Evening service",
    "site_id": "1011",
    "site_name": "Slussen",
    "refresh_interval": 45,
    "line_numbers": ["19"],
    "directions": ["Hagsätra"],
    "modes": ["METRO"]
  }
}
```

`DELETE /api/displays/aB3xZ9kQ-fG7mNpQr2wLt` deletes the display and returns
`204 No Content` with an empty response body.

### Stop search

`GET /api/stops/search?q=Slussen` searches stop names and stop areas. The query
must contain at least 2 characters, and at most 25 matches are returned.

Response (`200 OK`):

```json
{
  "query": "Slussen",
  "results": [
    {
      "site_id": "1011",
      "name": "Slussen",
      "type": "METROSTN",
      "stop_area_name": "Slussen (Stockholm)"
    }
  ]
}
```

### Departures

`GET /api/departures/1011?line=17&line=18&direction=Hags%C3%A4tra&mode=METRO&forecast=60`
returns provider-independent departures for a numeric site ID.

All query parameters are optional:

- `line` (alias `line_number`) filters by line number.
- `direction` filters by direction name or provider direction code.
- `mode` (alias `transport_mode`) filters by transport mode and is normalized
  to uppercase.
- `forecast` selects a forecast window from 1 to 240 minutes and defaults to 30.

Filter parameters may be repeated, as above, or contain comma-separated values.

Response (`200 OK`):

```json
{
  "site_id": "1011",
  "departures": [
    {
      "line_number": "17",
      "destination": "Hagsätra",
      "display_time": "5 min",
      "minutes_until_departure": 5,
      "scheduled_at": "2026-05-29T08:18:30+02:00",
      "expected_at": "2026-05-29T08:18:30+02:00",
      "transport_mode": "METRO",
      "platform": "2",
      "state": "EXPECTED"
    }
  ]
}
```

`scheduled_at` and `expected_at` can be `null`, and `state` is either
`EXPECTED` or `CANCELLED`.

### Errors

Validation failures return `400 Bad Request`, missing displays return
`404 Not Found`, upstream transit-provider failures return `502 Bad Gateway`,
and unexpected failures return `500 Internal Server Error`. Error responses use
the same shape:

```json
{
  "error": {
    "code": "validation_error",
    "message": "owner_id must be 8 alphanumeric characters.",
    "details": null
  }
}
```

## Config workflow

The `/config` route now supports:

- entering or recalling an owner ID
- listing existing displays for that owner
- creating, editing, and deleting displays
- binding a single stop via search
- configuring line, direction, and transport-mode filters
- opening a saved display URL directly from the config screen

## USB device workflow

Open `/device` in desktop Chrome or Edge over HTTPS (or the local Vite server at
`http://localhost:5173/device`). Plug in the panel with a USB data cable and click
**Connect device** to select it in the browser picker. Close terminals or the
Rust device tool before connecting; only one application can own the port.
Unsupported browsers and insecure origins show instructions instead of a
connection button that cannot work.

The page automatically loads the saved Wi-Fi name, service URL, and display ID
from the device. **Reload settings** discards form edits and reads them again.
From a saved display in `/config`, **Configure USB device** prefills that display
ID for binding it to the panel. The device reports whether a Wi-Fi password is
saved, but never exports its value. Leave **Update Wi-Fi password** unchecked to
preserve the durable password while changing the other settings. Check it to
enter a new password, or explicitly select **Open Wi-Fi network** to clear it.
After saving, the password field is cleared and subsequent saves preserve the
new value by default. Reboot the panel after saving.

With updated firmware, **Wi-Fi security** selects automatic WPA2/WPA3,
WPA2 compatibility mode, or WPA3 only. The selection is loaded from and saved
to the device along with the other settings; changing it preserves the password.
The selector is disabled for older firmware that does not expose this setting.

Settings and new passwords travel directly over USB. They are never sent to the
server API, or placed in browser storage or URLs. No local config file is needed.

**Read logs** drains retained history and adds entries after the last read.
**Follow logs** continues polling every 250 ms; stop it before saving settings or
reading detailed diagnostics. The device retains 100 statements across USB
disconnects, and this page retains up to 1,000 entries in memory. Logs include
sequence numbers, uptime, and UTC once NTP is synchronized. The page reports
overwritten device entries. **Download logs** exports the displayed entries as
JSON lines, including the original millisecond timestamps. Reboot clears device
history. Disconnecting or navigating away releases the port; timeouts and invalid
responses close the session so late packets cannot answer a later request.

This uses the USB JSON protocol v1 from the sibling `slpanel-rust` project with
115200 baud, DTR enabled, and the development device identity `c0de:cafe`. Use
firmware with the `config` read operation and optional-password update support;
earlier protocol-v1 images need to be rebuilt and flashed. No server API change
is needed. The Rust CLI remains available for browsers that do not support Web
Serial. Browser API
details: [Chrome Web Serial documentation](https://developer.chrome.com/docs/capabilities/serial).

## Display workflow

The `/display/:displayId` route now supports:

- loading one saved display definition from the Worker API
- fetching departures with the display's saved line, direction, and mode filters
- rendering the default 2-row SL board layout on a fixed 128x32 pixel canvas
- auto-refreshing departures using the display's configured `refresh_interval`
- loading, error, empty, and stale-data states on the board itself

## CI

GitHub Actions runs `lint`, `test`, `format`, and `build` on pushes to `main` and on pull requests.

## Frontend

The browser app uses Vue 3 single-file components, Vue Router, Nuxt UI 4 and Vite. Nuxt UI is integrated through its Vue/Vite plugins; the Hono Worker still serves the SPA and `/api/*`. The light theme is configured in `vite.config.ts` and `src/styles.css`.

Routes are loaded lazily. `usePolling` owns cancellable departure refreshes, `useDevice` owns the Web Serial session and request queue, and `useDisplayCanvas` owns the pixel board animation. Stop and filter pickers use Nuxt UI comboboxes with typed events/models. `vue-tsc` checks both templates and application TypeScript; Worker typechecking stays separate.

### Signed firmware updates

Protocol 2 devices with the staged-update bootloader offer signed releases on
`/device`. The Worker discovers stable tagged releases from the firmware
repository and serves the catalogue at `/firmware/releases.json`. It checks the
tag commit, main ancestry, publication receipt, and required assets/SBOM before
offering a release. New eligible releases appear without rebuilding the web app;
discovery is cached for five minutes. Users can also select a release's
`manifest.json` and `firmware.bin` locally. The browser checks exact size,
compatibility, SHA-256 and metadata before uploading. The panel and bootloader
verify Ed25519 against their embedded public key.

Hold the blank-output button (GPIO22) for two seconds, then choose Update within
60 seconds. Upload progress stops normal device actions. The panel verifies and
restarts; reconnect the same panel to obtain the durable result. Success requires
the expected image and exact attempt to be confirmed. Trial failure reports
restoration of the previous image. Settings survive upgrades. Physical ROM UF2
recovery handles initial bootloader installation and unbootable firmware.

The client supports protocol 1 for existing configuration/logging and protocol 2
for staged updates. It does not offer uploads on v1 devices. A request timeout
closes the session; reconnect and rerun the same package to resume at the device's
reported checkpoint. Update attempts stored in browser storage contain only
board/image/attempt identifiers, never passwords or signing keys.

See the sibling `slpanel-rust/docs/update-build.md` for key configuration, signing,
bootstrap/recovery and hardware release gates. To publish a qualified release,
follow [the firmware asset instructions](public/firmware/README.md).

The firmware repository is private. Configure a fine-grained GitHub token with
**Contents: read** on `marre/slpanel-rust` only as the Worker secret
`FIRMWARE_GITHUB_TOKEN` (`npx wrangler secret put FIRMWARE_GITHUB_TOKEN`).
`FIRMWARE_REPOSITORY` is set in `wrangler.jsonc`. The Worker uses the credential
server-side; browsers receive only catalogue data and the signed manifest/image.
These update binaries are intentionally downloadable by visitors to the public
web app even though the firmware source repository is private. Never configure
the signing seed in the Worker. For local development set the same bindings in
an untracked `.dev.vars` file. Missing/expired private-repo access produces a
release-unavailable error; local package selection still works.
