import { webcrypto } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import {
  readPackage,
  manifestMessage,
  toHex,
  uploadFirmware,
  outcome,
} from './firmware-updater';
import { isUpdateReply } from './firmware-protocol';
import type { Manifest, DeviceInfo, Receipt } from './firmware-protocol';
import type { DeviceReply } from './device-serial';
vi.stubGlobal('crypto', webcrypto);
const imageId = 'a'.repeat(64),
  attemptId = 'b'.repeat(32);
const info: DeviceInfo = {
  device_id: '1234567890abcdef',
  board: 'interstate75w-rp2350',
  layout: 'slpanel-rp2350-4m-v2',
  firmware_version: 'old',
  firmware_revision: 'c'.repeat(40),
  running_image_id: 'd'.repeat(64),
  bootloader_version: '0.1.0',
  capabilities: ['staged-update-v1'],
  update_limits: {
    image_size: 1572864,
    chunk_bytes: 256,
    checkpoint_bytes: 4096,
  },
  security: { signed_updates: true, hardware_secure_boot: false },
};
const manifest: Manifest = {
  format: 1,
  board: info.board,
  layout: info.layout,
  version: '1.0.0',
  revision: 'c'.repeat(40),
  image_size: 1572864,
  payload_sha256: 'e'.repeat(64),
  key_id: 'release',
  signature: '0'.repeat(128),
};
const pkg = { manifest, bytes: new Uint8Array(1572864).fill(255), imageId };
describe('signed update host flow', () => {
  it('resumes sequentially, checks acknowledgments, and records identity before activation', async () => {
    let offset = 1572864 - 512;
    const order: string[] = [];
    const exchange = vi.fn(async (r): Promise<DeviceReply> => {
      order.push(r.op);
      switch (r.op) {
        case 'begin-update':
          return {
            reply: 'update-begun',
            image_id: imageId,
            attempt_id: attemptId,
            next_offset: offset,
            resume_offset: 1572864 - 4096,
            chunk_bytes: 256,
          };
        case 'write-update-chunk':
          expect(r.offset).toBe(offset);
          expect(atob(r.data).length).toBe(256);
          offset += 256;
          return {
            reply: 'update-chunk-written',
            image_id: imageId,
            attempt_id: attemptId,
            next_offset: offset,
            resume_offset: offset === 1572864 ? offset : 1572864 - 4096,
          };
        case 'finish-update':
          return {
            reply: 'update-ready',
            image_id: imageId,
            attempt_id: attemptId,
          };
        case 'activate-update':
          expect(order.at(-2)).toBe('record');
          return {
            reply: 'update-activating',
            image_id: imageId,
            attempt_id: attemptId,
            rebooting: true,
          };
        default:
          throw new Error('Unexpected request');
      }
    });
    await uploadFirmware(pkg, info, exchange, vi.fn(), () =>
      order.push('record'),
    );
    expect(order).toEqual([
      'begin-update',
      'write-update-chunk',
      'write-update-chunk',
      'finish-update',
      'record',
      'activate-update',
    ]);
  });
  it('stops on wrong attempt or offset and never activates', async () => {
    const exchange = vi.fn(async (r): Promise<DeviceReply> =>
      r.op === 'begin-update'
        ? {
            reply: 'update-begun',
            image_id: imageId,
            attempt_id: attemptId,
            next_offset: 0,
            resume_offset: 0,
            chunk_bytes: 256,
          }
        : {
            reply: 'update-chunk-written',
            image_id: imageId,
            attempt_id: 'c'.repeat(32),
            next_offset: 256,
            resume_offset: 0,
          },
    );
    await expect(
      uploadFirmware(pkg, info, exchange, vi.fn(), vi.fn()),
    ).rejects.toThrow('identity changed');
    expect(exchange).toHaveBeenCalledTimes(2);
  });
  it('aborts a cancelled transfer before writing', async () => {
    const controller = new AbortController();
    controller.abort();
    const exchange = vi.fn(async (r): Promise<DeviceReply> =>
      r.op === 'begin-update'
        ? {
            reply: 'update-begun',
            image_id: imageId,
            attempt_id: attemptId,
            next_offset: 0,
            resume_offset: 0,
            chunk_bytes: 256,
          }
        : { reply: 'update-aborted', image_id: imageId, attempt_id: attemptId },
    );
    await expect(
      uploadFirmware(pkg, info, exchange, vi.fn(), vi.fn(), controller.signal),
    ).rejects.toThrow('cancelled');
    expect(exchange.mock.calls.map(([r]) => r.op)).toEqual([
      'begin-update',
      'abort-update',
    ]);
  });
  it('requires matching device, image, attempt, and running image for success', () => {
    const expected = {
      device_id: info.device_id,
      image_id: imageId,
      attempt_id: attemptId,
    };
    const receipt: Receipt = {
      image_id: imageId,
      attempt_id: attemptId,
      running_image_id: imageId,
      outcome: 'confirmed',
      reason: 'startup-confirmed',
    };
    expect(
      outcome(expected, { ...info, running_image_id: imageId }, receipt),
    ).toBe('Firmware update confirmed.');
    expect(
      outcome(
        expected,
        { ...info, running_image_id: imageId },
        { ...receipt, attempt_id: 'e'.repeat(32) },
      ),
    ).toBeNull();
    expect(() =>
      outcome(expected, { ...info, device_id: 'f'.repeat(16) }, receipt),
    ).toThrow('panel that was updated');
    expect(outcome(expected, info, receipt)).toBeNull();
  });
  it('validates the exact payload and canonical metadata trailer', async () => {
    const bytes = new Uint8Array(1572864).fill(255);
    const m = {
      ...manifest,
      payload_sha256: toHex(
        new Uint8Array(
          await webcrypto.subtle.digest('SHA-256', bytes.slice(0, 1568768)),
        ),
      ),
    };
    const message = manifestMessage(m);
    bytes.set(message, 1568768);
    bytes.fill(0, 1568768 + message.length, 1568768 + message.length + 64);
    const pkg = await readPackage(JSON.stringify(m), bytes);
    expect(pkg.imageId).toHaveLength(64);
    bytes[0] ^= 1;
    await expect(readPackage(JSON.stringify(m), bytes)).rejects.toThrow('hash');
    bytes[0] ^= 1;
    bytes[bytes.length - 1] = 0;
    await expect(readPackage(JSON.stringify(m), bytes)).rejects.toThrow(
      'trailer',
    );
  });
  it('rejects malformed protocol offsets and incomplete receipts', () => {
    expect(
      isUpdateReply({
        reply: 'update-begun',
        image_id: imageId,
        attempt_id: attemptId,
        next_offset: 257,
        resume_offset: 0,
        chunk_bytes: 256,
      }),
    ).toBe(false);
    expect(
      isUpdateReply({
        reply: 'update-status',
        state: 'trial',
        last_result: { outcome: 'confirmed' },
      }),
    ).toBe(false);
  });
});
