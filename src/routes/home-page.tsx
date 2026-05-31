import { Link } from 'react-router-dom';

import { PanelPreview } from '@/components/panel-preview';

const checkpoints = [
  'Owner-based config workspace wired to the Worker API',
  'Public display board now loads one display and live departures',
  'Stop search plus line, direction, and mode filters',
  'Auto-refresh and 2-row marquee board on /display/:displayId',
  'Hono + D1 backend with migrations and typed frontend helpers',
  'Tailwind, ESLint, Prettier, Vitest, and CI all active',
];

export function HomePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
      <section className="space-y-6">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
            Phase 5 display UI
          </p>
          <div className="space-y-3">
            <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-5xl">
              The display board is live, and owners can already publish an
              SL-style screen from the browser.
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
              Phase 5 now includes a real public board route: it loads one
              display configuration, fetches filtered departures, renders the
              custom bitmap font on a 128x32 panel, and keeps the marquee moving
              while the data refreshes automatically.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/config"
            className="rounded-full border border-[var(--panel-text)] bg-[var(--panel-text)] px-5 py-3 text-sm font-medium text-black transition hover:bg-[var(--panel-text-soft)]"
          >
            Open config workspace
          </Link>
          <Link
            to="/display/demo-board"
            className="rounded-full border border-[var(--panel-border)] px-5 py-3 text-sm font-medium text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/60 hover:bg-[var(--panel-text)]/8"
          >
            Open demo board
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {checkpoints.map((item) => (
            <div
              key={item}
              className="rounded-[1.5rem] border border-[var(--panel-border)] bg-black/15 px-4 py-4 text-sm leading-6 text-[var(--muted-text)]"
            >
              {item}
            </div>
          ))}
        </div>
      </section>

      <aside className="space-y-4 rounded-[2rem] border border-[var(--panel-border)] bg-black/20 p-5">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-text)]">
            Panel preview
          </p>
          <h3 className="text-xl font-semibold text-[var(--panel-text)]">
            Same board, same bitmap renderer
          </h3>
          <p className="text-sm leading-6 text-[var(--muted-text)]">
            The landing-page preview now reuses the live board component, so the
            public route and the preview share the same rendering path.
          </p>
        </div>

        <PanelPreview />
      </aside>
    </div>
  );
}
