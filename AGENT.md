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

## Repository Layout

```
slpanel/
├── .github/workflows/         # CI pipelines
├── AGENT.md                  # This file
├── PLAN.md                   # Architecture and phased plan
├── wrangler.toml             # Cloudflare Pages / D1 config
├── package.json
├── vite.config.ts
├── tsconfig.json
├── migrations/               # Wrangler D1 SQL migrations
│   ├── 0001_initial.sql
│   └── 0002_owners.sql
├── functions/                # Cloudflare Pages Functions (API routes)
│   ├── _lib/
│   │   ├── displays.ts       # D1 helpers for display CRUD
│   │   ├── http.ts           # JSON/route helpers
│   │   ├── trafiklab.ts      # Upstream SL Transport API helpers
│   │   └── validation.ts     # Request validation helpers
│   └── api/
│       ├── departures/
│       │   └── [siteId].ts   # GET live departures for a site
│       ├── displays/
│       │   ├── index.ts      # GET list, POST create
│       │   └── [id].ts       # GET, PUT, DELETE single display
│       └── stops/
│           └── search.ts     # GET stop search results
└── src/                      # React frontend
    ├── main.tsx
    ├── App.tsx
    └── lib/
        ├── api.ts            # Typed fetch wrappers for the API
        └── types.ts          # Shared domain types
```

---

## ID Scheme

Display IDs follow the format `<owner-id>-<display-id>`:

 - **owner-id** – 8 alphanumeric characters (upper/lower case + digits), entered manually in v1.
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
| `GET` | `/api/departures/:siteId` | Fetch and normalize live departures into an SLPanel-specific payload |
| `GET` | `/api/stops/search?q=<query>` | Search and normalize stop results into an SLPanel-specific payload |

Upstream base URL: `https://transport.integration.sl.se/v1`  
No API key required for v1.

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

Current schema highlights:

- `owners.id` is the canonical owner identifier.
- `displays.owner_id` must reference an existing `owners.id`.
- Creating a display should ensure the owning row exists before inserting into `displays`.

---

## Development

```sh
# Install deps
npm install

# Local frontend dev
npm run dev

# Preview the built app locally
npm run build
npx wrangler pages dev dist

# Build
npm run build

# Test
npm run test

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

## Cloudflare Setup Guide

This section describes the one-time steps to configure the Cloudflare account for SLPanel.

### Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is sufficient).
- [Node.js](https://nodejs.org/) ≥ 18 and `npm` installed locally.
- Wrangler CLI installed globally or via `npx`:
  ```sh
  npm install -g wrangler
  wrangler login   # opens browser, authenticates with your Cloudflare account
  ```

### 1 – Create the D1 database

```sh
wrangler d1 create slpanel-db
```

Copy the `database_id` printed by the command — you'll need it in `wrangler.toml`.

### 2 – Create `wrangler.toml`

Create `wrangler.toml` in the project root (this file is safe to commit — it contains no secrets):

```toml
name = "slpanel"          # must match the Cloudflare Pages project name
compatibility_date = "2024-09-23"
pages_build_output_dir = "dist"

[[d1_databases]]
binding = "DB"            # accessed as env.DB in Pages Functions
database_name = "slpanel-db"
database_id = "<paste-database_id-here>"
```

### 3 – Apply D1 migrations

```sh
# Apply to the remote (production) database
wrangler d1 migrations apply slpanel-db

# Apply to the local dev database
wrangler d1 migrations apply slpanel-db --local
```

### 4 – Create the Cloudflare Pages project

**Option A – via the Dashboard (recommended for first-time):**

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** →
   **Pages** → **Connect to Git**.
2. Authorise Cloudflare to access your GitHub account and select the `slpanel` repository.
3. Set the build configuration:
   - **Framework preset:** None (Vite)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Click **Save and Deploy**.

**Option B – via Wrangler CLI:**

```sh
# The first `wrangler pages deploy dist` from a linked repo creates the project automatically.
npm run build
wrangler pages deploy dist --project-name=slpanel
```

### 5 – Link the D1 database to the Pages project

In the Cloudflare Dashboard:

1. Open the **slpanel** Pages project → **Settings** → **Functions**.
2. Under **D1 database bindings**, add:
   - **Variable name:** `DB`
   - **D1 database:** `slpanel-db`
3. Click **Save**.

Or with Wrangler (after the project exists):

```sh
# The binding is already declared in wrangler.toml; Wrangler picks it up on the next deploy.
wrangler pages deploy dist --project-name=slpanel
```

### 6 – Set secrets (when needed)

Secrets are stored securely in Cloudflare and injected at runtime — they never appear in the repo.

**Via CLI:**
```sh
wrangler secret put TRAFIKLAB_KEY --project-name=slpanel
# prompts for the value; it is encrypted and stored in Cloudflare
```

**Via Dashboard:**
Pages project → **Settings** → **Environment Variables** → **Add variable** → tick **Encrypt**.

For local development create a `.dev.vars` file (gitignored):
```ini
# .dev.vars  — loaded automatically by `wrangler pages dev`
TRAFIKLAB_KEY=your_key_here
```

> **Note:** No secrets are required for the initial v1 deployment because the SL Transport API is
> open and requires no key.

### 7 – Continuous deployment

Once the GitHub repository is connected (Step 4, Option A), every push to `main` triggers an
automatic build and deploy via Cloudflare Pages CI.

Preview deployments are created automatically for every pull request.

---

## Environment Variables / Secrets

The **SL Transport API requires no API key** in v1, so no secrets are needed for initial deployment.

When secrets are introduced later, use:

| Name | Where | Description |
|---|---|---|
| `TRAFIKLAB_KEY` | Wrangler secret | API key for a future gated Trafiklab tier (not needed in v1) |

See the [Cloudflare Setup Guide](#cloudflare-setup-guide) above (Step 6) for the full workflow.

---

## Testing

- Unit tests: Vitest (`npm run test`)
- API integration tests: target `wrangler pages dev` with local D1

---

## Questions / Decisions Log

Open questions are tracked in `PLAN.md`. Once answered they are moved here as settled decisions.
