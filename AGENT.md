# AGENT.md – SLPanel Coding Agent Instructions

## Project Overview

SLPanel is an online SL (Stockholm Local transit) departure board display, similar to the physical
[T-Skylt X](https://shop.t-skylt.se/products/t-skylt-x) product. It is a Cloudflare Pages application
consisting of a React/Vite/TypeScript frontend and Cloudflare Pages Functions (Workers) backend, backed
by a Cloudflare D1 database.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript |
| Backend | Cloudflare Pages Functions (Hono or plain fetch handlers) |
| Database | Cloudflare D1 (SQLite) managed via Wrangler |
| Deployment | Cloudflare Pages |
| Transit data | [Trafiklab](https://www.trafiklab.se/sv/api/) – SL APIs |

---

## Repository Layout (target)

```
slpanel/
├── AGENT.md                  # This file
├── PLAN.md                   # Architecture and phased plan
├── wrangler.toml             # Cloudflare Pages / D1 config
├── package.json
├── vite.config.ts
├── tsconfig.json
├── migrations/               # Wrangler D1 SQL migrations
│   └── 0001_initial.sql
├── functions/                # Cloudflare Pages Functions (API routes)
│   └── api/
│       ├── displays/
│       │   ├── index.ts      # GET list, POST create
│       │   └── [id].ts       # GET, PUT, DELETE single display
│       └── departures/
│           └── [stationId].ts
└── src/                      # React frontend
    ├── main.tsx
    ├── App.tsx
    ├── pages/
    │   ├── ConfigPage.tsx    # Admin / config UI
    │   └── DisplayPage.tsx   # Public departure board UI
    ├── components/
    └── lib/
        ├── api.ts            # Typed fetch wrappers for the API
        └── types.ts          # Shared domain types
```

---

## ID Scheme

Display IDs follow the format `<owner-id>-<display-id>`:

- **owner-id** – 8 alphanumeric characters (upper/lower case + digits), randomly generated once per
  "user" (stored client-side or entered manually).
- **display-id** – 12 alphanumeric characters (upper/lower case + digits), randomly generated per
  display.
- Full example: `aB3xZ9kQ-fG7mNpQr2wLt`

Security is entirely based on possession of these IDs — there is no authentication layer initially.

---

## API Contract

The backend exposes a JSON REST API under `/api/`. Both the web frontend and future hardware clients
consume this API.

### Displays

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/displays?owner=<owner-id>` | List all displays for an owner |
| `POST` | `/api/displays` | Create a new display |
| `GET` | `/api/displays/:id` | Get display config |
| `PUT` | `/api/displays/:id` | Update display config |
| `DELETE` | `/api/displays/:id` | Delete display |

### Departures

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/departures/:siteId` | Fetch live departures from Trafiklab |
| `GET` | `/api/stops/search?q=<query>` | Search for SL stops |

---

## Database

Migrations live in `migrations/` and are applied with:

```sh
wrangler d1 migrations apply slpanel-db
```

Local development uses:

```sh
wrangler d1 migrations apply slpanel-db --local
```

---

## Development

```sh
# Install deps
npm install

# Local dev (Pages dev server with D1)
npx wrangler pages dev --d1=DB -- npx vite

# Or using the convenience script
npm run dev

# Build
npm run build

# Deploy
npm run deploy
```

---

## Key Conventions

1. **TypeScript everywhere** – no `any`, use shared types from `src/lib/types.ts`.
2. **API is the contract** – the frontend must only talk to `/api/` routes, never directly to D1 or
   Trafiklab from the browser.
3. **Migrations via Wrangler** – never modify the database schema by hand; always create a new
   migration file.
4. **No auth in v1** – do not add authentication middleware; keep it out of scope.
5. **Minimal dependencies** – prefer Web Platform APIs and what Cloudflare provides over heavy npm
   packages.
6. **Clean separation** – UI pages (`ConfigPage`, `DisplayPage`) import only from `src/lib/api.ts`;
   they must not contain raw `fetch` calls or SQL.

---

## Environment Variables / Secrets

| Name | Where | Description |
|---|---|---|
| `TRAFIKLAB_REALTIME_KEY` | Wrangler secret | API key for Trafiklab SL Realtidsinformation |
| `TRAFIKLAB_STOP_LOOKUP_KEY` | Wrangler secret | API key for Trafiklab stop-lookup (Platssök) |

Set locally with:

```sh
echo "MY_KEY" | wrangler secret put TRAFIKLAB_REALTIME_KEY
```

---

## Testing

- Unit tests: Vitest (`npm run test`)
- API integration tests: target `wrangler pages dev` with local D1

---

## Questions / Decisions Log

Open questions are tracked in `PLAN.md`. Once answered they are moved here as settled decisions.
