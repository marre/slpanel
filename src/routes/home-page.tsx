import { Link } from 'react-router-dom';

import { PanelPreview } from '@/components/panel-preview';

const checkpoints = [
  'Vite 7 + React + TypeScript scaffold',
  'React Router routes for overview, config, and display shells',
  'Hono worker entry ready for /api routes and static asset fallback',
  'Tailwind CSS, ESLint, Prettier, and Vitest wired into npm scripts',
  'GitHub Actions CI running lint, test, format, and build checks',
];

export function HomePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
      <section className="space-y-6">
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
            Phase 2 foundation
          </p>
          <div className="space-y-3">
            <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-5xl">
              A Worker-backed display shell with the transit-board tone already
              in place.
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
              The app shell is intentionally small: one SPA, one Worker entry,
              and enough tooling to start Phase 3 without reworking the build.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to="/config"
            className="rounded-full border border-[var(--panel-text)] bg-[var(--panel-text)] px-5 py-3 text-sm font-medium text-black transition hover:bg-[var(--panel-text-soft)]"
          >
            Open config shell
          </Link>
          <Link
            to="/display/demo-board"
            className="rounded-full border border-[var(--panel-border)] px-5 py-3 text-sm font-medium text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/60 hover:bg-[var(--panel-text)]/8"
          >
            Open display shell
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
            Bitmap renderer wired into the shell
          </h3>
          <p className="text-sm leading-6 text-[var(--muted-text)]">
            This is only a static preview, but it proves the existing SL font
            renderer fits cleanly into the new app foundation.
          </p>
        </div>

        <PanelPreview />
      </aside>
    </div>
  );
}
