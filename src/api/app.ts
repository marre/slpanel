import { Hono } from 'hono';
import type { Context } from 'hono';

import { requireDatabase } from './d1';
import { createD1DisplayStore } from './d1-display-store';
import type { DisplayStore } from './display-store';
import { ApiError, isApiError } from './errors';
import { createTrafiklabProvider } from './trafiklab-provider';
import type { TransitProvider } from './transit-provider';
import {
  parseDeparturesQuery,
  parseDisplayCreateInput,
  parseDisplayUpdateInput,
  parseOwnerQuery,
  parseStopsSearchQuery,
  validateDisplayResourceId,
} from './validation';

export type WorkerBindings = {
  ASSETS?: Fetcher;
  DB?: D1Database;
};

interface AppOptions {
  transitProvider?: TransitProvider;
  createDisplayStore?: (db: D1Database | undefined) => DisplayStore;
}

type ApiContext = Context<{ Bindings: WorkerBindings }>;

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: WorkerBindings }>();
  const transitProvider = options.transitProvider ?? createTrafiklabProvider();
  const createDisplayStore =
    options.createDisplayStore ??
    ((db) => createD1DisplayStore(requireDatabase(db)));

  app.onError((error, context) => {
    if (isApiError(error)) {
      return new Response(
        JSON.stringify({
          error: {
            code: error.code,
            message: error.message,
            details: error.details ?? null,
          },
        }),
        {
          status: error.status,
          headers: {
            'content-type': 'application/json',
          },
        },
      );
    }

    console.error(error);

    return context.json(
      {
        error: {
          code: 'internal_error',
          message: 'Unexpected server error.',
          details: null,
        },
      },
      500,
    );
  });

  const api = new Hono<{ Bindings: WorkerBindings }>();

  api.get('/health', (context) => {
    return context.json({
      ok: true,
      service: 'slpanel',
      timestamp: new Date().toISOString(),
    });
  });

  api.get('/displays', async (context) => {
    const ownerId = parseOwnerQuery(context.req.query('owner'));
    const displays = await createDisplayStore(
      getBindings(context).DB,
    ).listByOwner(ownerId);

    return context.json({
      owner_id: ownerId,
      displays,
    });
  });

  api.post('/displays', async (context) => {
    const input = parseDisplayCreateInput(await readJsonBody(context));
    const display = await createDisplayStore(getBindings(context).DB).create(
      input,
    );

    return context.json({ display }, 201);
  });

  api.get('/displays/:id', async (context) => {
    const id = validateDisplayResourceId(context.req.param('id'));
    const display = await createDisplayStore(getBindings(context).DB).getById(
      id,
    );

    if (!display) {
      throw new ApiError(404, 'display_not_found', 'Display not found.');
    }

    return context.json({ display });
  });

  api.put('/displays/:id', async (context) => {
    const id = validateDisplayResourceId(context.req.param('id'));
    const input = parseDisplayUpdateInput(await readJsonBody(context));
    const display = await createDisplayStore(getBindings(context).DB).update(
      id,
      input,
    );

    if (!display) {
      throw new ApiError(404, 'display_not_found', 'Display not found.');
    }

    return context.json({ display });
  });

  api.delete('/displays/:id', async (context) => {
    const id = validateDisplayResourceId(context.req.param('id'));
    const deleted = await createDisplayStore(getBindings(context).DB).delete(
      id,
    );

    if (!deleted) {
      throw new ApiError(404, 'display_not_found', 'Display not found.');
    }

    return context.body(null, 204);
  });

  api.get('/stops/search', async (context) => {
    const query = parseStopsSearchQuery(context.req.query('q'));
    const results = await transitProvider.searchStops(query);

    return context.json({ query, results });
  });

  api.get('/departures/:siteId', async (context) => {
    const searchParams = new URL(context.req.url).searchParams;
    const query = parseDeparturesQuery(
      context.req.param('siteId'),
      searchParams,
    );
    const departures = await transitProvider.getDepartures(query);

    return context.json({
      site_id: query.site_id,
      departures,
    });
  });

  app.route('/api', api);

  app.notFound(async (context) => {
    const bindings = getBindings(context);

    if (!bindings.ASSETS) {
      return context.text('Not Found', 404);
    }

    const assetResponse = await bindings.ASSETS.fetch(context.req.raw);

    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const indexUrl = new URL('/index.html', context.req.url);

    return bindings.ASSETS.fetch(
      new Request(indexUrl.toString(), {
        headers: context.req.raw.headers,
        method: 'GET',
      }),
    );
  });

  return app;
}

async function readJsonBody(context: ApiContext): Promise<unknown> {
  try {
    return await context.req.json();
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be valid JSON.');
  }
}

function getBindings(context: ApiContext): WorkerBindings {
  return (context.env ?? {}) as WorkerBindings;
}
