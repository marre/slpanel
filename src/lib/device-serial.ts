import { isUpdateReply, expectedUpdateReply } from './firmware-protocol';
import type { UpdateRequest, UpdateReply } from './firmware-protocol';
// USB JSON protocol v1, shared with slpanel-rust/slpanel-device-protocol.
export type WifiSecurity = 'auto' | 'wpa2' | 'wpa3';
export type DeviceConfig = {
  wifi_ssid: string;
  wifi_password?: string;
  wifi_security?: WifiSecurity;
  service_origin: string;
  display_id: string;
};

export type SavedDeviceConfig = Omit<DeviceConfig, 'wifi_password'> & {
  wifi_password_set: boolean;
};

export type DeviceLogEntry = {
  seq: number;
  uptime_ms: number;
  unix_ms: number | null;
  level: string;
  message: string;
};

export type WifiNetwork = { ssid: string; rssi: number; secured: boolean };

export type DeviceRequest =
  | UpdateRequest
  | { op: 'config' }
  | { op: 'configure'; config: DeviceConfig }
  | { op: 'logs'; after: number }
  | { op: 'status' }
  | { op: 'wifi-scan' };

export type DeviceReply =
  | UpdateReply
  | { reply: 'config'; config: SavedDeviceConfig }
  | { reply: 'hello'; version: number }
  | { reply: 'saved'; reboot_required: boolean }
  | {
      reply: 'logs';
      entries: DeviceLogEntry[];
      next: number;
      lost: number;
      more: boolean;
    }
  | { reply: 'wifi-scan'; networks: WifiNetwork[] }
  | { reply: 'status'; details: string }
  | { reply: 'error'; message: string; code?: string };

// Keep the small API surface local: Web Serial is not in all DOM type libraries.
export interface DeviceSerialPort {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  setSignals(signals: { dataTerminalReady: boolean }): Promise<void>;
  close(): Promise<void>;
}

export interface DeviceSerialApi {
  requestPort(options: {
    filters: { usbVendorId: number; usbProductId: number }[];
  }): Promise<DeviceSerialPort>;
}

export function getDeviceSerialApi(): DeviceSerialApi | undefined {
  return (navigator as Navigator & { serial?: DeviceSerialApi }).serial;
}

const encoder = new TextEncoder();
const CONFIG_KEYS = ['wifi_ssid', 'service_origin', 'display_id'] as const;

export function validateDeviceConfig(value: unknown): DeviceConfig {
  if (
    !isObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![...CONFIG_KEYS, 'wifi_password', 'wifi_security'].includes(key),
    ) ||
    !CONFIG_KEYS.every((key) => typeof value[key] === 'string') ||
    (value.wifi_password !== undefined &&
      typeof value.wifi_password !== 'string') ||
    (value.wifi_security !== undefined && !isWifiSecurity(value.wifi_security))
  ) {
    throw new Error(
      'Config must contain wifi_ssid, service_origin, and display_id, with optional wifi_password and wifi_security (auto, wpa2, or wpa3).',
    );
  }
  const config = value as DeviceConfig;
  if (
    CONFIG_KEYS.some((key) => encoder.encode(config[key]).length > 160) ||
    encoder.encode(config.wifi_password ?? '').length > 160
  ) {
    throw new Error('Config fields must be at most 160 UTF-8 bytes.');
  }
  const ssidBytes = encoder.encode(config.wifi_ssid).length;
  const passwordBytes = encoder.encode(config.wifi_password ?? '').length;
  if (
    config.wifi_password === '' &&
    config.wifi_security &&
    config.wifi_security !== 'auto'
  ) {
    throw new Error('WPA2 or WPA3 requires a Wi-Fi password.');
  }
  if (!ssidBytes || ssidBytes > 32) {
    throw new Error('Wi-Fi name must be 1–32 UTF-8 bytes.');
  }
  if (passwordBytes !== 0 && (passwordBytes < 8 || passwordBytes > 63)) {
    throw new Error(
      'Wi-Fi password must be empty for an open network, or 8–63 UTF-8 bytes.',
    );
  }
  let url: URL;
  try {
    url = new URL(config.service_origin);
  } catch {
    throw new Error('Service URL must be a valid HTTPS URL.');
  }
  if (
    url.protocol !== 'https:' ||
    !config.service_origin.startsWith('https://')
  ) {
    throw new Error('Service URL must use HTTPS.');
  }
  if (!config.display_id) {
    throw new Error('Display ID is required.');
  }
  return config;
}

function isWifiSecurity(value: unknown): value is WifiSecurity {
  return value === 'auto' || value === 'wpa2' || value === 'wpa3';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function isLogEntry(value: unknown): value is DeviceLogEntry {
  return (
    isObject(value) &&
    isCounter(value.seq) &&
    value.seq > 0 &&
    isCounter(value.uptime_ms) &&
    (value.unix_ms === null || isCounter(value.unix_ms)) &&
    typeof value.level === 'string' &&
    typeof value.message === 'string'
  );
}

function parseReply(bytes: number[]): DeviceReply {
  let value: unknown;
  try {
    value = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)),
    );
  } catch {
    throw new Error(
      'Invalid device response. Check that the firmware supports USB protocol v1.',
    );
  }
  if (isUpdateReply(value)) return value;
  if (isObject(value)) {
    switch (value.reply) {
      case 'config': {
        const config = value.config;
        if (
          isObject(config) &&
          Object.keys(config).every((key) =>
            [...CONFIG_KEYS, 'wifi_password_set', 'wifi_security'].includes(
              key,
            ),
          ) &&
          CONFIG_KEYS.every((key) => typeof config[key] === 'string') &&
          typeof config.wifi_password_set === 'boolean' &&
          (config.wifi_security === undefined ||
            isWifiSecurity(config.wifi_security))
        ) {
          return value as DeviceReply;
        }
        break;
      }
      case 'hello':
        if (isCounter(value.version)) {
          return value as DeviceReply;
        }
        break;
      case 'saved':
        if (typeof value.reboot_required === 'boolean') {
          return value as DeviceReply;
        }
        break;
      case 'wifi-scan':
        if (
          Array.isArray(value.networks) &&
          value.networks.length <= 20 &&
          value.networks.every(
            (network: unknown) =>
              isObject(network) &&
              typeof network.ssid === 'string' &&
              encoder.encode(network.ssid).length > 0 &&
              encoder.encode(network.ssid).length <= 32 &&
              typeof network.rssi === 'number' &&
              Number.isInteger(network.rssi) &&
              network.rssi >= -32768 &&
              network.rssi <= 32767 &&
              typeof network.secured === 'boolean',
          )
        ) {
          return value as DeviceReply;
        }
        break;
      case 'status':
        if (typeof value.details === 'string') {
          return value as DeviceReply;
        }
        break;
      case 'error':
        if (typeof value.message === 'string') {
          return value as DeviceReply;
        }
        break;
      case 'logs':
        if (
          Array.isArray(value.entries) &&
          value.entries.length <= 10 &&
          value.entries.every(isLogEntry) &&
          isCounter(value.next) &&
          isCounter(value.lost) &&
          typeof value.more === 'boolean' &&
          value.entries.every(
            (entry, index, entries) =>
              entry.seq <= (value.next as number) &&
              (index === 0 || entry.seq > entries[index - 1].seq),
          )
        ) {
          return value as DeviceReply;
        }
    }
  }
  throw new Error(
    'Unexpected device response. Check that the firmware supports USB protocol v1.',
  );
}

type PendingReply = {
  resolve(reply: DeviceReply): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

/** One request at a time: v1 has no request IDs, so timeout invalidates the session. */
export class DeviceSerialClient {
  protocolVersion = 0;
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private writer?: WritableStreamDefaultWriter<Uint8Array>;
  private readTask?: Promise<void>;
  private openTask?: Promise<void>;
  private closeTask?: Promise<void>;
  private pending?: PendingReply;
  private opened = false;
  private ready = false;
  private closed = false;
  private requesting = false;

  constructor(
    private readonly port: DeviceSerialPort,
    private readonly onDisconnect: (error: Error) => void,
    private readonly timeoutMs = 10_000,
  ) {}

  async connect(): Promise<void> {
    try {
      this.openTask = this.port.open({ baudRate: 115200 }).then(() => {
        this.opened = true;
      });
      await this.openTask;
      if (this.closed) {
        throw new Error('Connection cancelled.');
      }
      if (!this.port.readable || !this.port.writable) {
        throw new Error('USB serial streams are unavailable.');
      }
      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();
      const hello = this.waitForReply();
      this.readTask = this.readReplies();
      // DTR triggers the firmware greeting; listen before asserting it.
      const [, reply] = await Promise.all([
        this.port.setSignals({ dataTerminalReady: true }),
        hello,
      ]);
      if (reply.reply === 'error') {
        throw new Error(reply.message);
      }
      if (reply.reply !== 'hello' || ![1, 2].includes(reply.version)) {
        throw new Error('This device needs firmware with USB protocol v1.');
      }
      if (this.closed) {
        throw new Error('Device disconnected.');
      }
      this.protocolVersion = reply.version;
      this.ready = true;
    } catch (error) {
      await this.disconnect();
      throw error;
    }
  }

  async request(request: DeviceRequest): Promise<DeviceReply> {
    if (!this.ready || this.closed || !this.writer) {
      throw new Error('Connect a device first.');
    }
    if (this.requesting || this.pending) {
      throw new Error('A device request is already running.');
    }
    if (request.op === 'configure') {
      validateDeviceConfig(request.config);
    }
    const bytes = encoder.encode(JSON.stringify(request));
    if (bytes.length > 1024) {
      throw new Error('Config exceeds the device request limit.');
    }
    const line = new Uint8Array(bytes.length + 1);
    line.set(bytes);
    line[bytes.length] = 10;
    const expected =
      request.op === 'configure'
        ? 'saved'
        : (expectedUpdateReply[request.op] ?? request.op);
    this.requesting = true;
    try {
      const response = this.waitForReply(
        ['begin-update', 'finish-update', 'activate-update'].includes(
          request.op,
        )
          ? Math.max(this.timeoutMs, 60_000)
          : request.op === 'wifi-scan'
            ? Math.max(this.timeoutMs, 30_000)
            : this.timeoutMs,
      );
      const [, reply] = await Promise.all([this.writer.write(line), response]);
      if (reply.reply === 'error') {
        return reply;
      }
      if (reply.reply !== expected) {
        throw new Error('Unexpected reply; reconnect the device.');
      }
      if (
        request.op === 'logs' &&
        reply.reply === 'logs' &&
        (reply.next < request.after ||
          (reply.more && reply.next <= request.after) ||
          reply.entries.some((entry) => entry.seq <= request.after))
      ) {
        throw new Error('Invalid log cursor; reconnect the device.');
      }
      return reply;
    } catch (error) {
      this.fail(
        error instanceof Error ? error : new Error('Device request failed.'),
      );
      throw error;
    } finally {
      this.requesting = false;
    }
  }

  private waitForReply(timeoutMs = this.timeoutMs): Promise<DeviceReply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            new Error('Device response timed out. Reconnect and try again.'),
          ),
        timeoutMs,
      );
      this.pending = { resolve, reject, timer };
    });
  }

  private async readReplies(): Promise<void> {
    const reader = this.reader!;
    let bytes: number[] = [];
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done) {
          if (!this.closed) {
            this.fail(new Error('Device disconnected.'));
          }
          break;
        }
        for (const byte of value) {
          if (byte !== 10) {
            if (bytes.length >= 32 * 1024) {
              throw new Error('Device response exceeds the size limit.');
            }
            bytes.push(byte);
            continue;
          }
          if (bytes.every((byte) => byte === 13 || byte === 32 || byte === 9)) {
            bytes = [];
            continue;
          }
          const reply = parseReply(bytes);
          bytes = [];
          if (!this.pending) {
            throw new Error('Unexpected USB data; reconnect the device.');
          }
          const pending = this.pending;
          this.pending = undefined;
          clearTimeout(pending.timer);
          pending.resolve(reply);
        }
      }
    } catch (error) {
      if (!this.closed) {
        this.fail(
          error instanceof Error ? error : new Error('USB connection failed.'),
        );
      }
    } finally {
      reader.releaseLock();
    }
  }

  private fail(error: Error): void {
    if (this.closed) {
      return;
    }
    void this.disconnect(error).then(() => this.onDisconnect(error));
  }

  disconnect(reason = new Error('Device connection closed.')): Promise<void> {
    if (this.closeTask) {
      return this.closeTask;
    }
    this.closed = true;
    this.ready = false;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(reason);
      this.pending = undefined;
    }
    this.closeTask = this.closePort();
    return this.closeTask;
  }

  private async closePort(): Promise<void> {
    await this.openTask?.catch(() => undefined);
    if (!this.opened) {
      return;
    }
    await this.port
      .setSignals({ dataTerminalReady: false })
      .catch(() => undefined);
    await this.reader?.cancel().catch(() => undefined);
    await this.readTask;
    if (this.writer) {
      await this.writer.abort().catch(() => undefined);
      this.writer.releaseLock();
    }
    await this.port.close().catch(() => undefined);
  }
}
