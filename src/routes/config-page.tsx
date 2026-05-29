export function ConfigPage() {
  return (
    <section className="space-y-4">
      <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
        Config route shell
      </p>
      <div className="space-y-3">
        <h2 className="text-3xl font-semibold text-[var(--panel-text)]">
          Owner and display management will land here.
        </h2>
        <p className="max-w-2xl text-sm leading-7 text-[var(--muted-text)] md:text-base">
          Phase 2 stops at the scaffold. The route is ready for the owner-id
          flow, display CRUD, stop search, and filter forms planned for Phase 4.
        </p>
      </div>
    </section>
  );
}
