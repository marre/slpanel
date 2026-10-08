import type {
  DeviceInfo,
  Manifest,
  UpdateIdentity,
  Receipt,
} from './firmware-protocol';
import type { DeviceRequest, DeviceReply } from './device-serial';
const IMAGE_BYTES = 1572864,
  PAYLOAD_BYTES = 1568768;
const encoder = new TextEncoder();
export const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const digest = async (bytes: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
const unhex = (s: string) =>
  Uint8Array.from(s.match(/../g)!, (x) => parseInt(x, 16));
export function manifestMessage(m: Manifest): Uint8Array {
  const data: number[] = [...encoder.encode('SLPANEL-FW-V1\0'), 1, 0];
  for (const s of [m.board, m.layout, m.version, m.revision, m.key_id]) {
    const b = encoder.encode(s);
    data.push(b.length & 255, b.length >> 8, ...b);
  }
  data.push(0, 0, 24, 0, ...unhex(m.payload_sha256));
  return new Uint8Array(data);
}
export type Package = {
  manifest: Manifest;
  bytes: Uint8Array;
  imageId: string;
};
export async function readPackage(
  manifestText: string,
  bytes: Uint8Array,
): Promise<Package> {
  const m: Manifest = JSON.parse(manifestText);
  const fields = [
    'format',
    'board',
    'layout',
    'version',
    'revision',
    'image_size',
    'payload_sha256',
    'key_id',
    'signature',
  ];
  if (
    !m ||
    Object.keys(m).length !== fields.length ||
    Object.keys(m).some((k) => !fields.includes(k)) ||
    m.format !== 1 ||
    m.board !== 'interstate75w-rp2350' ||
    m.layout !== 'slpanel-rp2350-4m-v2' ||
    m.image_size !== IMAGE_BYTES ||
    typeof m.version !== 'string' ||
    !/^[\x20-\x7e]{1,32}$/.test(m.version) ||
    typeof m.key_id !== 'string' ||
    !/^[\x20-\x7e]{1,16}$/.test(m.key_id) ||
    !/^[a-f0-9]{40}$/.test(m.revision) ||
    !/^[a-f0-9]{64}$/.test(m.payload_sha256) ||
    !/^[a-f0-9]{128}$/.test(m.signature) ||
    bytes.length !== IMAGE_BYTES
  )
    throw new Error('Invalid or incompatible firmware package.');
  if (toHex(await digest(bytes.slice(0, PAYLOAD_BYTES))) !== m.payload_sha256)
    throw new Error('Firmware download hash does not match the manifest.');
  const message = manifestMessage(m),
    trailer = bytes.slice(PAYLOAD_BYTES);
  const expected = new Uint8Array(4096).fill(255);
  expected.set(message);
  expected.set(unhex(m.signature), message.length);
  if (!trailer.every((b, i) => b === expected[i]))
    throw new Error('Firmware trailer does not match the manifest.');
  return { manifest: m, bytes, imageId: toHex(await digest(message)) };
}
export type Exchange = (request: DeviceRequest) => Promise<DeviceReply>;
export type Phase =
  'Uploading' | 'Verifying' | 'Restarting' | 'Checking device';
export async function uploadFirmware(
  pkg: Package,
  info: DeviceInfo,
  exchange: Exchange,
  progress: (phase: Phase, bytes: number) => void,
  beforeActivation: (identity: UpdateIdentity) => void,
  signal?: AbortSignal,
): Promise<UpdateIdentity> {
  if (
    !info.capabilities.includes('staged-update-v1') ||
    !info.security.signed_updates ||
    info.board !== pkg.manifest.board ||
    info.layout !== pkg.manifest.layout ||
    info.update_limits.image_size !== IMAGE_BYTES ||
    info.update_limits.chunk_bytes !== 256 ||
    info.update_limits.checkpoint_bytes !== 4096
  )
    throw new Error(
      'This device needs the staged-update bootloader installation.',
    );
  const request = async (r: DeviceRequest) => {
    const v = await exchange(r);
    if (v.reply === 'error') throw new Error(v.message);
    return v;
  };
  const begun = await request({ op: 'begin-update', manifest: pkg.manifest });
  if (
    begun.reply !== 'update-begun' ||
    begun.image_id !== pkg.imageId ||
    begun.next_offset % 256 ||
    begun.next_offset > IMAGE_BYTES
  )
    throw new Error(
      'Unexpected update identity or offset. Reconnect the device.',
    );
  const identity = { image_id: begun.image_id, attempt_id: begun.attempt_id };
  const check = (v: DeviceReply) => {
    if (
      !('image_id' in v) ||
      !('attempt_id' in v) ||
      v.image_id !== identity.image_id ||
      v.attempt_id !== identity.attempt_id
    )
      throw new Error('Update identity changed. Reconnect the device.');
  };
  for (let offset = begun.next_offset; offset < IMAGE_BYTES; offset += 256) {
    if (signal?.aborted) {
      const v = await request({ op: 'abort-update', ...identity });
      check(v);
      throw new Error('Update cancelled. The current firmware is unchanged.');
    }
    progress('Uploading', offset);
    const data = btoa(
      String.fromCharCode(...pkg.bytes.slice(offset, offset + 256)),
    );
    const v = await request({
      op: 'write-update-chunk',
      ...identity,
      offset,
      data,
    });
    check(v);
    if (
      v.reply !== 'update-chunk-written' ||
      v.next_offset !== offset + 256 ||
      v.resume_offset > v.next_offset
    )
      throw new Error('Invalid chunk acknowledgment. Reconnect the device.');
  }
  if (signal?.aborted) {
    const v = await request({ op: 'abort-update', ...identity });
    check(v);
    throw new Error('Update cancelled.');
  }
  progress('Verifying', IMAGE_BYTES);
  const ready = await request({ op: 'finish-update', ...identity });
  check(ready);
  if (ready.reply !== 'update-ready')
    throw new Error('Firmware was not verified.');
  // Save exact device/image/attempt before activation; a lost reply is uncertain.
  beforeActivation(identity);
  progress('Restarting', IMAGE_BYTES);
  const activating = await request({ op: 'activate-update', ...identity });
  check(activating);
  if (activating.reply !== 'update-activating' || !activating.rebooting)
    throw new Error('Unexpected activation response.');
  progress('Checking device', IMAGE_BYTES);
  return identity;
}
export function outcome(
  expected: UpdateIdentity & { device_id: string },
  info: DeviceInfo,
  receipt: Receipt | null,
): string | null {
  if (info.device_id !== expected.device_id)
    throw new Error('Reconnect the panel that was updated.');
  if (
    !receipt ||
    receipt.image_id !== expected.image_id ||
    receipt.attempt_id !== expected.attempt_id
  )
    return null;
  if (
    receipt.outcome === 'confirmed' &&
    receipt.running_image_id === expected.image_id &&
    info.running_image_id === expected.image_id
  )
    return 'Firmware update confirmed.';
  if (
    receipt.outcome === 'rolled-back' &&
    receipt.running_image_id === info.running_image_id
  )
    return 'The trial failed. The previous firmware was restored.';
  if (receipt.outcome === 'rejected')
    return 'The device rejected the firmware image.';
  return null;
}

export type Release = {
  version: string;
  board: string;
  layout: string;
  image_id: string;
  manifest_url: string;
  image_url: string;
};
async function boundedDownload(url: string, max: number): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok || !response.body)
    throw new Error('Could not download the firmware release.');
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) {
        await reader.cancel();
        throw new Error('Firmware download exceeds its size limit.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
function releaseUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid release URL.');
  const url = new URL(value, window.location.origin);
  if (
    url.origin !== window.location.origin ||
    !url.pathname.startsWith('/firmware/') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Invalid release URL.');
  return url.href;
}
export async function listReleases(info: DeviceInfo): Promise<Release[]> {
  const parsed: unknown = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(
      await boundedDownload('/firmware/releases.json', 65536),
    ),
  );
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('releases' in parsed) ||
    !Array.isArray(parsed.releases) ||
    parsed.releases.length > 100
  )
    throw new Error('Invalid firmware release catalogue.');
  const releases: Release[] = [];
  for (const r of parsed.releases) {
    if (
      !r ||
      typeof r !== 'object' ||
      typeof r.version !== 'string' ||
      !/^[\x20-\x7e]{1,32}$/.test(r.version) ||
      typeof r.board !== 'string' ||
      typeof r.layout !== 'string' ||
      !/^[0-9a-f]{64}$/.test(r.image_id)
    )
      throw new Error('Invalid firmware release catalogue.');
    releases.push({
      ...r,
      manifest_url: releaseUrl(r.manifest_url),
      image_url: releaseUrl(r.image_url),
    });
  }
  return releases.filter(
    (r) => r.board === info.board && r.layout === info.layout,
  );
}
export async function downloadRelease(release: Release): Promise<Package> {
  const [manifest, bytes] = await Promise.all([
    boundedDownload(releaseUrl(release.manifest_url), 1024),
    boundedDownload(releaseUrl(release.image_url), IMAGE_BYTES),
  ]);
  const pkg = await readPackage(
    new TextDecoder('utf-8', { fatal: true }).decode(manifest),
    bytes,
  );
  if (
    pkg.imageId !== release.image_id ||
    pkg.manifest.version !== release.version ||
    pkg.manifest.board !== release.board ||
    pkg.manifest.layout !== release.layout
  )
    throw new Error('Release catalogue differs from the downloaded package.');
  return pkg;
}
