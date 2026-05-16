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
  display_id  TEXT NOT NULL UNIQUE,    -- globally unique 12-char display identifier
  name        TEXT NOT NULL DEFAULT '',
  site_id     TEXT,                    -- Trafiklab SiteId (stop)
  site_name   TEXT,                    -- human-readable stop name
  refresh_interval INTEGER NOT NULL DEFAULT 30,  -- seconds between departure refreshes
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_displays_owner_display ON displays(owner_id, display_id);
CREATE INDEX idx_displays_owner ON displays(owner_id);
```

---

## API Routes

### Displays resource

| Method | Path | Body / Params | Description |
|---|---|---|---|
| `GET` | `/api/displays?owner=<owner_id>` | — | List displays for owner |
| `POST` | `/api/displays` | `{ owner_id, name?, site_id?, site_name?, refresh_interval? }` | Create display (generates display_id) |
| `GET` | `/api/displays/:id` | — | Get single display |
| `PUT` | `/api/displays/:id` | `{ name?, site_id?, site_name?, refresh_interval? }` | Update display |
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

### Phase 2 – Project Setup ✅
- [x] Initialise Vite + React + TypeScript project (`npm create vite@latest`)
- [x] Add Wrangler and configure `wrangler.toml` for Cloudflare Pages + D1
- [x] Write `migrations/0001_initial.sql` (schema above)
- [x] `tsconfig.json`, ESLint, Prettier
- [x] `npm run dev` / `npm run build` / `npm run deploy` scripts
- [x] Basic Vitest setup

### Phase 3 – Backend API ✅
- [x] Pages Function: `GET /api/displays?owner=`
- [x] Pages Function: `POST /api/displays`
- [x] Pages Function: `GET/PUT/DELETE /api/displays/:id`
- [x] Pages Function: `GET /api/stops/search?q=`
- [x] Pages Function: `GET /api/departures/:siteId`
- [x] Wrangler secrets workflow documented for future Trafiklab API keys (not required in v1)
- [x] Unit tests for helper functions

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

**Researched answer:**

Use the **SL Transport API** (`transport.integration.sl.se`) — the new unified SL API that replaced
the old Realtidsinformation v4 and Platsuppslag v2 endpoints in March 2024.

Key facts:
- **No API key required** — the endpoints are open/public.
- **No officially enforced rate limits**, but Trafiklab asks you not to make excessive requests.
- **Stop search:** `GET https://transport.integration.sl.se/v1/sites?expand=true&q=<text>`
- **Departures:** `GET https://transport.integration.sl.se/v1/sites/{siteId}/departures`
- Responses are JSON; `siteId` is a numeric string (e.g. `"9180"` for T-Centralen).

Since no API key is needed for v1, `TRAFIKLAB_*` secrets are **not required** in the initial
implementation. The secrets table in AGENT.md can be left empty for now and filled in only if we
later switch to a key-gated API tier.

> **Answer:** SL Transport API (no key needed). See details above.

### Q2 – Departure board content
What information should each departure row show?

> **Answer:** Each row shows the **primary departure** (next departure for that line/direction):
> - Line number (e.g. "17", "T14", "474")
> - Destination
> - Time left until departure (minutes)
>
> On the second line of the same row: the **next 3 following departures** (time left only, compact).
>
> Example layout:
> ```
> 17   Centralstationen     3 min
>      9   15   22
> ```

### Q3 – Multiple stops per display
Should a single display be able to show departures from **more than one stop** (e.g. both directions
of a street stop)?

> **Answer:** _…_ (not yet answered — deferred to a later phase)

### Q4 – Departure filtering
Should the config UI allow filtering by line number, direction, or transport mode?

> **Answer:** Yes — all of the above. The config UI will allow filtering by:
> - Line number
> - Direction / destination
> - Transport mode (metro, bus, tram, train, etc.)
>
> Filters will be stored as part of the display config and applied on the backend before returning
> departures.

### Q5 – Auto-refresh interval
How often should the display page refresh departure data?

> **Answer:** Default **30 seconds**. The interval is configurable per display (stored as
> `refresh_interval` in the `displays` table, in seconds).

### Q6 – Owner-id UX
Should the owner-id be:
a) Shown once after generation and stored in `localStorage`?
b) Always entered manually by the user?
c) Both (generate + remember in localStorage, but allow manual override)?

> **Answer:** **b) Always entered manually.** No localStorage, no auto-generation in v1.
> The config page will show a text field where the user types their 8-character owner-id.

### Q7 – Display board look & feel
Any specific styling preferences?

> **Answer:** The display should **mirror the look of the physical T-Skylt X product**:
> - Dark background (black or very dark grey)
> - **Pixelated / dot-matrix font** (e.g. "Press Start 2P" from Google Fonts, or a custom bitmap
>   font similar to the Stockholms Lokaltrafik departure board typeface)
> - High-contrast amber/orange or white text on dark background
> - Minimalist layout — no decorative elements, just the data

### Q8 – Cloudflare account
Do you have a Cloudflare account with Pages and D1 enabled, and a `wrangler.toml` project name
already decided?

> **Answer:** Yes. **How to keep secrets out of GitHub:**
>
> **For local development** — create a `.dev.vars` file in the project root (never commit it):
> ```ini
> # .dev.vars  (git-ignored)
> TRAFIKLAB_KEY=your_key_here
> ```
> Add `.dev.vars` to `.gitignore`. Wrangler automatically picks this up when running
> `wrangler pages dev`.
>
> **For production (Cloudflare Pages)** — set secrets via the Wrangler CLI (they are stored in
> Cloudflare, never in the repo):
> ```sh
> wrangler secret put TRAFIKLAB_KEY
> ```
> Or set them in the Cloudflare Dashboard → Pages project → Settings → Environment Variables →
> mark as "Secret".
>
> **Note:** Since the SL Transport API requires no key in v1, no secrets are needed for the initial
> deployment. The `.dev.vars` pattern is documented here for when secrets are introduced later.

---

## Settled Decisions

_(Moved here from Open Questions once answered)_

- Display ID format: `<8-char owner-id>-<12-char display-id>`, alphanumeric only.
- Backend is Cloudflare Pages Functions (no separate Worker).
- No authentication in v1.
- D1 for persistence; migrations managed by Wrangler.
- TypeScript throughout; shared types in `src/lib/types.ts`.
- Frontend talks only to `/api/` routes — never directly to D1 or Trafiklab.
- `display_id` column is globally `UNIQUE`; `(owner_id, display_id)` pair also has a `UNIQUE` index.
- No `config` JSON blob in the schema — individual columns are used for all configurable fields.
- SL Transport API (`transport.integration.sl.se`) — no API key required in v1.
- Departure board layout: line number + destination + time-left on primary row; next 3 times compact on the second row.
- Filters (line, direction, mode) will be stored per display and applied server-side.
- Refresh interval default: 30 s, configurable per display (`refresh_interval` column).
- Owner-id is always entered manually; no localStorage auto-save in v1.
- Display UI mirrors T-Skylt X: dark background, pixelated/dot-matrix font, amber/white text.
- Secrets management: `.dev.vars` (gitignored) for local dev; `wrangler secret put` for production.
