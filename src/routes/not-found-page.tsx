import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="space-y-4">
      <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
        Route not found
      </p>
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold text-[var(--panel-text)]">
          That page is outside the current scaffold.
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
          The Worker and SPA fallback are in place, but only the overview,
          config, and display shell routes exist right now.
        </p>
      </div>
      <Link
        to="/"
        className="inline-flex rounded-full border border-[var(--panel-text)] px-5 py-3 text-sm font-medium text-[var(--panel-text)] transition hover:bg-[var(--panel-text)]/8"
      >
        Return to overview
      </Link>
    </section>
  );
}
