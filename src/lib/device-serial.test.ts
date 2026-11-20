import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeviceSerialClient, validateDeviceConfig } from '@/lib/device-serial';
import type { DeviceConfig } from '@/lib/device-serial';
import { TestDevicePort } from '@/test/device-port';

const config: DeviceConfig = {
  wifi_ssid: ' nät  verk ',
  wifi_password: ' pass  word ',
  service_origin: 'https://panel.xr.se/',
  display_id: 'screen',
};

describe('device configuration', () => {
  it('accepts explicit WPA3 without replacing a saved password and rejects open WPA3', () => {
    const publicConfig: DeviceConfig = {
      wifi_ssid: config.wifi_ssid,
      service_origin: config.service_origin,
      display_id: config.display_id,
    };
    expect(
      validateDeviceConfig({ ...publicConfig, wifi_security: 'wpa3' })
        .wifi_security,
    ).toBe('wpa3');
    expect(() =>
      validateDeviceConfig({ ...config, wifi_security: 'unknown' }),
    ).toThrow(/wifi_security/);
    expect(() =>
      validateDeviceConfig({
        ...config,
        wifi_password: '',
        wifi_security: 'wpa3',
      }),
    ).toThrow(/requires a Wi-Fi password/);
  });
  it('preserves whitespace and validates lengths in UTF-8 bytes', () => {
    expect(validateDeviceConfig(config)).toEqual(config);
    expect(() =>
      validateDeviceConfig({ ...config, wifi_ssid: 'ö'.repeat(17) }),
    ).toThrow(/1–32/);
    expect(() =>
      validateDeviceConfig({ ...config, wifi_password: 'ö'.repeat(32) }),
    ).toThrow(/8–63/);
    expect(
      validateDeviceConfig({ ...config, wifi_password: '' }).wifi_password,
    ).toBe('');
  });
  it('rejects invalid config without reflecting secret input', () => {
    expect(() =>
      validateDeviceConfig({ ...config, 'secret-value': 'secret' }),
    ).toThrow(/^Config must contain/);
    expect(() =>
      validateDeviceConfig({
        ...config,
        service_origin: 'http://panel.xr.se/',
      }),
    ).toThrow(/HTTPS/);
    expect(() => validateDeviceConfig({ ...config, display_id: '' })).toThrow(
      'Display ID is required.',
    );
  });
});

describe('DeviceSerialClient', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['flushed', 'buffered'])(
    'restarts the handshake when opening asserted DTR and the greeting was %s',
    async (startup) => {
      const port = new TestDevicePort();
      let dtr = true;
      port.open.mockImplementation(async () => {
        if (startup === 'buffered') {
          // Include a partial packet left behind by the browser's input flush.
          port.sendRaw('version":2}\r\n');
        }
      });
      port.setSignals.mockImplementation(async ({ dataTerminalReady }) => {
        if (dataTerminalReady && !dtr) {
          port.send({ reply: 'hello', version: 2 });
        }
        dtr = dataTerminalReady;
      });
      const client = new DeviceSerialClient(port, vi.fn(), 50);
      await client.connect();
      expect(client.protocolVersion).toBe(2);
      expect(port.setSignals).toHaveBeenNthCalledWith(1, {
        dataTerminalReady: false,
      });
      expect(port.setSignals).toHaveBeenNthCalledWith(2, {
        dataTerminalReady: true,
      });
      await expect(client.request({ op: 'config' })).resolves.toMatchObject({
        reply: 'config',
      });
      await client.disconnect();
    },
  );

  it('can disconnect while resetting the handshake without reasserting DTR', async () => {
    vi.useFakeTimers();
    const port = new TestDevicePort();
    const client = new DeviceSerialClient(port, vi.fn());
    const connecting = expect(client.connect()).rejects.toThrow('cancelled');
    await vi.advanceTimersByTimeAsync(0);
    await client.disconnect();
    await vi.advanceTimersByTimeAsync(100);
    await connecting;
    expect(port.setSignals).not.toHaveBeenCalledWith({
      dataTerminalReady: true,
    });
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('handles fragmented UTF-8/CRLF, sets DTR, and sends complete config over USB', async () => {
    const port = new TestDevicePort((request) =>
      request.op === 'configure'
        ? { reply: 'saved', reboot_required: true }
        : {
            reply: 'logs',
            entries: [
              {
                seq: 1,
                uptime_ms: 7,
                unix_ms: null,
                level: 'info',
                message: 'Nätverket anslutet',
              },
            ],
            next: 1,
            lost: 0,
            more: false,
          },
    );
    const client = new DeviceSerialClient(port, vi.fn());
    await client.connect();
    expect(port.open).toHaveBeenCalledWith({ baudRate: 115200 });
    expect(port.setSignals).toHaveBeenCalledWith({ dataTerminalReady: true });
    await expect(client.request({ op: 'configure', config })).resolves.toEqual({
      reply: 'saved',
      reboot_required: true,
    });
    expect(port.requests[0]).toEqual({ op: 'configure', config });
    expect(port.writes[0].endsWith('\n')).toBe(true);
    await expect(
      client.request({ op: 'logs', after: 0 }),
    ).resolves.toMatchObject({
      entries: [{ message: 'Nätverket anslutet', unix_ms: null }],
    });
    await client.disconnect();
    expect(port.setSignals).toHaveBeenLastCalledWith({
      dataTerminalReady: false,
    });
    expect(port.readable.locked).toBe(false);
    expect(port.writable.locked).toBe(false);
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('does not write invalid settings and keeps device errors recoverable', async () => {
    const port = new TestDevicePort((request) =>
      request.op === 'configure'
        ? { reply: 'error', message: 'error: settings not saved' }
        : { reply: 'status', details: 'wifi=online' },
    );
    const client = new DeviceSerialClient(port, vi.fn());
    await client.connect();
    await expect(
      client.request({
        op: 'configure',
        config: { ...config, wifi_password: 'short' },
      }),
    ).rejects.toThrow(/8–63/);
    expect(port.requests).toHaveLength(0);
    await expect(
      client.request({ op: 'configure', config }),
    ).resolves.toMatchObject({ reply: 'error' });
    await expect(client.request({ op: 'status' })).resolves.toMatchObject({
      details: 'wifi=online',
    });
    await client.disconnect();
  });

  it('rejects overlapping requests and cancels a pending read on disconnect', async () => {
    const port = new TestDevicePort();
    const client = new DeviceSerialClient(port, vi.fn());
    await client.connect();
    const pending = client.request({ op: 'status' });
    const rejected = expect(pending).rejects.toThrow(
      'Device connection closed.',
    );
    await expect(client.request({ op: 'logs', after: 0 })).rejects.toThrow(
      'already running',
    );
    await client.disconnect();
    await rejected;
    expect(port.requests).toHaveLength(1);
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('invalidates timed-out sessions so late responses cannot satisfy the next request', async () => {
    const port = new TestDevicePort();
    const disconnected = vi.fn();
    const client = new DeviceSerialClient(port, disconnected, 50);
    await client.connect();
    vi.useFakeTimers();
    const failed = expect(client.request({ op: 'status' })).rejects.toThrow(
      'Device response timed out.',
    );
    await vi.advanceTimersByTimeAsync(50);
    await failed;
    expect(disconnected).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('timed out'),
      }),
    );
    await expect(client.request({ op: 'status' })).rejects.toThrow(
      'Connect a device first.',
    );
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('rejects incompatible firmware and releases its streams', async () => {
    const port = new TestDevicePort(undefined, 3);
    const client = new DeviceSerialClient(port, vi.fn());
    await expect(client.connect()).rejects.toThrow('protocol v1');
    expect(port.close).toHaveBeenCalledOnce();
    expect(port.readable.locked).toBe(false);
    expect(port.writable.locked).toBe(false);
  });

  it.each(['invalid JSON\n', 'x'.repeat(32769)])(
    'bounds and validates incoming device data',
    async (text) => {
      const port = new TestDevicePort();
      const client = new DeviceSerialClient(port, vi.fn());
      await client.connect();
      const failed = expect(client.request({ op: 'status' })).rejects.toThrow(
        /Invalid device response|size limit/,
      );
      port.sendRaw(text);
      await failed;
      await client.disconnect();
      expect(port.close).toHaveBeenCalledOnce();
    },
  );

  it('accepts scan results over split USB packets and rejects malformed results', async () => {
    const port = new TestDevicePort(() => ({
      reply: 'wifi-scan',
      networks: [{ ssid: 'Nät', rssi: -42, secured: true }],
    }));
    const client = new DeviceSerialClient(port, vi.fn());
    await client.connect();
    expect(await client.request({ op: 'wifi-scan' })).toEqual({
      reply: 'wifi-scan',
      networks: [{ ssid: 'Nät', rssi: -42, secured: true }],
    });
    await client.disconnect();
    const malformed = new TestDevicePort();
    const next = new DeviceSerialClient(malformed, vi.fn());
    await next.connect();
    const failed = expect(next.request({ op: 'wifi-scan' })).rejects.toThrow(
      /Unexpected device response/,
    );
    malformed.sendRaw(
      '{"reply":"wifi-scan","networks":[{"ssid":"x","rssi":"strong","secured":true}]}\n',
    );
    await failed;
    await next.disconnect();
  });

  it('sends opaque 4 KiB binary frames and an explicit exit frame', async () => {
    const image = 'a'.repeat(64),
      attempt = 'b'.repeat(32);
    const port = new TestDevicePort(
      (request) =>
        request.op === 'begin-binary-transfer'
          ? {
              reply: 'binary-transfer-ready',
              image_id: image,
              attempt_id: attempt,
              next_offset: 4096,
              resume_offset: 4096,
              block_bytes: 4096,
            }
          : undefined,
      2,
      undefined,
      (frame) => {
        const offset = new DataView(
          frame.buffer,
          frame.byteOffset,
          frame.byteLength,
        ).getUint32(4, true);
        return offset === 0xffffffff
          ? { reply: 'binary-transfer-ended' }
          : {
              reply: 'binary-block-written',
              image_id: image,
              attempt_id: attempt,
              next_offset: offset + 4096,
              resume_offset: offset + 4096,
            };
      },
    );
    const client = new DeviceSerialClient(port, vi.fn());
    await client.connect();
    await expect(
      client.request({
        op: 'begin-binary-transfer',
        image_id: image,
        attempt_id: attempt,
      }),
    ).resolves.toMatchObject({ reply: 'binary-transfer-ready' });
    expect(client.binaryTransferActive).toBe(true);
    await expect(client.request({ op: 'status' })).rejects.toThrow(
      'Finish binary transfer',
    );
    const data = new Uint8Array(4096).fill(255);
    data.set([0, 10, 13, 123, 34, 0, 65], 0);
    await expect(client.writeBinaryBlock(4096, data)).resolves.toMatchObject({
      reply: 'binary-block-written',
      next_offset: 8192,
    });
    expect(port.binaryFrames[0]).toHaveLength(4104);
    expect([...port.binaryFrames[0].slice(0, 8)]).toEqual([
      83, 76, 66, 49, 0, 16, 0, 0,
    ]);
    expect(port.binaryFrames[0].slice(8)).toEqual(data);
    await expect(client.endBinaryTransfer()).resolves.toEqual({
      reply: 'binary-transfer-ended',
    });
    expect([...port.binaryFrames[1]]).toEqual([
      83, 76, 66, 49, 255, 255, 255, 255,
    ]);
    expect(client.binaryTransferActive).toBe(false);
    await expect(client.writeBinaryBlock(1, data)).rejects.toThrow(
      'Invalid binary firmware block',
    );
    await client.disconnect();
  });

  it('closes a device that is unplugged while a request is pending', async () => {
    const port = new TestDevicePort();
    const disconnected = vi.fn();
    const client = new DeviceSerialClient(port, disconnected);
    await client.connect();
    const failed = expect(client.request({ op: 'status' })).rejects.toThrow(
      'USB device removed',
    );
    port.unplug();
    await failed;
    await client.disconnect();
    expect(disconnected).toHaveBeenCalledOnce();
  });
});
