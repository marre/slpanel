import { vi } from 'vitest';

import type {
  DeviceReply,
  DeviceRequest,
  DeviceSerialPort,
  SavedDeviceConfig,
} from '@/lib/device-serial';

/** Mock firmware running over real Web Streams, including split USB packets. */
export class TestDevicePort implements DeviceSerialPort {
  readonly requests: DeviceRequest[] = [];
  readonly writes: string[] = [];
  private controller!: ReadableStreamDefaultController<Uint8Array>;
  private cancelled = false;
  readonly readable = new ReadableStream<Uint8Array>({
    start: (controller) => {
      this.controller = controller;
    },
    cancel: () => {
      this.cancelled = true;
    },
  });
  readonly writable = new WritableStream<Uint8Array>({
    write: (bytes) => {
      const text = new TextDecoder().decode(bytes);
      this.writes.push(text);
      const request = JSON.parse(text) as DeviceRequest;
      this.requests.push(request);
      const reply =
        request.op === 'config'
          ? { reply: 'config' as const, config: this.savedConfig }
          : this.respond(request);
      if (reply) {
        this.send(reply);
      }
    },
  });
  readonly open = vi.fn(async () => undefined);
  readonly close = vi.fn(async () => {
    if (this.readable.locked || this.writable.locked) {
      throw new Error('Streams still locked');
    }
  });
  readonly setSignals = vi.fn(
    async ({ dataTerminalReady }: { dataTerminalReady: boolean }) => {
      if (dataTerminalReady) {
        this.send({ reply: 'hello', version: this.version });
      }
    },
  );

  constructor(
    private readonly respond: (
      request: DeviceRequest,
    ) => DeviceReply | undefined = () => undefined,
    private readonly version = 1,
    private readonly savedConfig: SavedDeviceConfig = {
      wifi_ssid: 'Saved network',
      service_origin: 'https://panel.xr.se/',
      display_id: 'device-screen',
      wifi_password_set: true,
    },
  ) {}

  send(reply: DeviceReply) {
    this.sendRaw(`\r\n${JSON.stringify(reply)}\r\n`);
  }
  sendRaw(text: string) {
    if (this.cancelled) {
      return;
    }
    const bytes = new TextEncoder().encode(text);
    // Deliberately split inside multibyte characters and JSON/CRLF boundaries.
    for (let offset = 0; offset < bytes.length; offset += 3) {
      this.controller.enqueue(bytes.slice(offset, offset + 3));
    }
  }
  unplug() {
    this.controller.error(new Error('USB device removed'));
  }
}
