import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Overview' },
  { to: '/config', label: 'Config' },
  { to: '/device', label: 'USB device' },
];

export function AppLayout() {
  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <header className="border-b border-[var(--panel-border)] bg-[var(--card-bg)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
          <NavLink
            to="/"
            className="flex items-center gap-3"
            aria-label="SLPanel overview"
          >
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-[var(--panel-text)] text-sm font-bold text-black"
            >
              SL
            </span>
            <h1 className="text-lg font-semibold tracking-tight">SLPanel</h1>
          </NavLink>
          <nav className="flex gap-1" aria-label="Primary">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/8 text-[var(--app-text)]' : 'text-[var(--muted-text)] hover:bg-white/5 hover:text-[var(--app-text)]'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
