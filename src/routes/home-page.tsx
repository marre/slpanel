import { Link } from 'react-router-dom';

import { PanelPreview } from '@/components/panel-preview';

export function HomePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
      <section className="space-y-6">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
            Overview
          </p>
          <div className="space-y-3">
            <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-5xl">
              Real-time SL transit displays
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
              Create and share live departure boards for any SL stop. Filter by
              line and direction, and the board auto-refreshes so you always see
              the latest departures.
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
            to="/display/demo-board?renderer=interstate75&runtime=pyscript"
            className="rounded-full border border-[#84d8ff]/50 bg-[#84d8ff]/8 px-5 py-3 text-sm font-medium text-[#b9edff] transition hover:border-[#84d8ff]/80 hover:bg-[#84d8ff]/14"
          >
            PyScript preview
          </Link>
        </div>
      </section>

      <aside className="space-y-4 rounded-[2rem] border border-[var(--panel-border)] bg-black/20 p-5">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted-text)]">
            Panel preview
          </p>
          <h3 className="text-xl font-semibold text-[var(--panel-text)]">
            See it in action
          </h3>
          <p className="text-sm leading-6 text-[var(--muted-text)]">
            A live preview of how your display board looks — the same view your
            audience will see.
          </p>
        </div>

        <PanelPreview />
      </aside>
    </div>
  );
}
