import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <section className="space-y-8 py-4 md:py-8">
      <div className="max-w-2xl space-y-4">
        <p className="text-sm font-medium text-[var(--muted-text)]">
          Your transit display, connected
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">
          Real-time SL transit displays
        </h2>
        <p className="text-base leading-7 text-[var(--muted-text)]">
          The departures you need, on your panel. Choose a stop and fine-tune
          your board, then connect your device to bring it to life.
        </p>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Link
          to="/config"
          className="group space-y-5 rounded-xl border border-[var(--panel-border)] bg-[var(--card-bg)] p-6 transition hover:border-[var(--panel-text)]/50"
        >
          <span className="text-xs font-medium text-[var(--muted-text)]">
            01 / Configure
          </span>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">
              Set up a display{' '}
              <span aria-hidden="true" className="text-[var(--panel-text)]">
                →
              </span>
            </h3>
            <p className="text-sm leading-6 text-[var(--muted-text)]">
              Manage stops, lines, and directions. See your changes immediately
              in the config preview.
            </p>
          </div>
        </Link>
        <Link
          to="/device"
          className="group space-y-5 rounded-xl border border-[var(--panel-border)] bg-[var(--card-bg)] p-6 transition hover:border-[var(--panel-text)]/50"
        >
          <span className="text-xs font-medium text-[var(--muted-text)]">
            02 / Connect
          </span>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">
              Connect USB device{' '}
              <span aria-hidden="true" className="text-[var(--panel-text)]">
                →
              </span>
            </h3>
            <p className="text-sm leading-6 text-[var(--muted-text)]">
              Set up Wi-Fi, link your board, and watch live device logs.
            </p>
          </div>
        </Link>
      </div>
    </section>
  );
}
