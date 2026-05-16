# PLAN.md – SLPanel Implementation Plan

## Vision

An online SL departure board display, modelled after the physical
[T-Skylt X](https://shop.t-skylt.se/products/t-skylt-x).  
A user can set up one or more "displays", each configured to show departures from a chosen SL
station/stop. The display page auto-refreshes and can be opened on any screen (TV, tablet, etc.)
without any login.

---

## Architecture Overview

```
Browser (Config UI)          Browser (Display UI)          Hardware client (future)
        │                            │                              │
        └────────────────────────────┴──────────────────────────────┘
                                     │ HTTPS / JSON REST
                          ┌──────────▼──────────┐
                          │  Cloudflare Pages    │
                          │  Pages Functions API │
                          │  /api/*              │
                          └──────┬──────┬────────┘
                                 │      │
                    ┌────────────▼─┐  ┌─▼──────────────┐
                    │  D1 Database │  │  Trafiklab API  │
                    │  (displays)  │  │  (departures,   │
                    └──────────────┘  │   stop search)  │
                                      └─────────────────┘
```

The frontend and backend communicate **only** through the `/api/` layer. This is the stable contract
that future hardware clients will also use.

---

## ID Scheme

```
Full display ID:  <owner-id>-<display-id>
                  ^^^^^^^^   ^^^^^^^^^^^^
                  8 chars     12 chars
                  [A-Za-z0-9] [A-Za-z0-9]

Example:  aB3xZ9kQ-fG7mNpQr2wLt
```

- The **owner-id** groups displays belonging to the same "user".
- The **display-id** uniquely identifies a single display within an owner.
- **No authentication** in v1 — knowledge of an ID is the only access control.

---

## Database Schema (D1 / SQLite)

```sql
-- migrations/0001_initial.sql

CREATE TABLE displays (
  id          TEXT PRIMARY KEY,        -- full id: "<owner_id>-<display_id>"
  owner_id    TEXT NOT NULL,
  display_id  TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  site_id     TEXT,                    -- Trafiklab SiteId (stop)
  site_name   TEXT,                    -- human-readable stop name
  config      TEXT NOT NULL DEFAULT '{}',  -- JSON blob for future extensibility
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_displays_owner ON displays(owner_id);
```

---

## API Routes

### Displays resource

| Method | Path | Body / Params | Description |
|---|---|---|---|
| `GET` | `/api/displays?owner=<owner_id>` | — | List displays for owner |
| `POST` | `/api/displays` | `{ owner_id, name?, site_id?, site_name? }` | Create display (generates display_id) |
| `GET` | `/api/displays/:id` | — | Get single display |
| `PUT` | `/api/displays/:id` | `{ name?, site_id?, site_name?, config? }` | Update display |
| `DELETE` | `/api/displays/:id` | — | Delete display |

### SL data (proxied through backend to protect API keys)

| Method | Path | Params | Description |
|---|---|---|---|
| `GET` | `/api/stops/search` | `?q=<text>` | Search stops (Trafiklab Platssök) |
| `GET` | `/api/departures/:siteId` | — | Live departures (Trafiklab Realtid) |

---

## Frontend Routes

| Path | Component | Purpose |
|---|---|---|
| `/` | `HomePage` | Landing page; links to Config and Display |
| `/config` | `ConfigPage` | Enter owner-id, manage displays |
| `/display/:displayId` | `DisplayPage` | Show live departures for a display |

---

## Phased Implementation Plan

### Phase 1 – Project Scaffold ✅ (this PR)
- [x] `AGENT.md` – agent conventions
- [x] `PLAN.md` – this document

### Phase 2 – Project Setup
- [ ] Initialise Vite + React + TypeScript project (`npm create vite@latest`)
- [ ] Add Wrangler and configure `wrangler.toml` for Cloudflare Pages + D1
- [ ] Write `migrations/0001_initial.sql` (schema above)
- [ ] `tsconfig.json`, ESLint, Prettier
- [ ] `npm run dev` / `npm run build` / `npm run deploy` scripts
- [ ] Basic Vitest setup

### Phase 3 – Backend API
- [ ] Pages Function: `GET /api/displays?owner=`
- [ ] Pages Function: `POST /api/displays`
- [ ] Pages Function: `GET/PUT/DELETE /api/displays/:id`
- [ ] Pages Function: `GET /api/stops/search?q=`
- [ ] Pages Function: `GET /api/departures/:siteId`
- [ ] Wrangler secrets for Trafiklab API keys
- [ ] Unit tests for helper functions

### Phase 4 – Config UI
- [ ] `HomePage` – simple landing page with navigation
- [ ] `ConfigPage` – enter / generate owner-id, list displays
- [ ] Create display form (name + stop search)
- [ ] Edit / delete display
- [ ] Stop search component (calls `/api/stops/search`)

### Phase 5 – Display UI
- [ ] `DisplayPage` – render departure board for a given display ID
- [ ] Fetch display config (`/api/displays/:id`)
- [ ] Fetch & auto-refresh departures (`/api/departures/:siteId`)
- [ ] Departure board layout (lines, destinations, times, track/platform)

### Phase 6 – Polish & Deploy
- [ ] Responsive / TV-friendly CSS for the display board
- [ ] Error states and loading skeletons
- [ ] CI/CD via Cloudflare Pages GitHub integration
- [ ] README with setup instructions

---

## Open Questions

The following need answers before Phase 3/4 work begins. Please answer directly in this file or in a
comment on the PR.

### Q1 – Trafiklab API choice
Which Trafiklab APIs should we use?

Candidates:
- **SL Transport** (new unified API, requires key) – recommended if available
- **SL Realtidsinformation 4** (older, free tier) for departures
- **SL Platsuppslag** for stop search

> **Answer:** _…_

### Q2 – Departure board content
What information should each departure row show?

Suggested:
- Line number / designation (e.g. "17", "T14", "474")
- Direction / final destination
- Time until departure (minutes) or scheduled time (HH:MM)
- Transport mode icon (metro, bus, tram, train, etc.)
- Track / platform (where applicable)

> **Answer:** _…_

### Q3 – Multiple stops per display
Should a single display be able to show departures from **more than one stop** (e.g. both directions
of a street stop)?

> **Answer:** _…_

### Q4 – Departure filtering
Should the config UI allow filtering by line number, direction, or transport mode?

> **Answer:** _…_

### Q5 – Auto-refresh interval
How often should the display page refresh departure data?  
(Trafiklab free-tier rate limits may apply.)

Suggested default: **30 seconds**.

> **Answer:** _…_

### Q6 – Owner-id UX
Should the owner-id be:
a) Shown once after generation and stored in `localStorage`?
b) Always entered manually by the user?
c) Both (generate + remember in localStorage, but allow manual override)?

> **Answer:** _…_

### Q7 – Display board look & feel
Any specific styling preferences?
- Dark background (like real departure boards)?
- Specific fonts or colours?
- Should it mirror the look of the physical T-Skylt X product?

> **Answer:** _…_

### Q8 – Cloudflare account
Do you have a Cloudflare account with Pages and D1 enabled, and a `wrangler.toml` project name
already decided?

> **Answer:** _…_

---

## Settled Decisions

_(Moved here from Open Questions once answered)_

- Display ID format: `<8-char owner-id>-<12-char display-id>`, alphanumeric only.
- Backend is Cloudflare Pages Functions (no separate Worker).
- No authentication in v1.
- D1 for persistence; migrations managed by Wrangler.
- TypeScript throughout; shared types in `src/lib/types.ts`.
- Frontend talks only to `/api/` routes — never directly to D1 or Trafiklab.
