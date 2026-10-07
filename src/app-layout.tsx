import { useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Overview' },
  { to: '/config', label: 'My displays' },
  { to: '/device', label: 'USB device' },
];

export function AppLayout() {
  const isHome = useLocation().pathname === '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="bg-[var(--panel-text)] text-white">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="relative flex h-24 items-center justify-end md:h-32">
            <NavLink
              to="/"
              className="absolute left-1/2 top-4 flex -translate-x-1/2 flex-col items-center gap-1 md:top-6"
              aria-label="SLPanel overview"
              onClick={() => setMenuOpen(false)}
            >
              <span
                aria-hidden="true"
                className="grid size-12 place-items-center rounded-full border-[3px] border-white text-xl font-bold md:size-16 md:text-2xl"
              >
                SP
              </span>
              <span className="text-xs font-semibold tracking-wide md:text-sm">
                SLPanel
              </span>
            </NavLink>
            <button
              ref={menuButton}
              type="button"
              className="flex items-center gap-3 rounded px-2 py-3 text-lg transition hover:bg-white/10 md:text-xl"
              aria-expanded={menuOpen}
              aria-controls="primary-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span>{menuOpen ? 'Close' : 'Menu'}</span>
              <svg
                aria-hidden="true"
                width="28"
                height="28"
                viewBox="0 0 28 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                {menuOpen ? (
                  <path d="m5 5 18 18M23 5 5 23" />
                ) : (
                  <path d="M3 6h22M3 14h22M3 22h22" />
                )}
              </svg>
            </button>
          </div>
          <nav
            id="primary-navigation"
            aria-label="Primary"
            className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-1 border-t border-white/30 py-3 md:flex-row md:justify-center md:gap-4`}
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
      {isHome ? (
        <div
          className="h-48 overflow-hidden bg-[#24333c] md:h-80"
          aria-hidden="true"
        >
          <img
            src="/images/metro-station.webp"
            alt=""
            width={1536}
            height={512}
            fetchPriority="high"
            className="h-full w-full object-cover object-center"
          />
        </div>
      ) : null}
      <main
        id="main-content"
        tabIndex={-1}
        className={`relative mx-auto max-w-7xl px-5 pb-8 md:px-8 md:pb-10 ${isHome ? '-mt-12 pt-0' : 'py-8 md:py-10'}`}
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
