import { Hono } from 'hono';
import type { Context } from 'hono';

import { requireDatabase } from './d1';
import { createD1DisplayStore } from './d1-display-store';
import type { DisplayStore } from './display-store';
import { createD1SceneStore } from './scene-store';
import type { SceneStore } from './scene-store';
import type { DisplayRecord } from './types';
import type { DeviceAssignment, EffectiveScene } from './scene-types';
import {
  parseDataSource,
  parseScene,
  parseDeviceAssignment,
  parseSchedule,
  selectScheduledScene,
  nextScheduleTransition,
} from './scene-service';
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
  createSceneStore?: (db: D1Database | undefined) => SceneStore;
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
  const createSceneStore =
    options.createSceneStore ??
    ((db: D1Database | undefined) => createD1SceneStore(requireDatabase(db)));
  const hasScenes = (context: ApiContext) =>
    Boolean(getBindings(context).DB || options.createSceneStore);
  const now = options.now ?? (() => new Date());

  async function resolve(
    display: DisplayRecord,
    store: SceneStore,
  ): Promise<{
    display: DisplayRecord;
    effective: EffectiveScene;
    assignment: DeviceAssignment | null;
  }> {
    const assignment = await store.getAssignment(display.id);
    let sceneId: string | null = null;
    let mode: EffectiveScene['mode'] = 'legacy';
    let reason: EffectiveScene['reason'] = 'unassigned';
    let nextTransition: string | null = null;
    if (assignment?.kind === 'scene') {
      sceneId = assignment.scene_id;
      mode = 'scene';
      reason = 'direct';
    } else if (assignment?.kind === 'schedule' && assignment.schedule_id) {
      const schedule = await store.getSchedule(
        display.owner_id,
        assignment.schedule_id,
      );
      if (schedule) {
        sceneId = selectScheduledScene(schedule, now());
        mode = sceneId ? 'scene' : 'off';
        reason = 'schedule';
        nextTransition = nextScheduleTransition(schedule, now());
      }
    }
    const scene = sceneId
      ? await store.getScene(display.owner_id, sceneId)
      : null;
    const source = scene
      ? await store.getSource(display.owner_id, scene.data_source_id)
      : null;
    const effective: EffectiveScene = {
      mode,
      reason,
      scene,
      data_source: source,
      schedule_id:
        assignment?.kind === 'schedule' ? assignment.schedule_id : null,
      next_transition_at: nextTransition,
    };
    const resolved =
      mode === 'off'
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
    return { display: resolved, effective, assignment };
  }

  async function requireDisplay(context: ApiContext): Promise<DisplayRecord> {
    const id = validateDisplayResourceId(context.req.param('id') ?? '');
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
    if (hasScenes(context) && display.site_id) {
      await createSceneStore(getBindings(context).DB).syncLegacy(display);
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
    if (hasScenes(context)) {
      const result = await resolve(
        display,
        createSceneStore(getBindings(context).DB),
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

    // Rename-only edits must not copy stale legacy stop/filter values over
    // a shared scene data source that may have been edited independently.
    const legacyConfigChanged = [
      'site_id',
      'site_name',
      'refresh_interval',
      'line_numbers',
      'directions',
      'modes',
    ].some((field) => Object.prototype.hasOwnProperty.call(input, field));
    if (hasScenes(context) && legacyConfigChanged) {
      await createSceneStore(getBindings(context).DB).syncLegacy(display);
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

  // Owner-scoped management routes. Owner IDs are not authentication: protect
  // deployments with a proper access layer before exposing writes publicly.
  api.get('/data-sources', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    return context.json({
      data_sources: await createSceneStore(getBindings(context).DB).listSources(
        owner,
      ),
    });
  });
  api.post('/data-sources', async (context) => {
    const input = parseDataSource(await readJsonBody(context));
    return context.json(
      {
        data_source: await createSceneStore(getBindings(context).DB).saveSource(
          input,
        ),
      },
      201,
    );
  });
  api.put('/data-sources/:sourceId', async (context) => {
    const input = parseDataSource(await readJsonBody(context));
    return context.json({
      data_source: await createSceneStore(getBindings(context).DB).saveSource(
        input,
        context.req.param('sourceId'),
      ),
    });
  });
  api.delete('/data-sources/:sourceId', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    if (
      !(await createSceneStore(getBindings(context).DB).deleteSource(
        owner,
        context.req.param('sourceId'),
      ))
    )
      throw new ApiError(404, 'source_not_found', 'Data source not found.');
    return context.body(null, 204);
  });
  api.get('/scenes', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    return context.json({
      scenes: await createSceneStore(getBindings(context).DB).listScenes(owner),
    });
  });
  api.post('/scenes', async (context) => {
    const input = parseScene(await readJsonBody(context));
    return context.json(
      {
        scene: await createSceneStore(getBindings(context).DB).saveScene(input),
      },
      201,
    );
  });
  api.put('/scenes/:sceneId', async (context) => {
    const input = parseScene(await readJsonBody(context));
    return context.json({
      scene: await createSceneStore(getBindings(context).DB).saveScene(
        input,
        context.req.param('sceneId'),
      ),
    });
  });
  api.delete('/scenes/:sceneId', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    if (
      !(await createSceneStore(getBindings(context).DB).deleteScene(
        owner,
        context.req.param('sceneId'),
      ))
    )
      throw new ApiError(404, 'scene_not_found', 'Scene not found.');
    return context.body(null, 204);
  });
  api.get('/schedules', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    return context.json({
      schedules: await createSceneStore(getBindings(context).DB).listSchedules(
        owner,
      ),
    });
  });
  api.post('/schedules', async (context) => {
    const input = parseSchedule(await readJsonBody(context));
    return context.json(
      {
        schedule: await createSceneStore(getBindings(context).DB).saveSchedule(
          input,
        ),
      },
      201,
    );
  });
  api.put('/schedules/:scheduleId', async (context) => {
    const input = parseSchedule(await readJsonBody(context));
    return context.json({
      schedule: await createSceneStore(getBindings(context).DB).saveSchedule(
        input,
        context.req.param('scheduleId'),
      ),
    });
  });
  api.delete('/schedules/:scheduleId', async (context) => {
    const owner = parseOwnerQuery(context.req.query('owner'));
    if (
      !(await createSceneStore(getBindings(context).DB).deleteSchedule(
        owner,
        context.req.param('scheduleId'),
      ))
    )
      throw new ApiError(404, 'schedule_not_found', 'Schedule not found.');
    return context.body(null, 204);
  });
  api.get('/displays/:id/assignment', async (context) => {
    const display = await requireDisplay(context);
    context.header('Cache-Control', 'no-store');
    return context.json(
      await resolve(display, createSceneStore(getBindings(context).DB)),
    );
  });
  api.put('/displays/:id/assignment', async (context) => {
    const display = await requireDisplay(context);
    const input = parseDeviceAssignment(await readJsonBody(context));
    const store = createSceneStore(getBindings(context).DB);
    await store.saveAssignment(display.id, display.owner_id, input);
    context.header('Cache-Control', 'no-store');
    return context.json(await resolve(display, store));
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
