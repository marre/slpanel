# PLAN.md – SLPanel Replan

## Current repository state

- The previous prototype implementation has been removed from this branch on request.
- The repository is back to a planning-first state.
- The next implementation should start fresh around **Cloudflare Workers**, not Cloudflare Pages.

---

## Product goal

Build an online SL departure board with an old-style public transit board look.
Each display should be configurable by an owner and show SL departures on a TV, tablet, or browser without login.

---

## Target architecture

```text
Browser (config UI / display UI / future hardware clients)
                         |
                         | HTTPS / JSON
                         v
              Cloudflare Worker application
           - serves frontend assets
           - exposes /api/* routes
           - calls Trafiklab
                         |
             +-----------+-----------+
             |                       |
             v                       v
      Cloudflare D1            SL Transport API
```

### Chosen technical direction

- **Platform:** Cloudflare Workers
- **Frontend framework:** React Router v7 + React + TypeScript
- **Build tool:** Vite 7 (requires Node.js 20.19+ or 22.12+)
- **Backend framework:** Hono on Cloudflare Workers
- **Styling:** Tailwind CSS
- **Database:** Cloudflare D1
- **Testing:** Vitest for unit tests
- **CI:** GitHub Actions for lint, test, and build once the scaffold exists
- **Transit API:** Trafiklab SL Transport API v3

---

## Core product decisions

- No authentication in v1.
- Frontend talks only to `/api/*`.
- Browser never calls Trafiklab directly.
- Owner ID is always entered manually in v1.
- Display refresh interval defaults to **30 seconds** and is configurable per display.
- No backend caching in v1.
- Display look and feel should use an **old-style transit-board** aesthetic: dark background, pixelated/dot-matrix feel, amber/white text.
- Traffic API responses returned by our backend must be **SLPanel-specific**, not raw upstream payloads.
- The SLPanel backend API is the product contract; transit-provider integrations sit behind it and must be replaceable for other cities/countries later.

---

## ID scheme

```text
<owner-id>-<display-id>
 owner-id:   8 alphanumeric characters
 display-id: 12 alphanumeric characters
```

Example: `aB3xZ9kQ-fG7mNpQr2wLt`

- `display_id` is globally unique.
- `owner_id` groups displays belonging to one owner.
- The full display resource id is `<owner-id>-<display-id>`.

---

## Planned data model

### owners

```sql
CREATE TABLE owners (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### displays

```sql
CREATE TABLE displays (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  site_id TEXT,
  site_name TEXT,
  refresh_interval INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_displays_owner_display ON displays(owner_id, display_id);
CREATE INDEX idx_displays_owner ON displays(owner_id);
```

### display filters

Each display must explicitly store:

- which single stop it is bound to
- which line or lines it should show
- optional direction filters
- optional transport-mode filters

Store these values explicitly instead of using a generic JSON config blob.

Candidate tables:

```sql
CREATE TABLE display_line_filters (
  display_id TEXT NOT NULL REFERENCES displays(id) ON DELETE CASCADE,
  line_number TEXT NOT NULL
);

CREATE TABLE display_direction_filters (
  display_id TEXT NOT NULL REFERENCES displays(id) ON DELETE CASCADE,
  direction TEXT NOT NULL
);

CREATE TABLE display_mode_filters (
  display_id TEXT NOT NULL REFERENCES displays(id) ON DELETE CASCADE,
  mode TEXT NOT NULL
);
```

---

## Planned API contract

The `/api/*` contract should represent **SLPanel concepts**, not provider concepts.
Trafiklab-specific fields stay inside a provider adapter layer so the backend can later swap to another transit service without breaking the frontend or display clients.

### Displays

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/displays?owner=<owner_id>` | List displays for owner |
| `POST` | `/api/displays` | Create display |
| `GET` | `/api/displays/:id` | Get one display |
| `PUT` | `/api/displays/:id` | Update one display |
| `DELETE` | `/api/displays/:id` | Delete one display |

### Stops search

`GET /api/stops/search?q=<text>`

Planned response:

```json
{
  "query": "T-Centralen",
  "results": [
    {
      "site_id": "9180",
      "name": "T-Centralen",
      "type": "STATION",
      "stop_area_name": "T-Centralen"
    }
  ]
}
```

### Departures

`GET /api/departures/:siteId`

Planned response:

```json
{
  "site_id": "9180",
  "departures": [
    {
      "line_number": "17",
      "destination": "Skarpnäck",
      "display_time": "5 min",
      "minutes_until_departure": 5,
      "scheduled_at": "2026-05-18T21:10:00Z",
      "expected_at": "2026-05-18T21:10:00Z",
      "transport_mode": "METRO",
      "platform": "2",
      "state": "EXPECTED"
    }
  ]
}
```

Provider-specific details should be normalized before they cross the SLPanel API boundary.

---

## Transit API

### Selected API: Trafiklab SL Transport API v3

**Why chosen:**
- Covers the full SL (Stockholm Lokaltrafik) network: metro, bus, tram, commuter rail, and ferry.
- **No API key required** for basic usage — no per-app registration needed to prototype.
- Modern REST design with clean JSON responses; replaces the legacy APIs that were shut down in 2025.
- Supports filtering by transport mode and line in the query.

**Base URL:** `https://transport.integration.sl.se/v1`

### Endpoints used

#### Stop / site search

```
GET /sites?q={searchText}
```

Returns stop areas matching the query string. Use the numeric `id` field as `siteId` throughout.

Example response item:
```json
{ "id": 9192, "name": "Slussen", "type": "STOP_AREA" }
```

#### Departures

```
GET /sites/{siteId}/departures
```

Optional query parameters: `transport` (e.g. `METRO`, `BUS`), `line`, `forecast` (minutes ahead).

Example response:
```json
{
  "departures": [
    {
      "line": { "id": 17, "designation": "17", "transport_mode": "TRAM" },
      "destination": "Skarpnäck",
      "expected": "2026-05-18T21:10:00+02:00",
      "stop_point": { "id": 1234, "name": "Rådmansgatan", "designation": "2" },
      "deviations": []
    }
  ]
}
```

### Adapter mapping to SLPanel API

| SL Transport field | SLPanel field |
|---|---|
| `line.designation` | `line_number` |
| `destination` | `destination` |
| `expected` | `expected_at` + `display_time` computed |
| `stop_point.designation` | `platform` |
| `line.transport_mode` | `transport_mode` |
| `deviations[].consequence` | `state` (map `CANCELLED` → `CANCELLED`, else `EXPECTED`) |

---

## Display hardware target

The physical target is a **128×32 pixel LED matrix panel**.
The web prototype replicates this exact pixel grid to allow rapid layout iteration before flashing hardware.

### Web panel specification

- Fixed canvas: **128 × 32 CSS pixels** (scale up with `transform: scale(N)` for screen visibility).
- Use `image-rendering: pixelated` and `font-smooth: never` to preserve the pixel-perfect look.
- Background: black (`#000`). Foreground: amber (`#FF9900`) or white depending on theme.

### Pixel font selection

All fonts below are freely licensed, available as TTF/WOFF2 for web embedding, and confirmed to include Swedish characters **å ä ö Å Ä Ö**.

#### 2-row layout (16 px per row)

Each row has 16 px of vertical space (32 px ÷ 2 rows).

| Font | Cell size | Source | License |
|---|---|---|---|
| **Pixel Operator Mono 8** at 2× CSS scale | 8×8 → rendered 16 px | [NotABug / dafont](https://notabug.org/HarvettFox96/ttf-pixeloperator) | CC0 (Public Domain) |
| **Mx437 IBM VGA 8×16** | 8×16 | [int10h.org Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) | CC BY-SA 4.0 |
| **Unscii-16** | 8×16 | [github.com/viznut/unscii](https://github.com/viznut/unscii) | Public Domain |

**Recommended default for 2-row:** Pixel Operator Mono 8 at 2× — CC0 license, clean dot-matrix look, confirmed Swedish glyph coverage.

#### 4-row layout (8 px per row)

Each row has 8 px of vertical space (32 px ÷ 4 rows).

| Font | Cell size | Source | License |
|---|---|---|---|
| **Pixel Operator Mono 8** | 8×8 | [NotABug / dafont](https://notabug.org/HarvettFox96/ttf-pixeloperator) | CC0 (Public Domain) |
| **Mx437 IBM CGA 8×8** | 8×8 | [int10h.org Oldschool PC Font Pack](https://int10h.org/oldschool-pc-fonts/) | CC BY-SA 4.0 |
| **Unscii-8** | 8×8 | [github.com/viznut/unscii](https://github.com/viznut/unscii) | Public Domain |

**Recommended default for 4-row:** Pixel Operator Mono 8 — same font as the 2-row option, just at 1× scale; single font asset covers both layouts.

#### Usage notes

- Self-host the WOFF2 file; do not rely on Google Fonts or other CDN for a LED panel app.
- Set `font-size` to the exact cell height in pixels and `line-height: 1` to eliminate inter-row gaps.
- The display page CSS should include `letter-spacing: 1px` to approximate the inter-pixel gap of a real LED matrix.

---

## Frontend plan

### Framework choice

Use **React Router v7** as the frontend framework because it fits a Cloudflare Workers deployment well,
works cleanly with React and TypeScript, and keeps routing/data-loading structured without pulling in a
heavier platform than needed.

The **display frontend should be a SPA**.
For the admin/config interface, use the best fit within the same app architecture; a SPA admin UI is acceptable and keeps the setup simple.

### Styling choice

Use **Tailwind CSS** for layout, spacing, typography, and responsive TV-friendly design.
An additional component library is optional and should only be added if it provides clear value for admin UI form controls or shared primitives without compromising the display UI simplicity.

### Planned routes

| Route | Purpose |
|---|---|
| `/` | Landing page |
| `/config` | Owner entry and display management |
| `/display/:id` | Public departure board |

### Display board layout

Each row should show:
- line number
- destination
- time left to departure

Second line of the same row:
- next 3 departures for that line/direction

Example:

```text
17   Centralstationen     3 min
     9   15   22
```

---

## Non-functional requirements

These should be tracked explicitly in the implementation plan:

- CI: lint, test, and build on pull requests
- Local development workflow for Workers + D1
- Deployment workflow with Wrangler
- Error handling and empty states
- Accessibility basics for the config UI
- Logging/observability for Worker API failures
- README/setup documentation
- Provider abstraction boundary so non-SL backends can be introduced later

---

## Phased implementation plan

### Phase 1 – Planning / reset ✅
- [x] Document the new target architecture
- [x] Remove the previous Pages-based prototype implementation
- [x] Reframe the project around Workers + React Router v7 + Tailwind CSS

### Phase 2 – Foundation
- [ ] Scaffold React Router v7 + TypeScript app with Vite 7 (Node.js 20.19+ or 22.12+)
- [ ] Add Tailwind CSS
- [ ] Decide whether to add a lightweight component library for admin/display primitives
- [ ] Add Wrangler config for Cloudflare Workers + D1
- [ ] Add ESLint, Prettier, Vitest
- [ ] Add `npm run dev`, `npm run build`, `npm run test`, `npm run deploy`
- [ ] Add GitHub Actions CI

### Phase 3 – Worker API
- [ ] Add Hono router for `/api/*`
- [ ] Add a single initial D1 migration for `owners`, `displays`, and filter tables
- [ ] Implement display CRUD
- [ ] Implement transit-provider adapter boundary
- [ ] Implement stop search adapter
- [ ] Implement departures adapter with SLPanel-specific response shapes
- [ ] Add unit tests for validation, D1 helpers, and Trafiklab adapters

### Phase 4 – Config UI
- [ ] Landing page
- [ ] Owner-id entry flow
- [ ] Display list/create/edit/delete flows
- [ ] Stop search UI
- [ ] Display configuration fields for stop selection and line selection
- [ ] Filter configuration UI (line, direction, mode)

### Phase 5 – Display UI
- [ ] Display page for one display id
- [ ] Auto-refresh using display `refresh_interval`
- [ ] Old-style transit-board visual design
- [ ] Web panel: fixed 128×32 px canvas with `image-rendering: pixelated`
- [ ] Self-host Pixel Operator Mono 8 WOFF2 font for the display page
- [ ] 2-row and 4-row layout modes switchable per display configuration
- [ ] Primary row + next-3 departures layout
- [ ] Loading, error, and empty states

### Phase 6 – Deploy and polish
- [ ] Production Worker deploy
- [ ] Environment/secrets documentation
- [ ] Monitoring/logging baseline
- [ ] README with local dev + deploy instructions

---

## Settled decisions from review

- Use Cloudflare Workers, not Pages.
- The display frontend should be a SPA.
- A display targets a **single stop**.
- A display must be configurable with stop and line selection, plus optional direction/mode filters.
- Prefer a single initial migration while the schema is still undeployed.
- Use Tailwind CSS; add a component library only if it clearly improves the admin UI and/or shared primitives.
- No dedicated seed migration is required initially; revisit only if local development becomes painful.
