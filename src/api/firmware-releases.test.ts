import { createFirmwareReleases } from './firmware-releases';
import { createApp } from './app';

const revision = 'a'.repeat(40),
  imageId = 'b'.repeat(64);
const bindings = {
  FIRMWARE_REPOSITORY: 'marre/slpanel-rust',
  FIRMWARE_GITHUB_TOKEN: 'private-token',
};
const descriptor = {
  version: '1.2.3',
  board: 'interstate75w-rp2350',
  layout: 'slpanel-rp2350-4m-v2',
  image_id: imageId,
};
const receipt = {
  format: 1,
  tag: 'v1.2.3',
  version: '1.2.3',
  revision,
  image_id: imageId,
  on_main: true,
  prerelease: false,
};
const asset = (id: number, name: string, size: number) => ({
  id,
  name,
  size,
  state: 'uploaded',
});
const release = {
  id: 42,
  tag_name: 'v1.2.3',
  draft: false,
  prerelease: false,
  assets: [
    asset(1, 'release.json', 300),
    asset(2, 'provenance.json', 300),
    asset(3, 'manifest.json', 10),
    asset(4, 'firmware.bin', 1572864),
    asset(5, 'release.sbom.cdx.json', 500),
  ],
};
const json = (value: unknown) => new Response(JSON.stringify(value));

function fixture(overrides: Record<string, unknown> = {}) {
  const replies: Record<string, unknown> = {
    '/releases?per_page=20&page=1': [release],
    '/releases/assets/1': descriptor,
    '/releases/assets/2': receipt,
    '/commits/v1.2.3': { sha: revision },
    [`/compare/${revision}...main`]: {
      status: 'ahead',
      merge_base_commit: { sha: revision },
    },
    ...overrides,
  };
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const path =
      url.pathname.replace('/repos/marre/slpanel-rust', '') + url.search;
    if (!(path in replies)) throw new Error(`Unexpected URL: ${url}`);
    const value = replies[path];
    return value instanceof Response ? value : json(value);
  });
}

describe('GitHub firmware releases', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('discovers main tags and serves only same-origin asset paths without exposing credentials', async () => {
    const request = fixture();
    const provider = createFirmwareReleases(request);
    const catalogue = await provider.catalogue(bindings);
    expect(catalogue.releases).toEqual([
      {
        ...descriptor,
        manifest_url: `/firmware/releases/42/${imageId}/manifest.json`,
        image_url: `/firmware/releases/42/${imageId}/firmware.bin`,
      },
    ]);
    expect(JSON.stringify(catalogue)).not.toContain('private-token');
    for (const [, init] of request.mock.calls)
      expect(init?.headers).toMatchObject({
        Authorization: 'Bearer private-token',
      });
    await provider.catalogue(bindings);
    expect(request).toHaveBeenCalledTimes(5);
  });

  it.each([
    { ...release, prerelease: true },
    { ...release, draft: true },
    { ...release, tag_name: 'v1.2.3-beta.1' },
    {
      ...release,
      assets: release.assets.filter((a) => a.name !== 'release.sbom.cdx.json'),
    },
  ])(
    'excludes prereleases, drafts and incomplete releases',
    async (candidate) => {
      const request = fixture({ '/releases?per_page=20&page=1': [candidate] });
      expect(await createFirmwareReleases(request).catalogue(bindings)).toEqual(
        { releases: [] },
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects forged main classification and moved tags', async () => {
    const offBranch = fixture({
      [`/compare/${revision}...main`]: {
        status: 'diverged',
        merge_base_commit: { sha: 'c'.repeat(40) },
      },
    });
    expect(await createFirmwareReleases(offBranch).catalogue(bindings)).toEqual(
      { releases: [] },
    );
    const moved = fixture({ '/commits/v1.2.3': { sha: 'c'.repeat(40) } });
    expect(await createFirmwareReleases(moved).catalogue(bindings)).toEqual({
      releases: [],
    });
  });

  it('does not forward credentials to asset redirects and checks exact asset size', async () => {
    const request = fixture();
    const provider = createFirmwareReleases(request);
    await provider.catalogue(bindings);
    request.mockImplementationOnce(
      async () =>
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://release-assets.githubusercontent.com/signed-url',
          },
        }),
    );
    request.mockImplementationOnce(async () => new Response('0123456789'));
    const response = await provider.download(
      bindings,
      '42',
      imageId,
      'manifest.json',
    );
    expect(await response.text()).toBe('0123456789');
    expect(request.mock.calls.at(-1)?.[1]?.headers).toBeUndefined();
    request.mockImplementationOnce(
      async () => new Response('too long for the declared asset'),
    );
    await expect(
      provider.download(bindings, '42', imageId, 'manifest.json'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('rejects unlisted IDs, arbitrary files, and redirects to other hosts', async () => {
    const request = fixture();
    const provider = createFirmwareReleases(request);
    await expect(
      provider.download(bindings, '43', imageId, 'firmware.bin'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      provider.download(bindings, '42', imageId, 'recovery.uf2'),
    ).rejects.toMatchObject({ status: 404 });
    request.mockImplementationOnce(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/asset' },
        }),
    );
    await expect(
      provider.download(bindings, '42', imageId, 'manifest.json'),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('returns a bounded, sanitized error when private-repo access fails', async () => {
    const request = vi.fn<typeof fetch>(
      async () => new Response('private upstream details', { status: 403 }),
    );
    await expect(
      createFirmwareReleases(request).catalogue(bindings),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Firmware releases are temporarily unavailable.',
    });
  });

  it('routes the existing browser catalogue URL through the worker', async () => {
    vi.stubGlobal('fetch', fixture());
    const app = createApp();
    const response = await app.request('/firmware/releases.json', {}, bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const catalogue = (await response.json()) as { releases: unknown[] };
    expect(catalogue.releases).toHaveLength(1);
  });
});
