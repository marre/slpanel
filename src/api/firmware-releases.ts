import { ApiError } from './errors';
import type { Release } from '../lib/firmware-release';

export type FirmwareBindings = {
  FIRMWARE_REPOSITORY?: string;
  FIRMWARE_GITHUB_TOKEN?: string;
};
type Asset = { id: number; name: string; size: number; state: string };
type GithubRelease = {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Asset[];
};
type Entry = { release: Release; id: number; assets: Asset[] };
const IMAGE_BYTES = 1572864;
const stableTag = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const unavailable = () =>
  new ApiError(
    503,
    'firmware_unavailable',
    'Firmware releases are temporarily unavailable.',
  );

async function bounded(response: Response, limit: number): Promise<Uint8Array> {
  if (!response.ok || !response.body) throw unavailable();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw unavailable();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Server-only GitHub access; no repository credential or private API URL is returned. */
export function createFirmwareReleases(request: typeof fetch = fetch) {
  let cached: { scope: string; until: number; entries: Entry[] } | undefined;
  let pending: { scope: string; promise: Promise<Entry[]> } | undefined;

  function repository(bindings: FirmwareBindings) {
    if (
      !bindings.FIRMWARE_REPOSITORY ||
      !/^[\w.-]+\/[\w.-]+$/.test(bindings.FIRMWARE_REPOSITORY)
    )
      throw unavailable();
    return `https://api.github.com/repos/${bindings.FIRMWARE_REPOSITORY}`;
  }
  async function github(
    bindings: FirmwareBindings,
    path: string,
    binary = false,
  ) {
    const headers: Record<string, string> = {
      Accept: binary
        ? 'application/octet-stream'
        : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'slpanel-firmware-updater',
    };
    if (bindings.FIRMWARE_GITHUB_TOKEN)
      headers.Authorization = `Bearer ${bindings.FIRMWARE_GITHUB_TOKEN}`;
    const response = await request(repository(bindings) + path, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(10000),
    });
    if (binary && [301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw unavailable();
      const url = new URL(location);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        ![
          'release-assets.githubusercontent.com',
          'objects.githubusercontent.com',
        ].includes(url.hostname)
      )
        throw unavailable();
      // A presigned asset URL needs no GitHub credential; never forward it.
      return request(url.href, {
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    }
    return response;
  }
  async function json(
    bindings: FirmwareBindings,
    path: string,
    limit = 1048576,
    binary = false,
  ) {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await bounded(await github(bindings, path, binary), limit),
      ),
    );
  }
  async function eligible(
    bindings: FirmwareBindings,
    r: GithubRelease,
  ): Promise<Entry | null> {
    if (
      r.draft ||
      r.prerelease ||
      !stableTag.test(r.tag_name) ||
      !Number.isSafeInteger(r.id) ||
      r.id <= 0
    )
      return null;
    const asset = (name: string, max: number) => {
      const matches = r.assets.filter(
        (a) =>
          a.name === name &&
          a.state === 'uploaded' &&
          Number.isSafeInteger(a.id) &&
          a.id > 0 &&
          Number.isSafeInteger(a.size) &&
          a.size > 0 &&
          a.size <= max,
      );
      return matches.length === 1 ? matches[0] : null;
    };
    const descriptor = asset('release.json', 4096),
      provenance = asset('provenance.json', 4096);
    const manifest = asset('manifest.json', 1024),
      image = asset('firmware.bin', IMAGE_BYTES);
    if (
      !descriptor ||
      !provenance ||
      !manifest ||
      !image ||
      image.size !== IMAGE_BYTES ||
      !asset('release.sbom.cdx.json', 1048576)
    )
      return null;
    const [release, receipt, commit] = await Promise.all([
      json(bindings, `/releases/assets/${descriptor.id}`, 4096, true),
      json(bindings, `/releases/assets/${provenance.id}`, 4096, true),
      json(bindings, `/commits/${encodeURIComponent(r.tag_name)}`),
    ]);
    if (
      receipt.format !== 1 ||
      receipt.on_main !== true ||
      receipt.prerelease !== false ||
      receipt.tag !== r.tag_name ||
      receipt.version !== r.tag_name.slice(1) ||
      !/^[0-9a-f]{40}$/.test(receipt.revision) ||
      receipt.revision !== commit.sha ||
      release.version !== receipt.version ||
      release.image_id !== receipt.image_id ||
      !/^[0-9a-f]{64}$/.test(release.image_id) ||
      release.board !== 'interstate75w-rp2350' ||
      release.layout !== 'slpanel-rp2350-4m-v2'
    )
      return null;
    // Verify ancestry ourselves: target_commitish can be a branch name, not the tag commit.
    const comparison = await json(
      bindings,
      `/compare/${receipt.revision}...main`,
    );
    if (
      !['ahead', 'identical'].includes(comparison.status) ||
      comparison.merge_base_commit?.sha !== receipt.revision
    )
      return null;
    const prefix = `/firmware/releases/${r.id}/${release.image_id}`;
    return {
      id: r.id,
      assets: [manifest, image],
      release: {
        version: release.version,
        image_id: release.image_id,
        board: release.board,
        layout: release.layout,
        manifest_url: `${prefix}/manifest.json`,
        image_url: `${prefix}/firmware.bin`,
      },
    };
  }
  async function load(bindings: FirmwareBindings): Promise<Entry[]> {
    const candidates: GithubRelease[] = [];
    // Bound API calls and catalogue size. Ignore branch/prerelease tags before asset requests.
    for (let page = 1; page <= 3 && candidates.length < 6; page++) {
      const releases: GithubRelease[] = await json(
        bindings,
        `/releases?per_page=20&page=${page}`,
      );
      if (!Array.isArray(releases)) throw unavailable();
      candidates.push(
        ...releases.filter(
          (r) => !r.draft && !r.prerelease && stableTag.test(r.tag_name),
        ),
      );
      if (releases.length < 20) break;
    }
    const entries = await Promise.all(
      candidates.slice(0, 6).map((r) => eligible(bindings, r)),
    );
    return entries.filter((e): e is Entry => e !== null);
  }
  async function entries(bindings: FirmwareBindings) {
    // Isolate configurations in tests and during token rotation without using public cache keys.
    const scope = `${bindings.FIRMWARE_REPOSITORY}:${bindings.FIRMWARE_GITHUB_TOKEN ?? ''}`;
    if (cached?.scope === scope && cached.until > Date.now())
      return cached.entries;
    if (pending?.scope === scope) return pending.promise;
    const promise = load(bindings)
      .then((entries) => {
        cached = { scope, until: Date.now() + 300000, entries };
        return entries;
      })
      .catch(() => {
        throw unavailable();
      })
      .finally(() => {
        if (pending?.promise === promise) pending = undefined;
      });
    pending = { scope, promise };
    return promise;
  }
  return {
    async catalogue(bindings: FirmwareBindings) {
      return { releases: (await entries(bindings)).map((e) => e.release) };
    },
    async download(
      bindings: FirmwareBindings,
      id: string,
      imageId: string,
      name: string,
    ) {
      if (
        !/^[1-9]\d*$/.test(id) ||
        !/^[0-9a-f]{64}$/.test(imageId) ||
        !['manifest.json', 'firmware.bin'].includes(name)
      )
        throw new ApiError(
          404,
          'firmware_not_found',
          'Firmware release not found.',
        );
      const entry = (await entries(bindings)).find(
        (e) => String(e.id) === id && e.release.image_id === imageId,
      );
      const asset = entry?.assets.find((a) => a.name === name);
      if (!asset)
        throw new ApiError(
          404,
          'firmware_not_found',
          'Firmware release not found.',
        );
      try {
        const bytes = await bounded(
          await github(bindings, `/releases/assets/${asset.id}`, true),
          asset.size,
        );
        if (bytes.length !== asset.size) throw unavailable();
        return new Response(new Uint8Array(bytes), {
          headers: {
            'content-type':
              name === 'manifest.json'
                ? 'application/json'
                : 'application/octet-stream',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
          },
        });
      } catch {
        throw unavailable();
      }
    },
  };
}
