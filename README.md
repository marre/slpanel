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
- `npm run deploy` builds and deploys with Wrangler

## D1 setup

`wrangler.jsonc` already includes the Worker and static-asset setup.
The D1 binding block is intentionally commented out until a real database exists.

When you are ready to add D1:

1. Run `wrangler d1 create slpanel`
2. Copy the generated `database_id` into `wrangler.jsonc`
3. Uncomment the `d1_databases` block

## Current routes

- `/` foundation overview
- `/config` config UI shell
- `/display/:displayId` public display shell
- `/api/health` Worker health endpoint

## CI

GitHub Actions runs `lint`, `test`, `format`, and `build` on pushes to `main` and on pull requests.
