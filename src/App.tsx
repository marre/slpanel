import './App.css'

const phaseItems = {
  phase2: [
    'Vite + React + TypeScript scaffolded',
    'Wrangler config and initial D1 migration added',
    'ESLint, Prettier, Vitest, and npm scripts configured',
  ],
  phase3: [
    'CRUD API for displays implemented as Cloudflare Pages Functions',
    'SL stop-search and departures proxy endpoints added',
    'Shared backend validation helpers and unit tests in place',
  ],
}

function App() {
  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">SLPanel</p>
        <h1>Cloudflare Pages departure board scaffold</h1>
        <p className="lead">
          The project is now implemented through Phase 3: a Vite/React frontend scaffold plus a
          Cloudflare Pages Functions backend backed by D1.
        </p>
      </section>

      <section className="status-grid" aria-label="Implementation status">
        <article className="status-card">
          <h2>Phase 2 complete</h2>
          <ul>
            {phaseItems.phase2.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="status-card">
          <h2>Phase 3 complete</h2>
          <ul>
            {phaseItems.phase3.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>
      </section>

      <section className="api-card">
        <h2>Available API routes</h2>
        <code>GET /api/displays?owner=&lt;owner_id&gt;</code>
        <code>POST /api/displays</code>
        <code>GET /api/displays/:id</code>
        <code>PUT /api/displays/:id</code>
        <code>DELETE /api/displays/:id</code>
        <code>GET /api/stops/search?q=&lt;text&gt;</code>
        <code>GET /api/departures/:siteId</code>
      </section>
    </main>
  )
}

export default App
