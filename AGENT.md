# AGENT.md

## Status

- This repository is currently **planning-only**.
- The previous prototype was removed on purpose.
- Do not reintroduce scaffold or implementation code unless the task explicitly asks for it.

## Target stack

- Cloudflare Workers
- Cloudflare D1
- React Router v7
- React + TypeScript
- Hono for `/api/*`
- Tailwind CSS
- Trafiklab SL Transport API

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

## Planning expectations

When updating the plan:
- prefer Cloudflare Workers over Pages
- keep the plan implementation-oriented
- include CI, testing, deploy, and observability work
- keep architecture and API contracts concrete
- treat the display frontend as a SPA
- use Tailwind CSS; add a component library only if it clearly helps

## Change discipline

- Make the smallest change that satisfies the request.
- Keep docs concise and current.
- If implementation is requested later, follow `PLAN.md`.
