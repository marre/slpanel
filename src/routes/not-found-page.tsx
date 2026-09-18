import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <section className="space-y-4">
      <p className="text-[0.7rem] uppercase tracking-[0.22em] text-[var(--muted-text)]">
        Page not found
      </p>
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold text-[var(--panel-text)]">
          That board does not exist.
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
          Check the link or return to the overview to pick a display.
        </p>
      </div>
      <Link
        to="/display/demo-board"
        className="inline-flex rounded-full border border-[var(--panel-border)] px-5 py-3 text-sm font-medium text-[var(--panel-text)] transition hover:border-[var(--panel-text)]/60 hover:bg-[var(--panel-text)]/8"
      >
        View demo board
      </Link>
    </section>
  );
}
