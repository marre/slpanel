import { useParams } from 'react-router-dom';

export function DisplayPage() {
  const { displayId } = useParams();

  return (
    <section className="space-y-4">
      <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
        Display route shell
      </p>
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold text-[var(--panel-text)]">
          Display {displayId ?? 'unknown'} is ready for the public board UI.
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
          This placeholder route will become the 128×32 transit board with the
          next-train summary row and the scrolling departures marquee in Phase
          5.
        </p>
      </div>
    </section>
  );
}
