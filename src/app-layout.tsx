import { useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Overview' },
  { to: '/config', label: 'My displays' },
  { to: '/device', label: 'USB device' },
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <div className="bg-[#16191c] text-white">
        <div className="mx-auto max-w-7xl px-5 py-2 text-xs md:px-8">
          Your own departure board · Independent project using SL transit data
        </div>
      </div>
      <header className="bg-[var(--panel-text)] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5 md:px-8 md:py-7">
          <NavLink
            to="/"
            className="flex items-center gap-3"
            aria-label="SLPanel overview"
            onClick={() => setMenuOpen(false)}
          >
            <span
              aria-hidden="true"
              className="grid size-12 place-items-center rounded-full border-2 border-white text-lg font-bold"
            >
              SP
            </span>
            <span className="text-2xl font-bold tracking-tight">SLPanel</span>
          </NavLink>
          <button
            ref={menuButton}
            type="button"
            className="rounded border border-white/70 px-4 py-2 font-semibold md:hidden"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? 'Close menu' : 'Menu'}
          </button>
          <nav
            id="primary-navigation"
            aria-label="Primary"
            className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-1 md:flex md:w-auto md:flex-row md:gap-4`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setMenuOpen(false);
                menuButton.current?.focus();
              }
            }}
          >
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `border-b-4 px-3 py-3 text-lg font-semibold transition hover:bg-white/10 ${isActive ? 'border-white' : 'border-transparent'}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10"
      >
        <Outlet />
      </main>
      <footer className="mt-8 border-t border-[var(--panel-border)] bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-4 px-5 py-8 text-sm text-[var(--muted-text)] md:px-8">
          <p>SLPanel · Your transit display, connected</p>
          <p>Independent project. Not affiliated with SL.</p>
        </div>
      </footer>
    </div>
  );
}
