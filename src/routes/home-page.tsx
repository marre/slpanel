import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="space-y-8">
      <div className="home-hero rounded-lg px-6 py-10 md:px-12 md:py-16">
        <p className="mb-3 font-semibold text-[var(--panel-text)]">
          Your transit display, connected
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
          Real-time SL transit displays
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted-text)]">
          The next departure, at a glance. Choose your stop, personalise your
          board, and bring live departures to your panel.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/config"
            className="rounded border border-[var(--panel-text)] bg-[var(--panel-text)] px-6 py-3 font-semibold text-white transition hover:bg-[var(--panel-text-soft)]"
          >
            Set up a display <span aria-hidden="true">→</span>
          </Link>
          <Link
            to="/display/demo-board"
            className="rounded border border-[var(--panel-text)] bg-white px-6 py-3 font-semibold text-[var(--panel-text)] transition hover:bg-sky-50"
          >
            Try the demo board <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
      <div>
        <h2 className="mb-5 text-2xl font-bold md:text-3xl">
          Get your panel ready
        </h2>
        <div className="grid gap-5 md:grid-cols-2">
          <Link to="/config" className="action-card">
            <span className="text-sm font-semibold text-[var(--panel-text)]">
              1. Choose your departures
            </span>
            <h3 className="mt-3 text-2xl font-bold">
              My displays <span aria-hidden="true">→</span>
            </h3>
            <p className="mt-3 leading-7 text-[var(--muted-text)]">
              Find a stop, select lines and directions, and preview your board
              before saving.
            </p>
          </Link>
          <Link to="/device" className="action-card">
            <span className="text-sm font-semibold text-[var(--panel-text)]">
              2. Bring your board to life
            </span>
            <h3 className="mt-3 text-2xl font-bold">
              Connect USB device <span aria-hidden="true">→</span>
            </h3>
            <p className="mt-3 leading-7 text-[var(--muted-text)]">
              Connect your panel, set up Wi-Fi, and link it to a saved display.
            </p>
          </Link>
        </div>
      </div>
    </section>
  );
}
