import { Hono } from 'hono';

type WorkerBindings = {
  ASSETS: Fetcher;
  DB?: D1Database;
};

const app = new Hono<{ Bindings: WorkerBindings }>();

app.get('/api/health', (context) => {
  return context.json({
    ok: true,
    service: 'slpanel',
    timestamp: new Date().toISOString(),
  });
});

app.notFound(async (context) => {
  const assetResponse = await context.env.ASSETS.fetch(context.req.raw);

  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const indexUrl = new URL('/index.html', context.req.url);

  return context.env.ASSETS.fetch(
    new Request(indexUrl.toString(), {
      headers: context.req.raw.headers,
      method: 'GET',
    }),
  );
});

export default app;
