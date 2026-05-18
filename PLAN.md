# PLAN.md – SLPanel Replan

## Current repository state

- The previous prototype implementation has been removed from this branch on request.
- The repository is back to a planning-first state.
- The next implementation should start fresh around **Cloudflare Workers**, not Cloudflare Pages.

---

## Product goal

Build an online SL departure board inspired by the physical [T-Skylt X](https://shop.t-skylt.se/products/t-skylt-x).
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
- **Backend framework:** Hono on Cloudflare Workers
- **Styling:** Tailwind CSS
- **Database:** Cloudflare D1
- **Testing:** Vitest for unit tests
- **CI:** GitHub Actions for lint, test, and build once the scaffold exists

---

## Core product decisions

- No authentication in v1.
- Frontend talks only to `/api/*`.
- Browser never calls Trafiklab directly.
- Owner ID is always entered manually in v1.
- Display refresh interval defaults to **30 seconds** and is configurable per display.
- No backend caching in v1.
- Display look and feel should mirror **T-Skylt X**: dark background, pixelated/dot-matrix feel, amber/white text.
- Traffic API responses returned by our backend must be **SLPanel-specific**, not raw upstream payloads.

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

Store filters explicitly instead of using a generic JSON config blob.

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

---

## Frontend plan

### Framework choice

Use **React Router v7** as the frontend framework because it fits a Cloudflare Workers deployment well,
works cleanly with React and TypeScript, and keeps routing/data-loading structured without pulling in a
heavier platform than needed.

### Styling choice

Use **Tailwind CSS** for layout, spacing, typography, and responsive TV-friendly design.

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

---

## Phased implementation plan

### Phase 1 – Planning / reset ✅
- [x] Document the new target architecture
- [x] Remove the previous Pages-based prototype implementation
- [x] Reframe the project around Workers + React Router v7 + Tailwind CSS

### Phase 2 – Foundation
- [ ] Scaffold React Router v7 + TypeScript app
- [ ] Add Tailwind CSS
- [ ] Add Wrangler config for Cloudflare Workers + D1
- [ ] Add ESLint, Prettier, Vitest
- [ ] Add `npm run dev`, `npm run build`, `npm run test`, `npm run deploy`
- [ ] Add GitHub Actions CI

### Phase 3 – Worker API
- [ ] Add Hono router for `/api/*`
- [ ] Add D1 migrations for `owners`, `displays`, and filter tables
- [ ] Implement display CRUD
- [ ] Implement stop search adapter
- [ ] Implement departures adapter with SLPanel-specific response shapes
- [ ] Add unit tests for validation, D1 helpers, and Trafiklab adapters

### Phase 4 – Config UI
- [ ] Landing page
- [ ] Owner-id entry flow
- [ ] Display list/create/edit/delete flows
- [ ] Stop search UI
- [ ] Filter configuration UI (line, direction, mode)

### Phase 5 – Display UI
- [ ] Display page for one display id
- [ ] Auto-refresh using display `refresh_interval`
- [ ] T-Skylt-inspired visual design
- [ ] Primary row + next-3 departures layout
- [ ] Loading, error, and empty states

### Phase 6 – Deploy and polish
- [ ] Production Worker deploy
- [ ] Environment/secrets documentation
- [ ] Monitoring/logging baseline
- [ ] README with local dev + deploy instructions

---

## Open items

These still need explicit decisions or confirmation during implementation:

- Should one display support multiple stops in v1 or later?
- Should the frontend be SPA-only on Workers assets, or use React Router framework rendering from the Worker?
- Do we want a component library on top of Tailwind, or Tailwind-only in v1?
- Do we need a dedicated migration for seed/test data in local development?
