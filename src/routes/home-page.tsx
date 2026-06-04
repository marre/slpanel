export function HomePage() {
  return (
    <div className="grid gap-8 lg:items-start">
      <section className="space-y-6">
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
            Overview
          </p>
          <div className="space-y-6">
            <h2 className="max-w-3xl text-3xl font-semibold leading-tight text-[var(--panel-text)] md:text-5xl">
              Real-time SL transit displays
            </h2>
            <p className="max-w-3xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
              Create and share live departure boards for any SL stop. Filter by
              line and direction, and the board auto-refreshes so you always see
              the latest departures.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
