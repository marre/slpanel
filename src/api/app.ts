import { Hono } from 'hono';
import type { Context } from 'hono';

import { requireDatabase } from './d1';
import { createD1DisplayStore } from './d1-display-store';
import type { DisplayStore } from './display-store';
import { createD1PresentationStore } from './presentation-store';
import type { PresentationStore } from './presentation-store';
import type { DisplayRecord } from './types';
import type { EffectivePresentation, PanelControl } from './presentation-types';
import {
  chooseSelection,
  findNextTransition,
  parseDataSource,
  parsePresentation,
  parsePanelControl,
} from './presentation-service';
import { ApiError, isApiError } from './errors';
import { createTrafiklabProvider } from './trafiklab-provider';
import { createFirmwareReleases } from './firmware-releases';
import type { FirmwareBindings } from './firmware-releases';
import type { TransitProvider } from './transit-provider';
import {
  parseDeparturesQuery,
  parseDisplayCreateInput,
  parseDisplayUpdateInput,
  parseOwnerQuery,
  parseStopsSearchQuery,
  validateDisplayResourceId,
} from './validation';

export type WorkerBindings = FirmwareBindings & {
  ASSETS?: Fetcher;
  DB?: D1Database;
};

interface AppOptions {
  transitProvider?: TransitProvider;
  createDisplayStore?: (db: D1Database | undefined) => DisplayStore;
  createPresentationStore?: (db: D1Database | undefined) => PresentationStore;
  now?: () => Date;
}

type ApiContext = Context<{ Bindings: WorkerBindings }>;

export function createApp(options: AppOptions = {}) {
  const app = new Hono<{ Bindings: WorkerBindings }>();
  const firmware = createFirmwareReleases();
  const transitProvider = options.transitProvider ?? createTrafiklabProvider();
  const createDisplayStore =
    options.createDisplayStore ??
    ((db) => createD1DisplayStore(requireDatabase(db)));
  const createPresentationStore =
    options.createPresentationStore ??
    ((db: D1Database | undefined) =>
      createD1PresentationStore(requireDatabase(db)));
  const hasPresentations = (context: ApiContext) =>
    Boolean(getBindings(context).DB || options.createPresentationStore);
  const now = options.now ?? (() => new Date());

  async function resolve(
    display: DisplayRecord,
    store: PresentationStore,
  ): Promise<{
    display: DisplayRecord;
    effective: EffectivePresentation;
    control: PanelControl;
  }> {
    const control = await store.getControl(display.id);
    const selected = chooseSelection(control, now());
    const presentation = selected.presentation_id
      ? await store.getPresentation(display.owner_id, selected.presentation_id)
      : null;
    const source = presentation
      ? await store.getSource(display.owner_id, presentation.data_source_id)
      : null;
    const effective: EffectivePresentation = {
      mode: selected.mode,
      reason: selected.reason,
      presentation,
      data_source: source,
      next_transition_at: findNextTransition(control, now()),
    };
    const resolved =
      selected.mode === 'off'
        ? {
            ...display,
            site_id: null,
            site_name: null,
            line_numbers: [],
            directions: [],
            modes: [],
          }
        : source
          ? {
              ...display,
              site_id: source.site_id,
              site_name: source.site_name,
              refresh_interval: source.refresh_interval,
              line_numbers: source.line_numbers,
              directions: source.directions,
              modes: source.modes,
            }
          : display;
    return { display: resolved, effective, control };
  }

  async function requireDisplay(context: ApiContext): Promise<DisplayRecord> {
    const id = validateDisplayResourceId(context.req.param('id'));
    const display = await createDisplayStore(getBindings(context).DB).getById(
      id,
    );
    if (!display)
      throw new ApiError(404, 'display_not_found', 'Display not found.');
    return display;
  }

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
    // The USB device page can browse this public list from another service.
    context.header('Access-Control-Allow-Origin', '*');
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
    if (hasPresentations(context)) {
      await createPresentationStore(getBindings(context).DB).syncLegacy(
        display,
      );
    }

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

    context.header('Cache-Control', 'no-store');
    if (hasPresentations(context)) {
      const result = await resolve(
        display,
        createPresentationStore(getBindings(context).DB),
      );
      return context.json({
        display: result.display,
        effective: result.effective,
      });
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

    if (hasPresentations(context)) {
      await createPresentationStore(getBindings(context).DB).syncLegacy(
        display,
      );
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

  // These are owner-scoped configuration APIs, not device provisioning endpoints.
  // Legacy owner IDs are not authentication; deployment access controls must protect writes.
  api.get('/data-sources', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    return context.json({
      data_sources: await createPresentationStore(
        getBindings(context).DB,
      ).listSources(owner),
    });
  });
  api.post('/data-sources', async (context) => {
    const input = parseDataSource(await readJsonBody(context));
    parseOwnerQuery(input.owner_id);
    const source = await createPresentationStore(
      getBindings(context).DB,
    ).saveSource(input);
    return context.json({ data_source: source }, 201);
  });
  api.put('/data-sources/:sourceId', async (context) => {
    const input = parseDataSource(await readJsonBody(context));
    parseOwnerQuery(input.owner_id);
    const source = await createPresentationStore(
      getBindings(context).DB,
    ).saveSource(input, context.req.param('sourceId'));
    return context.json({ data_source: source });
  });
  api.delete('/data-sources/:sourceId', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    const deleted = await createPresentationStore(
      getBindings(context).DB,
    ).deleteSource(owner, context.req.param('sourceId'));
    if (!deleted)
      throw new ApiError(404, 'source_not_found', 'Data source not found.');
    return context.body(null, 204);
  });
  api.get('/presentations', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    return context.json({
      presentations: await createPresentationStore(
        getBindings(context).DB,
      ).listPresentations(owner),
    });
  });
  api.post('/presentations', async (context) => {
    const input = parsePresentation(await readJsonBody(context));
    parseOwnerQuery(input.owner_id);
    const presentation = await createPresentationStore(
      getBindings(context).DB,
    ).savePresentation(input);
    return context.json({ presentation }, 201);
  });
  api.put('/presentations/:presentationId', async (context) => {
    const input = parsePresentation(await readJsonBody(context));
    parseOwnerQuery(input.owner_id);
    const presentation = await createPresentationStore(
      getBindings(context).DB,
    ).savePresentation(input, context.req.param('presentationId'));
    return context.json({ presentation });
  });
  api.delete('/presentations/:presentationId', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    const deleted = await createPresentationStore(
      getBindings(context).DB,
    ).deletePresentation(owner, context.req.param('presentationId'));
    if (!deleted)
      throw new ApiError(
        404,
        'presentation_not_found',
        'Presentation not found.',
      );
    return context.body(null, 204);
  });
  api.get('/displays/:id/control', async (context) => {
    const display = await requireDisplay(context);
    context.header('Cache-Control', 'no-store');
    const result = await resolve(
      display,
      createPresentationStore(getBindings(context).DB),
    );
    return context.json({
      control: result.control,
      effective: result.effective,
      display: result.display,
    });
  });
  api.put('/displays/:id/control', async (context) => {
    const display = await requireDisplay(context);
    const parsed = parsePanelControl(await readJsonBody(context));
    const store = createPresentationStore(getBindings(context).DB);
    await store.saveControl(display.id, display.owner_id, parsed);
    context.header('Cache-Control', 'no-store');
    const result = await resolve(display, store);
    return context.json({
      control: result.control,
      effective: result.effective,
      display: result.display,
    });
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

  app.get('/firmware/releases.json', async (context) => {
    const bindings = getBindings(context);
    if (!bindings.FIRMWARE_REPOSITORY && bindings.ASSETS)
      return bindings.ASSETS.fetch(context.req.raw);
    context.header('Cache-Control', 'no-store');
    return context.json(await firmware.catalogue(bindings));
  });
  app.get('/firmware/releases/:id/:image/:name', (context) =>
    firmware.download(
      getBindings(context),
      context.req.param('id'),
      context.req.param('image'),
      context.req.param('name'),
    ),
  );

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
