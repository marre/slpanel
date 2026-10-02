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
    vi.useFakeTimers();
    const port = new TestDevicePort();
    const disconnected = vi.fn();
    const client = new DeviceSerialClient(port, disconnected, 50);
    await client.connect();
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
    const port = new TestDevicePort(undefined, 2);
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
