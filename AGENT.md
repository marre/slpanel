# AGENT.md

## Status

- Implemented Vue SPA and Hono API, deployed together on Cloudflare Workers.
- `PLAN.md` describes the architecture; inspect current code when planning changes.

## Target stack

- Cloudflare Workers
- Cloudflare D1
- Vue Router 4
- Vue 3 + TypeScript + Nuxt UI 4
- Vite 8 (requires Node.js 20.19+ or 22.12+)
- Hono for `/api/*`
- Tailwind CSS
- Trafiklab SL Transport API v3 (`https://transport.integration.sl.se/v1`) — no API key required

## Key product rules

- No auth in v1.
- Frontend talks only to `/api/*`.
- Browser never calls Trafiklab directly.
- Owner id is entered manually in v1.
- Default refresh interval is 30 seconds.
- No backend caching in v1.
- UI should use an old-style transit-board look.
- API responses must be shaped for SLPanel, not raw upstream payloads.
- Keep transit-provider integrations behind a replaceable adapter boundary.

## Data model direction

- `owners` table
- `displays` table with `owner_id` foreign key
- a single selected stop per display
- explicit stop/line configuration per display
- Explicit filter tables for line, direction, and mode
- No generic JSON config blob
- Prefer one initial migration while nothing is deployed

## Display hardware target

- Physical target: **128×32 pixel LED matrix panel**.
- Web prototype must use the same 128×32 px canvas (scale up with CSS `transform: scale(N)` for visibility).
- Use `image-rendering: pixelated`, `font-smooth: never`.
- Font: **custom SL bitmap renderer** — `src/font/sl-font.ts` (93 glyphs, proportional, CC0-compatible, supports åäö Å Ä Ö) + `src/font/sl-font-renderer.ts`. No TTF/WOFF2 required.
  - Glyph shapes traced from [zmullett/Stockholm-SL-sign-font](https://github.com/zmullett/Stockholm-SL-sign-font). The name "Widgrens" (attributed to Bo Widgren) that appeared in earlier planning notes has no verifiable primary source.
  - 2-row layout: `scale: 2` (20 px cells).
  - 4-row layout: `scale: 1` (10 px cells).

## Planning expectations

When updating the plan:
- prefer Cloudflare Workers over Pages
- keep the plan implementation-oriented
- include CI, testing, deploy, and observability work
- keep architecture and API contracts concrete
- treat the display frontend as a SPA
- use Nuxt UI components and Tailwind CSS; preserve the established light theme

## Change discipline

- Make the smallest change that satisfies the request.
- Keep docs concise and current.
- If implementation is requested later, follow `PLAN.md`.

## Frontend conventions

- Use Vue single-file components with `<script setup lang="ts">`, typed props/emits and `v-model`.
- Use Vue Router and lazy route components. Use Nuxt UI’s Vite integration; this is a SPA, not a Nuxt server.
- Keep transport, polling and canvas lifecycle logic in composables; abort requests and dispose timers/USB connections with the component scope.
- Keep nonreactive class instances in `shallowRef`. Use `computed` for derived UI state.
- Test user behavior with Vue Testing Library and actual Nuxt UI components, including keyboard interaction with popovers.
- Run lint, tests, formatting and build before submitting changes.
