import { ApiError } from './errors';
import type { ServiceOption, StopServices } from './types';

const DEFAULT_ORIGIN = 'https://sliso.xr.se/data/service-catalog/';
const DEFAULT_SL = 'https://transport.integration.sl.se/v1/';
const METHOD = 'sl-stop-area-modulo-or-sha256-u32be-v1';
const HOUR = 3600_000;

type FileRef = { file: string; sha256: string; bytes: number };
type CatalogIndex = {
  schema: number;
  partitionMethod: string;
  partitionCount: number;
  validTo: string;
  partitions: Record<string, FileRef>;
};
type Shard = {
  schema: number;
  partition: number;
  areas: Record<string, { services: { routeId: string; destination: string }[] }>;
  routes: Record<string, { line: string; routeType: number }>;
};
type Site = { id: number; stop_areas?: number[] };
type CacheEntry<T> = { value: T; expires: number };

function unavailable(): ApiError {
  return new ApiError(
    503,
    'catalog_unavailable',
    'Planned service catalogue is temporarily unavailable.',
  );
}

export async function partitionId(area: string, count: number) {
  const match = /^9021001([0-9]{6})000$/.exec(area);
  if (match) return Number(match[1]) % count;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(area),
  );
  return new DataView(digest).getUint32(0) % count;
}

function modeForRoute(type: number, line: string): string {
  // SL Transport groups Roslagsbanan with local rail/trams rather than TRAIN.
  if ([2, 100, 109].includes(type)) {
    return ['27', '28', '29'].includes(line) ? 'TRAM' : 'TRAIN';
  }
  if ([0, 900].includes(type)) return 'TRAM';
  if ([1, 400, 401].includes(type)) return 'METRO';
  if ([3, 700].includes(type)) return 'BUS';
  if ([4, 1000].includes(type)) return 'SHIP';
  return 'UNKNOWN';
}

function areaGid(id: number) {
  if (!Number.isInteger(id) || id < 0 || id > 999999) throw unavailable();
  return '9021001' + String(id).padStart(6, '0') + '000';
}

export function createServiceCatalog(
  options: {
    fetch?: typeof fetch;
    catalogUrl?: string;
    slUrl?: string;
    now?: () => number;
  } = {},
) {
  const request = options.fetch ?? fetch;
  const origin = options.catalogUrl ?? DEFAULT_ORIGIN;
  const sl = options.slUrl ?? DEFAULT_SL;
  const now = options.now ?? Date.now;
  let sites: CacheEntry<Site[]> | undefined;
  let index: CacheEntry<CatalogIndex> | undefined;
  const shards = new Map<string, Shard>();

  async function json<T>(url: URL): Promise<T> {
    const response = await request(url.toString());
    if (!response.ok) throw unavailable();
    return (await response.json()) as T;
  }

  async function getSites() {
    if (sites && sites.expires > now()) return sites.value;
    const value = await json<Site[]>(new URL('sites?expand=true', sl));
    if (!Array.isArray(value)) throw unavailable();
    sites = { value, expires: now() + 24 * HOUR };
    return value;
  }

  async function getIndex(force = false) {
    if (!force && index && index.expires > now()) return index.value;
    const value = await json<CatalogIndex>(new URL('manifest.json', origin));
    if (
      value.schema !== 1 ||
      value.partitionMethod !== METHOD ||
      !Number.isInteger(value.partitionCount) ||
      value.partitionCount < 1 ||
      value.partitionCount > 256 ||
      !value.partitions ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.validTo)
    ) {
      throw unavailable();
    }
    index = { value, expires: now() + HOUR };
    return value;
  }

  async function getShard(manifest: CatalogIndex, number: number) {
    const ref = manifest.partitions[String(number)];
    if (
      !ref ||
      !/^[a-f0-9]{64}$/.test(ref.sha256) ||
      ref.file !== `part-${number}-${ref.sha256}.json` ||
      !Number.isSafeInteger(ref.bytes) ||
      ref.bytes <= 0 ||
      ref.bytes >= 25 * 1024 * 1024
    ) {
      throw unavailable();
    }
    const cached = shards.get(ref.file);
    if (cached) {
      shards.delete(ref.file);
      shards.set(ref.file, cached);
      return cached;
    }
    const response = await request(new URL(ref.file, origin).toString());
    if (!response.ok) throw unavailable();
    const raw = await response.arrayBuffer();
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
    const hex = Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join(
      '',
    );
    if (raw.byteLength !== ref.bytes || hex !== ref.sha256) throw unavailable();
    const value = JSON.parse(new TextDecoder().decode(raw)) as Shard;
    if (
      value.schema !== 1 ||
      value.partition !== number ||
      !value.areas ||
      !value.routes
    ) {
      throw unavailable();
    }
    shards.set(ref.file, value);
    // Bound memory across catalogue refreshes.
    if (shards.size > 64) {
      const oldest = shards.keys().next().value;
      if (oldest !== undefined) shards.delete(oldest);
    }
    return value;
  }

  async function load(siteId: string, force = false): Promise<StopServices> {
    const [allSites, manifest] = await Promise.all([
      getSites(),
      getIndex(force),
    ]);
    const site = allSites.find((item) => String(item.id) === siteId);
    if (!site?.stop_areas?.length) throw unavailable();
    const areas = [...new Set(site.stop_areas.map(areaGid))];
    const numbers = await Promise.all(
      areas.map((area) => partitionId(area, manifest.partitionCount)),
    );
    const byNumber = new Map<number, Shard>();
    await Promise.all(
      [...new Set(numbers)].map(async (number) => {
        byNumber.set(number, await getShard(manifest, number));
      }),
    );
    const services = new Map<string, ServiceOption>();
    let matchedAreas = 0;
    for (const [i, area] of areas.entries()) {
      const shard = byNumber.get(numbers[i])!;
      const entry = shard.areas[area];
      if (!entry) continue;
      matchedAreas++;
      for (const service of entry.services) {
        const route = shard.routes[service.routeId];
        if (!route) throw unavailable();
        if (!route.line || !service.destination) continue;
        const item = {
          line_number: route.line,
          destination: service.destination,
          transport_mode: modeForRoute(route.routeType, route.line),
        };
        services.set(JSON.stringify(item), item);
      }
    }
    return {
      site_id: siteId,
      services: [...services.values()],
      complete:
        matchedAreas === areas.length &&
        services.size > 0 &&
        manifest.validTo >= new Date(now()).toISOString().slice(0, 10),
      valid_to: manifest.validTo,
    };
  }

  return {
    async getServices(siteId: string): Promise<StopServices> {
      try {
        return await load(siteId);
      } catch {
        // A deployment may have removed a shard referenced by a cached index.
        // Retry once against the current index; never silently invent options.
        try {
          return await load(siteId, true);
        } catch {
          throw unavailable();
        }
      }
    },
  };
}
