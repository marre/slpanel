import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Overview' },
  { to: '/config', label: 'Config' },
  { to: '/display/demo-board', label: 'Display' },
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8 md:px-8 lg:px-10">
        <header className="rounded-[2rem] border border-[var(--panel-border)] bg-[var(--card-bg)]/80 px-6 py-5 shadow-[0_0_0_1px_rgba(255,165,0,0.04),0_24px_64px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted-text)]">
                Stockholm display board
              </p>
              <div>
                <h1 className="text-3xl font-semibold tracking-[0.08em] text-[var(--panel-text)] md:text-4xl">
                  SLPanel
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-[var(--muted-text)] md:text-base">
                  Create and share real-time departure boards for Stockholm
                  public transit.
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap gap-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'rounded-full border px-4 py-2 text-sm transition',
                      isActive
                        ? 'border-[var(--panel-text)] bg-[var(--panel-text)]/10 text-[var(--panel-text)]'
                        : 'border-[var(--panel-border)] text-[var(--muted-text)] hover:border-[var(--panel-text)]/50 hover:text-[var(--panel-text)]',
                    ].join(' ')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main className="flex-1 rounded-[2rem] border border-[var(--panel-border)] bg-[var(--card-bg)]/72 px-6 py-6 shadow-[0_24px_64px_rgba(0,0,0,0.4)] backdrop-blur md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
