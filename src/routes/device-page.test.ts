import { h } from 'vue';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, vi } from 'vitest';
import DevicePage from '@/routes/device-page.vue';
import type {
  DeviceConfig,
  DeviceSerialApi,
  DeviceReply,
  DeviceRequest,
  SavedDeviceConfig,
} from '@/lib/device-serial';
import { TestDevicePort } from '@/test/device-port';
import { listDisplays } from '@/lib/config-api';
vi.mock('@/lib/config-api', () => ({
  listDisplays: vi.fn(),
}));

// Firmware supplies empty log pages even when a test only exercises configuration.
class PageDevicePort extends TestDevicePort {
  constructor(
    respond: (request: DeviceRequest) => DeviceReply | undefined = () =>
      undefined,
    version = 1,
    saved?: SavedDeviceConfig,
  ) {
    super(
      (request) => {
        const reply = respond(request);
        if (request.op === 'logs' && reply?.reply !== 'logs') {
          return {
            reply: 'logs',
            entries: [],
            next: request.after,
            lost: 0,
            more: false,
          };
        }
        return reply;
      },
      version,
      saved,
    );
  }
}
const config: DeviceConfig = {
  wifi_ssid: ' net  work ',
  wifi_password: ' pass  word ',
  service_origin: 'https://panel.xr.se/',
  display_id: 'owner123-screen',
};
async function showPage(path = '/device?display=owner123-screen') {
  return await render(routerFixture([path], [h(DevicePage, {})]));
}
function exposePort(port: TestDevicePort) {
  const requestPort = vi
    .fn<DeviceSerialApi['requestPort']>()
    .mockResolvedValue(port);
  vi.stubGlobal('navigator', {
    serial: {
      requestPort,
    },
  });
  return requestPort;
}
async function connect() {
  await fireEvent.click(
    screen.getByRole('button', {
      name: 'Connect device',
    }),
  );
  await screen.findByText('Connected via USB');
}
async function fillConfig() {
  await fireEvent.click(screen.getByLabelText('Update Wi-Fi password'));
  await fireEvent.input(screen.getByLabelText('Wi-Fi name'), {
    target: {
      value: config.wifi_ssid,
    },
  });
  await fireEvent.input(screen.getByLabelText('Wi-Fi password'), {
    target: {
      value: config.wifi_password,
    },
  });
}
describe('DevicePage', () => {
  beforeEach(() => {
    vi.stubGlobal('isSecureContext', true);
    window.localStorage.clear();
    vi.mocked(listDisplays).mockReset().mockResolvedValue([]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it('selects a remembered owner’s display and still saves a manually entered ID', async () => {
    window.localStorage.setItem('slpanel.owner-id', 'markerik');
    vi.mocked(listDisplays).mockResolvedValue([
      {
        id: 'markerik-new',
        owner_id: 'markerik',
        display_id: 'new',
        name: 'Vallentuna train',
        site_id: '9626',
        site_name: 'Vallentuna',
        refresh_interval: 30,
        line_numbers: [],
        directions: [],
        modes: [],
      },
    ]);
    const port = new PageDevicePort(() => ({
      reply: 'saved',
      reboot_required: true,
    }));
    exposePort(port);
    await showPage('/device');
    await connect();
    await fireEvent.click(screen.getByLabelText('Saved display'));
    await screen.findByRole('option', {
      name: 'Vallentuna train — Vallentuna',
    });
    expect(screen.getByLabelText('Owner ID')).toHaveValue('markerik');
    await fireEvent.keyDown(
      await screen.findByRole('option', {
        name: 'Vallentuna train — Vallentuna',
      }),
      { key: 'Enter' },
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Display ID')).toHaveValue('markerik-new'),
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await screen.findByText(/Configuration saved/);
    expect(
      port.requests.filter((request) => request.op === 'configure').at(-1),
    ).toMatchObject({
      config: {
        display_id: 'markerik-new',
      },
    });
    await fireEvent.input(screen.getByLabelText('Display ID'), {
      target: {
        value: 'another1-manual',
      },
    });
    expect(screen.getByLabelText('Saved display')).toHaveTextContent(
      'Choose a display',
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await waitFor(() =>
      expect(
        port.requests.filter((request) => request.op === 'configure').at(-1),
      ).toMatchObject({
        config: {
          display_id: 'another1-manual',
        },
      }),
    );
  });
  it('loads the owner from the saved ID and keeps manual entry after a lookup failure', async () => {
    vi.mocked(listDisplays).mockRejectedValue(new Error('offline'));
    exposePort(new PageDevicePort());
    await showPage();
    await screen.findByText(/Could not load displays/);
    expect(listDisplays).toHaveBeenCalledWith(
      'owner123',
      expect.any(AbortSignal),
      'https://panel.xr.se',
    );
    expect(screen.getByLabelText('Display ID')).toHaveValue('owner123-screen');
    await fireEvent.input(screen.getByLabelText('Owner ID'), {
      target: {
        value: 'markerik',
      },
    });
    await waitFor(() =>
      expect(listDisplays).toHaveBeenCalledWith(
        'markerik',
        expect.any(AbortSignal),
        'https://panel.xr.se',
      ),
    );
  });
  it('loads displays from the device service and refreshes when the Service URL changes', async () => {
    const saved = {
      wifi_ssid: 'Saved network',
      wifi_password_set: true,
      display_id: 'markerik-old',
      service_origin: 'https://other.example/panel/',
    };
    vi.mocked(listDisplays).mockImplementation(
      async (_owner, _signal, origin) =>
        origin === 'https://other.example/panel'
          ? [
              {
                id: 'markerik-remote',
                owner_id: 'markerik',
                display_id: 'remote',
                name: 'Remote display',
                site_id: null,
                site_name: null,
                refresh_interval: 30,
                line_numbers: [],
                directions: [],
                modes: [],
              },
            ]
          : [],
    );
    const port = new PageDevicePort(
      () => ({
        reply: 'saved',
        reboot_required: true,
      }),
      1,
      saved,
    );
    exposePort(port);
    await showPage('/device?owner=markerik');
    await connect();
    await fireEvent.click(screen.getByLabelText('Saved display'));
    await screen.findByRole('option', {
      name: 'Remote display',
    });
    expect(listDisplays).toHaveBeenCalledWith(
      'markerik',
      expect.any(AbortSignal),
      'https://other.example/panel',
    );
    await fireEvent.keyDown(
      await screen.findByRole('option', { name: 'Remote display' }),
      { key: 'Enter' },
    );
    expect(screen.getByLabelText('Service URL')).toHaveValue(
      saved.service_origin,
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await screen.findByText(/Configuration saved/);
    expect(
      port.requests.filter((request) => request.op === 'configure').at(-1),
    ).toMatchObject({
      config: {
        display_id: 'markerik-remote',
        service_origin: saved.service_origin,
      },
    });
    await fireEvent.input(screen.getByLabelText('Service URL'), {
      target: {
        value: 'https://new.example/',
      },
    });
    await screen.findByText(
      /No saved displays for this owner at the Service URL/,
    );
    expect(listDisplays).toHaveBeenCalledWith(
      'markerik',
      expect.any(AbortSignal),
      'https://new.example',
    );
    expect(
      screen.queryByRole('option', {
        name: 'Remote display',
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('Display ID')).toHaveValue('markerik-remote');
    const calls = vi.mocked(listDisplays).mock.calls.length;
    await fireEvent.input(screen.getByLabelText('Service URL'), {
      target: {
        value: 'https://',
      },
    });
    expect(screen.getByLabelText('Saved display')).toHaveTextContent(
      'Enter a valid HTTPS Service URL',
    );
    expect(listDisplays).toHaveBeenCalledTimes(calls);
  });
  it('scans, selects secured and open networks, and keeps manual entry', async () => {
    const port = new PageDevicePort((request) =>
      request.op === 'wifi-scan'
        ? {
            reply: 'wifi-scan',
            networks: [
              {
                ssid: 'Café network',
                rssi: -40,
                secured: true,
              },
              {
                ssid: 'Guest',
                rssi: -65,
                secured: false,
              },
            ],
          }
        : {
            reply: 'saved',
            reboot_required: true,
          },
    );
    exposePort(port);
    await showPage();
    await connect();
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Scan Wi-Fi networks',
      }),
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: /Café network/,
      }),
    );
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Café network');
    expect(screen.getByLabelText('Wi-Fi password')).toBeEnabled();
    expect(screen.getByLabelText('Update Wi-Fi password')).toBeChecked();
    expect(
      screen.getByLabelText('Open Wi-Fi network (no password)'),
    ).not.toBeChecked();
    await fireEvent.click(
      screen.getByRole('button', {
        name: /Guest/,
      }),
    );
    expect(
      screen.getByLabelText('Open Wi-Fi network (no password)'),
    ).toBeChecked();
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await screen.findByText(/Configuration saved/);
    expect(
      port.requests.find((request) => request.op === 'configure'),
    ).toMatchObject({
      op: 'configure',
      config: {
        wifi_ssid: 'Guest',
        wifi_password: '',
      },
    });
    await fireEvent.input(screen.getByLabelText('Wi-Fi name'), {
      target: {
        value: 'Hidden',
      },
    });
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Hidden');
  });
  it('shows the scanning state and handles empty results and firmware errors', async () => {
    const port = new PageDevicePort();
    exposePort(port);
    await showPage();
    await connect();
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Scan Wi-Fi networks',
      }),
    );
    expect(
      screen.getByRole('button', {
        name: 'Scanning Wi-Fi…',
      }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Wi-Fi name')).toBeDisabled();
    port.send({
      reply: 'wifi-scan',
      networks: [],
    });
    await screen.findByText(/No networks found/);
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Scan Wi-Fi networks',
      }),
    );
    port.send({
      reply: 'error',
      message: 'Wi-Fi is busy connecting; try scanning again shortly',
    });
    await screen.findByText(/Wi-Fi is busy connecting/);
    expect(screen.getByLabelText('Wi-Fi name')).toBeEnabled();
  });
  it('explains unsupported browsers without trying to connect, and prefills the saved display', async () => {
    vi.stubGlobal('navigator', {});
    await showPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'desktop Chrome or Edge',
    );
    expect(
      screen.getByRole('button', {
        name: 'Connect device',
      }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Display ID')).toHaveValue('owner123-screen');
    expect(
      screen.getByRole('button', {
        name: 'Save to device',
      }),
    ).toBeDisabled();
  });
  it('requires HTTPS or localhost', async () => {
    vi.stubGlobal('isSecureContext', false);
    exposePort(new PageDevicePort());
    await showPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'HTTPS or on localhost',
    );
    expect(
      screen.getByRole('button', {
        name: 'Connect device',
      }),
    ).toBeDisabled();
  });
  it('saves directly over USB and clears the password after acknowledgement', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const port = new PageDevicePort(() => ({
      reply: 'saved',
      reboot_required: true,
    }));
    const picker = exposePort(port);
    await showPage();
    expect(picker).not.toHaveBeenCalled();
    await connect();
    await fillConfig();
    expect(picker).toHaveBeenCalledWith({
      filters: [
        {
          usbVendorId: 0xc0de,
          usbProductId: 0xcafe,
        },
      ],
    });
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests).toEqual([
      {
        op: 'config',
      },
      {
        op: 'logs',
        after: 0,
      },
      {
        op: 'configure',
        config,
      },
    ]);
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue('');
    expect(window.localStorage.length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Disconnect',
      }),
    );
    await screen.findByText('No device connected');
    expect(port.close).toHaveBeenCalledOnce();
  });
  it('loads saved security and saves a WPA3 selection without exporting or replacing the password', async () => {
    const port = new PageDevicePort(
      () => ({
        reply: 'saved',
        reboot_required: true,
      }),
      1,
      {
        wifi_ssid: 'Saved network',
        wifi_security: 'auto',
        service_origin: 'https://panel.xr.se/',
        display_id: 'device-screen',
        wifi_password_set: true,
      },
    );
    exposePort(port);
    await showPage('/device');
    await connect();
    expect(screen.getByLabelText('Wi-Fi security')).toHaveTextContent(
      'Automatic (WPA2/WPA3)',
    );
    await fireEvent.click(screen.getByLabelText('Wi-Fi security'));
    await fireEvent.keyDown(
      await screen.findByRole('option', { name: 'WPA3 only' }),
      { key: 'Enter' },
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests.find((request) => request.op === 'configure')).toEqual(
      {
        op: 'configure',
        config: {
          wifi_ssid: 'Saved network',
          wifi_security: 'wpa3',
          service_origin: 'https://panel.xr.se/',
          display_id: 'device-screen',
        },
      },
    );
  });
  it('keeps credentials editable when the device refuses a save', async () => {
    const port = new PageDevicePort(() => ({
      reply: 'error',
      message: 'error: settings not saved',
    }));
    exposePort(port);
    await showPage();
    await connect();
    await fillConfig();
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'settings not saved',
    );
    expect(screen.queryByText(/Configuration saved/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue(
      config.wifi_password,
    );
    expect(
      screen.getByRole('button', {
        name: 'Save to device',
      }),
    ).toBeEnabled();
  });
  it('automatically reads all log pages, reports overwritten entries, and renders UTC or uptime', async () => {
    const port = new PageDevicePort((request) => {
      if (request.op !== 'logs') {
        return undefined;
      }
      return request.after === 0
        ? {
            reply: 'logs',
            entries: [
              {
                seq: 14,
                uptime_ms: 5,
                unix_ms: null,
                level: 'info',
                message: 'Booted',
              },
            ],
            next: 14,
            lost: 13,
            more: true,
          }
        : {
            reply: 'logs',
            entries: [
              {
                seq: 15,
                uptime_ms: 500,
                unix_ms: 1790985600000,
                level: 'info',
                message: 'NTP synchronized',
              },
            ],
            next: 15,
            lost: 0,
            more: false,
          };
    });
    exposePort(port);
    await showPage();
    await connect();
    await screen.findByText('NTP synchronized');
    expect(screen.getByText('Booted')).toBeInTheDocument();
    expect(
      screen.getByText(/13 log entries were overwritten/),
    ).toBeInTheDocument();
    expect(screen.getByText(/UTC unsynced/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-03T00:00:00.000Z/)).toBeInTheDocument();
    expect(port.requests).toEqual([
      {
        op: 'config',
      },
      {
        op: 'logs',
        after: 0,
      },
      {
        op: 'logs',
        after: 14,
      },
    ]);
    expect(
      screen.getByRole('button', {
        name: 'Download logs',
      }),
    ).toBeEnabled();
  });
  it('follows logs without overlapping requests and releases USB on navigation', async () => {
    const port = new PageDevicePort(() => ({
      reply: 'logs',
      entries: [
        {
          seq: 1,
          uptime_ms: 0,
          unix_ms: null,
          level: 'info',
          message: 'Booted',
        },
      ],
      next: 1,
      lost: 0,
      more: false,
    }));
    exposePort(port);
    const view = await showPage();
    await connect();
    await screen.findByText('Booted');
    expect(
      screen.getByRole('button', {
        name: 'Stop following',
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Save to device',
      }),
    ).toBeEnabled();
    view.unmount();
    await waitFor(() => expect(port.close).toHaveBeenCalledOnce());
    expect(port.readable.locked).toBe(false);
    expect(port.writable.locked).toBe(false);
  });
  it('copies collected logs with timestamps and reports clipboard failures', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const port = new PageDevicePort((request) => ({
      reply: 'logs',
      entries:
        request.op === 'logs' && request.after === 0
          ? [
              {
                seq: 1,
                uptime_ms: 10,
                unix_ms: null,
                level: 'info',
                message: 'Booted',
              },
            ]
          : [],
      next: 1,
      lost: 0,
      more: false,
    }));
    exposePort(port);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });
    await showPage();
    expect(
      screen.getByRole('button', {
        name: 'Copy logs',
      }),
    ).toBeDisabled();
    await connect();
    await screen.findByText('Booted');
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy logs',
      }),
    );
    await screen.findByText('Logs copied.');
    expect(writeText).toHaveBeenCalledWith(
      '#1 · UTC unsynced · +10 ms · info\nBooted',
    );
    writeText.mockRejectedValueOnce(new Error('Denied'));
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy logs',
      }),
    );
    await screen.findByText(
      'Could not copy logs. Try downloading them instead.',
    );
    expect(
      screen.getByRole('button', {
        name: 'Download logs',
      }),
    ).toBeEnabled();
  });
  it('queues a save behind an in-flight log request and resumes streaming', async () => {
    const port = new PageDevicePort((request) =>
      request.op === 'logs'
        ? undefined
        : {
            reply: 'saved',
            reboot_required: false,
          },
    );
    // Hold the next log response instead of the default empty fixture response.
    const originalSend = port.send.bind(port);
    let holdLogs = true;
    port.send = (reply) => {
      if (reply.reply !== 'logs' || !holdLogs) originalSend(reply);
    };
    exposePort(port);
    await showPage();
    await connect();
    await waitFor(() =>
      expect(port.requests).toContainEqual({
        op: 'logs',
        after: 0,
      }),
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    expect(port.requests).toHaveLength(2);
    holdLogs = false;
    originalSend({
      reply: 'logs',
      entries: [],
      next: 0,
      lost: 0,
      more: false,
    });
    await screen.findByText('Configuration saved.');
    expect(port.requests[2]).toMatchObject({
      op: 'configure',
    });
    await waitFor(() =>
      expect(
        port.requests.filter((request) => request.op === 'logs').length,
      ).toBeGreaterThan(1),
    );
    expect(
      screen.getByRole('button', {
        name: 'Stop following',
      }),
    ).toBeEnabled();
  });
  it('presents diagnostics, retains the exact raw snapshot, and copies it', async () => {
    const details =
      'wifi=online ip=192.168.1.42 ntp=synced time=synced\nhttps=tls api_departures=4 api_data_age_ms=1500 scene=text scan=dma future_field=42';
    const writeText = vi.fn().mockResolvedValue(undefined);
    const port = new PageDevicePort((request) =>
      request.op === 'status'
        ? {
            reply: 'status',
            details,
          }
        : undefined,
    );
    exposePort(port);
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });
    await showPage();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Current device diagnostics' }),
    );
    expect(
      await screen.findByRole('button', {
        name: 'Read diagnostics',
      }),
    ).toBeDisabled();
    await connect();
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Read diagnostics',
      }),
    );
    await screen.findByRole('heading', {
      name: 'Wi-Fi connection',
    });
    expect(screen.getByText('Age of departure data')).toBeInTheDocument();
    expect(screen.getByText('1.5 s')).toBeInTheDocument();
    expect(document.querySelector('pre')?.textContent).toBe(details);
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy diagnostics',
      }),
    );
    await screen.findByText('Diagnostics copied.');
    expect(writeText).toHaveBeenCalledWith(details);
    writeText.mockRejectedValueOnce(new Error('Denied'));
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Copy diagnostics',
      }),
    );
    await screen.findByText(
      'Could not copy diagnostics. Select and copy the raw text below.',
    );
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Disconnect',
      }),
    );
    await screen.findByText('No device connected');
    expect(
      screen.getByRole('button', {
        name: 'Copy diagnostics',
      }),
    ).toBeEnabled();
  });
  it('handles picker cancellation without an error', async () => {
    const requestPort = vi
      .fn()
      .mockRejectedValue(new DOMException('No port selected', 'NotFoundError'));
    vi.stubGlobal('navigator', {
      serial: {
        requestPort,
      },
    });
    await showPage();
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Connect device',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: 'Connect device',
        }),
      ).toBeEnabled(),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
  it('downloads only collected logs as JSON lines', async () => {
    const entry = {
      seq: 1,
      uptime_ms: 10,
      unix_ms: null,
      level: 'info',
      message: 'Booted',
    };
    const port = new PageDevicePort(() => ({
      reply: 'logs',
      entries: [entry],
      next: 1,
      lost: 0,
      more: false,
    }));
    const createObjectURL = vi
      .fn<(blob: NodeBlob) => string>()
      .mockReturnValue('blob:logs');
    vi.stubGlobal(
      'URL',
      Object.assign(class extends URL {}, {
        createObjectURL,
        revokeObjectURL: vi.fn(),
      }),
    );
    vi.stubGlobal('Blob', NodeBlob);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    exposePort(port);
    await showPage();
    await connect();
    await screen.findByText('Booted');
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Download logs',
      }),
    );
    expect(click).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/x-ndjson');
    expect(await blob.text()).toBe(JSON.stringify(entry) + '\n');
  });
  it('preserves the saved password when updating public settings', async () => {
    const port = new PageDevicePort(() => ({
      reply: 'saved',
      reboot_required: true,
    }));
    exposePort(port);
    await showPage();
    await connect();
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Saved network');
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue('');
    expect(screen.getByLabelText('Wi-Fi password')).toBeDisabled();
    expect(screen.getByLabelText('Update Wi-Fi password')).not.toBeChecked();
    expect(screen.getByText(/A Wi-Fi password is saved/)).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Display ID'), {
      target: {
        value: 'another-screen',
      },
    });
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests.find((request) => request.op === 'configure')).toEqual(
      {
        op: 'configure',
        config: {
          wifi_ssid: 'Saved network',
          service_origin: 'https://panel.xr.se/',
          display_id: 'another-screen',
        },
      },
    );
    expect(
      port.writes.find((write) => write.includes('configure')),
    ).not.toContain('wifi_password');
  });
  it('requires an explicit choice to clear the Wi-Fi password for an open network', async () => {
    const port = new PageDevicePort(() => ({
      reply: 'saved',
      reboot_required: true,
    }));
    exposePort(port);
    await showPage();
    await connect();
    await fireEvent.click(screen.getByLabelText('Update Wi-Fi password'));
    await fireEvent.submit(
      screen.getByRole('form', {
        name: 'USB device configuration',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a Wi-Fi password',
    );
    expect(port.requests.filter((request) => request.op !== 'logs')).toEqual([
      {
        op: 'config',
      },
    ]);
    await fireEvent.click(
      screen.getByLabelText('Open Wi-Fi network (no password)'),
    );
    await fireEvent.click(
      await screen.findByRole('button', {
        name: 'Save to device',
      }),
    );
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests.find((request) => request.op === 'configure')).toEqual(
      {
        op: 'configure',
        config: {
          ...config,
          wifi_ssid: 'Saved network',
          wifi_password: '',
        },
      },
    );
    expect(screen.getByText(/No Wi-Fi password is saved/)).toBeInTheDocument();
  });
  it('reads saved device settings automatically and reloads them for review', async () => {
    const port = new PageDevicePort();
    exposePort(port);
    await showPage('/device');
    await connect();
    expect(port.requests.filter((request) => request.op !== 'logs')).toEqual([
      {
        op: 'config',
      },
    ]);
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Saved network');
    expect(screen.getByLabelText('Display ID')).toHaveValue('device-screen');
    expect(screen.queryByLabelText('Load config file')).not.toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Wi-Fi name'), {
      target: {
        value: 'Unsaved name',
      },
    });
    await fireEvent.click(screen.getByLabelText('Update Wi-Fi password'));
    await fireEvent.input(screen.getByLabelText('Wi-Fi password'), {
      target: {
        value: 'new-secret',
      },
    });
    await fireEvent.click(
      screen.getByRole('button', {
        name: 'Reload settings',
      }),
    );
    await screen.findByText('Saved settings loaded from the device.');
    expect(port.requests.filter((request) => request.op !== 'logs')).toEqual([
      {
        op: 'config',
      },
      {
        op: 'config',
      },
    ]);
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Saved network');
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue('');
    expect(screen.getByLabelText('Update Wi-Fi password')).not.toBeChecked();
  });
});
