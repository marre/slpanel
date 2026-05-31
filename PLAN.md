# PLAN.md – SLPanel Replan

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
 owner-id:   8 alphanumeric (lower and upper case) characters
 display-id: 12 alphanumeric (lower and upper case) characters
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
  refresh_interval INTEGER NOT NULL DEFAULT 30
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

### Display font

The dot-matrix display uses a **custom SL bitmap font** implemented directly in TypeScript as pixel-row data.

#### Origin

The glyph shapes are based on [zmullett/Stockholm-SL-sign-font](https://github.com/zmullett/Stockholm-SL-sign-font), a community digitisation of the Stockholm T-bana dot-matrix signs. That repository contains no font name and no designer attribution — it is purely the pixel patterns traced from real signs. The original display font has no known public name; a previous version of this document claimed it was called "Widgrens" by designer Bo Widgren, but no primary source for that name has been found and it should be treated as unverified.

#### Implementation

The font is implemented as a canvas renderer (no TTF/WOFF2 required):

| File | Purpose |
|---|---|
| `src/font/sl-font.ts` | 93 glyph definitions — 10-row cells, 7 descender characters (g j p q y , ;), full ASCII + å ä ö Å Ä Ö |
| `src/font/sl-font-renderer.ts` | `measureText`, `renderText`, `renderTextLine`, `cellHeight` — paint directly to `CanvasRenderingContext2D` |

#### Character cell

- Normal body: **10 rows** tall. Each row string is as wide as the glyph (proportional — character widths vary).
- Descenders: 12 rows (2 extra below the baseline) for `g j p q y , ;`.
- Scale factor multiplies every font pixel: `scale: 1` → 10 px tall, `scale: 2` → 20 px tall.

#### Layout usage

| Layout | Scale | Cell height | Board rows |
|---|---|---|---|
| 2-row | 2 | 20 px | 1 row = 16 px usable; minor clipping acceptable |
| 4-row | 1 | 10 px | 1 row = 8 px usable; minor clipping acceptable |

#### Colour

- Foreground (lit pixels): amber `#FF9900` (matches classic SL LED amber boards).
- Background: black `#000000` — the canvas is cleared to black before each render.

#### Example

```ts
import { renderText, measureText } from '@/font/sl-font-renderer';

// Paint "17  Centralstationen  3 min" onto a 128×32 canvas
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, 128, 32);
renderText(ctx, '17', 0, 1, { scale: 1, color: '#FF9900' });
renderText(ctx, 'Centralstationen', 14, 1, { scale: 1 });
const timeW = measureText('3 min', { scale: 1 });
renderText(ctx, '3 min', 128 - timeW, 1, { scale: 1 });
```

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

Design the default display to match a standard **SL subway platform display** with **2 rows total** on the 128×32 panel.

#### Row 1: next departure summary

The first row shows the **very next train only**.

- Left: line number, for example `17`
- Middle: destination, for example `Hagsätra`
- Right: countdown text, right-aligned, for example `1 min`

Visual rules:

- Keep the line number visually tight to the left edge.
- Keep the minutes text right-justified against the panel edge.
- Let the destination consume the remaining middle space.
- Preserve the classic SL look: black background, amber or white dot-matrix text, minimal decoration.

Example:

```text
17 Hagsätra          1 min
```

#### Row 2: scrolling departures and messages

The second row is a **single marquee line** that scrolls continuously from **right to left**.

Content order:

1. Show the same compact format for the **next 3 following trains**
2. Optionally append warning text, service notices, or other public information after those trains
3. When the final character has completely scrolled off the left side, restart the marquee from the beginning

Each train entry in the marquee should use this compact pattern:

```text
<line number> <destination> <minutes>
```

Use clear spacing between entries so they remain readable while scrolling.

Example marquee content before scrolling is applied:

```text
17 Hagsätra 5 min     18 Someplace 7 min     19 Elsewhere 12 min     Warning: track change at T-Centralen
```

Scrolling behaviour:

- The marquee text should enter from the right.
- It should move left at a steady, readable speed.
- The full message must scroll through before restarting.
- Restart from the first train entry after the final appended message has fully exited.

#### Agent handoff note

Treat this as the canonical visual behaviour for the default display mode.
If an implementation detail is still ambiguous, ask targeted follow-up questions using the GitHub Copilot query UI.

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

### Phase 1 – Planning ✅
- [x] Document the target architecture

### Phase 2 – Foundation
- [x] Scaffold React Router v7 + TypeScript app with Vite 7 (Node.js 20.19+ or 22.12+)
- [x] Add Tailwind CSS
- [x] Decide whether to add a lightweight component library for admin/display primitives — no component library in Phase 2
- [x] Add Wrangler config for Cloudflare Workers + D1-ready binding placeholder
- [x] Add ESLint, Prettier, Vitest
- [x] Add `npm run dev`, `npm run build`, `npm run test`, `npm run deploy`
- [x] Add GitHub Actions CI

### Phase 3 – Worker API
- [x] Add Hono router for `/api/*`
- [x] Add a single initial D1 migration for `owners`, `displays`, and filter tables
- [x] Implement display CRUD
- [x] Implement transit-provider adapter boundary
- [x] Implement stop search adapter
- [x] Implement departures adapter with SLPanel-specific response shapes
- [x] Add unit tests for validation, D1 helpers, and Trafiklab adapters

### Phase 4 – Config UI
- [x] Landing page
- [x] Owner-id entry flow
- [x] Display list/create/edit/delete flows
- [x] Stop search UI
- [x] Display configuration fields for stop selection and line selection
- [x] Filter configuration UI (line, direction, mode)

### Phase 5 – Display UI
- [x] Display page for one display id
- [x] Auto-refresh using display `refresh_interval`
- [x] Old-style transit-board visual design
- [x] Web panel: fixed 128×32 px canvas with `image-rendering: pixelated`
- [x] Custom SL bitmap font — `src/font/sl-font.ts` (93 glyphs) + `src/font/sl-font-renderer.ts` (canvas renderer)
- [ ] 2-row and 4-row layout modes switchable per display configuration
- [x] Primary next-train row + scrolling departures and messages marquee
- [x] Loading, error, and empty states

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
- No component library is needed in Phase 2; revisit only if Phase 4 form work proves it valuable.
- No dedicated seed migration is required initially; revisit only if local development becomes painful.
- The display font is a **custom SL bitmap renderer** (`src/font/sl-font.ts` + `src/font/sl-font-renderer.ts`), not a web font. No TTF/WOFF2 needed. The name "Widgrens" (previously noted in this document) has no verifiable primary source and should be disregarded.
