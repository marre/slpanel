import { Link } from 'react-router-dom';

import { PanelPreview } from '@/components/panel-preview';

export function HomePage() {
  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
      <section className="space-y-6">
        <div className="space-y-6">
          <p className="text-[0.7rem] uppercase tracking-[0.22em] text-[var(--muted-text)]">
            Overview
          </p>
          <div className="space-y-6">
            <h2 className="max-w-3xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-5xl">
              Real-time SL transit displays
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
              Create and share live departure boards for any SL stop. Filter by
              line and direction, and the board auto-refreshes so you always
              see the latest departures.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/config"
            className="rounded-full border border-[var(--panel-text)] bg-[var(--panel-text)] px-5 py-3 text-sm font-medium text-black transition hover:bg-[var(--panel-text-soft)]"
          >
            Set up a display
          </Link>
          <Link
            to="/display/demo-board"
            className="rounded-full border border-[var(--panel-border)] px-5 py-3 text-sm font-medium text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/60 hover:bg-[var(--panel-text)]/8"
          >
            View demo board
          </Link>
          <Link
            to="/display/demo-board?renderer=interstate75"
            className="rounded-full border border-[#84d8ff]/50 bg-[#84d8ff]/8 px-5 py-3 text-sm font-medium text-[#b9edff] transition hover:border-[#84d8ff]/80 hover:bg-[#84d8ff]/14"
          >
            Interstate 75 W preview
          </Link>
        </div>
      </section>

      <figure className="min-w-0 space-y-3">
        <PanelPreview />
        <figcaption className="text-[0.7rem] uppercase tracking-[0.22em] text-[var(--muted-text)]">
          Live preview: Slussen, lines 17 and 18
        </figcaption>
      </figure>
    </div>
  );
}
