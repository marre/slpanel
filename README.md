# SLPanel

SLPanel is a Cloudflare Worker and React Router SPA for building Stockholm SL-style departure displays.
The repository now includes the full Phase 2 foundation: frontend scaffold, Worker entry, Tailwind styling,
linting, formatting, testing, and CI.

## Stack

- Cloudflare Workers + Wrangler
- Hono for `/api/*` routes
- React 19 + React Router 7 + TypeScript
- Vite 7
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

- `npm run dev` starts the frontend and Worker together
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

- `/` foundation overview
- `/config` config UI shell
- `/display/:displayId` public display shell
- `/api/health` Worker health endpoint
- `/api/displays` display CRUD root
- `/api/displays/:id` single display CRUD route
- `/api/stops/search` stop search adapter
- `/api/departures/:siteId` normalized departures adapter

## API notes

- Display CRUD is backed by D1 and stores line, direction, and transport-mode filters explicitly.
- The Trafiklab provider lives behind a replaceable adapter boundary in the Worker.
- The stop search adapter currently fetches `/sites` and applies local filtering because the live API host does not appear to honor search query parameters consistently.

## CI

GitHub Actions runs `lint`, `test`, `format`, and `build` on pushes to `main` and on pull requests.
