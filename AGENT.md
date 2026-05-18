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
- UI should visually mirror T-Skylt X.
- API responses must be shaped for SLPanel, not raw upstream payloads.

## Data model direction

- `owners` table
- `displays` table with `owner_id` foreign key
- Explicit filter tables for line, direction, and mode
- No generic JSON config blob

## Planning expectations

When updating the plan:
- prefer Cloudflare Workers over Pages
- keep the plan implementation-oriented
- include CI, testing, deploy, and observability work
- keep architecture and API contracts concrete

## Change discipline

- Make the smallest change that satisfies the request.
- Keep docs concise and current.
- If implementation is requested later, follow `PLAN.md`.
