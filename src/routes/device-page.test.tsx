import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Blob as NodeBlob } from 'node:buffer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';

import { DevicePage } from '@/routes/device-page';
import type { DeviceConfig, DeviceSerialApi } from '@/lib/device-serial';
import { TestDevicePort } from '@/test/device-port';

const config: DeviceConfig = {
  wifi_ssid: ' net  work ',
  wifi_password: ' pass  word ',
  service_origin: 'https://panel.xr.se/',
  display_id: 'owner123-screen',
};

function showPage(path = '/device?display=owner123-screen') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <DevicePage />
    </MemoryRouter>,
  );
}
function exposePort(port: TestDevicePort) {
  const requestPort = vi
    .fn<DeviceSerialApi['requestPort']>()
    .mockResolvedValue(port);
  vi.stubGlobal('navigator', { serial: { requestPort } });
  return requestPort;
}
async function connect() {
  fireEvent.click(screen.getByRole('button', { name: 'Connect device' }));
  await screen.findByText('Connected via USB');
}
function fillConfig() {
  fireEvent.click(screen.getByLabelText('Update Wi-Fi password'));
  fireEvent.change(screen.getByLabelText('Wi-Fi name'), {
    target: { value: config.wifi_ssid },
  });
  fireEvent.change(screen.getByLabelText('Wi-Fi password'), {
    target: { value: config.wifi_password },
  });
}

describe('DevicePage', () => {
  beforeEach(() => {
    vi.stubGlobal('isSecureContext', true);
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('explains unsupported browsers without trying to connect, and prefills the saved display', () => {
    vi.stubGlobal('navigator', {});
    showPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'desktop Chrome or Edge',
    );
    expect(
      screen.getByRole('button', { name: 'Connect device' }),
    ).toBeDisabled();
    expect(screen.getByLabelText('Display ID')).toHaveValue('owner123-screen');
    expect(
      screen.getByRole('button', { name: 'Save to device' }),
    ).toBeDisabled();
  });

  it('requires HTTPS or localhost', () => {
    vi.stubGlobal('isSecureContext', false);
    exposePort(new TestDevicePort());
    showPage();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'HTTPS or on localhost',
    );
    expect(
      screen.getByRole('button', { name: 'Connect device' }),
    ).toBeDisabled();
  });

  it('saves directly over USB and clears the password after acknowledgement', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const port = new TestDevicePort(() => ({
      reply: 'saved',
      reboot_required: true,
    }));
    const picker = exposePort(port);
    showPage();
    expect(picker).not.toHaveBeenCalled();
    await connect();
    fillConfig();
    expect(picker).toHaveBeenCalledWith({
      filters: [{ usbVendorId: 0xc0de, usbProductId: 0xcafe }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to device' }));
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests).toEqual([
      { op: 'config' },
      { op: 'configure', config },
    ]);
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue('');
    expect(window.localStorage.length).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await screen.findByText('No device connected');
    expect(port.close).toHaveBeenCalledOnce();
  });

  it('loads saved security and saves a WPA3 selection without exporting or replacing the password', async () => {
    const port = new TestDevicePort(
      () => ({ reply: 'saved', reboot_required: true }),
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
    showPage('/device');
    await connect();
    expect(screen.getByLabelText('Wi-Fi security')).toHaveValue('auto');
    fireEvent.change(screen.getByLabelText('Wi-Fi security'), {
      target: { value: 'wpa3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to device' }));
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests.at(-1)).toEqual({
      op: 'configure',
      config: {
        wifi_ssid: 'Saved network',
        wifi_security: 'wpa3',
        service_origin: 'https://panel.xr.se/',
        display_id: 'device-screen',
      },
    });
  });

  it('keeps credentials editable when the device refuses a save', async () => {
    const port = new TestDevicePort(() => ({
      reply: 'error',
      message: 'error: settings not saved',
    }));
    exposePort(port);
    showPage();
    await connect();
    fillConfig();
    fireEvent.click(screen.getByRole('button', { name: 'Save to device' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'settings not saved',
    );
    expect(screen.queryByText(/Configuration saved/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue(
      config.wifi_password,
    );
    expect(
      screen.getByRole('button', { name: 'Save to device' }),
    ).toBeEnabled();
  });

  it('reads all log pages, reports overwritten entries, and renders UTC or uptime', async () => {
    const port = new TestDevicePort((request) => {
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
    showPage();
    await connect();
    fireEvent.click(screen.getByRole('button', { name: 'Read logs' }));
    await screen.findByText('NTP synchronized');
    expect(screen.getByText('Booted')).toBeInTheDocument();
    expect(
      screen.getByText(/13 log entries were overwritten/),
    ).toBeInTheDocument();
    expect(screen.getByText(/UTC unsynced/)).toBeInTheDocument();
    expect(screen.getByText(/2026-10-03T00:00:00.000Z/)).toBeInTheDocument();
    expect(port.requests).toEqual([
      { op: 'config' },
      { op: 'logs', after: 0 },
      { op: 'logs', after: 14 },
    ]);
    expect(screen.getByRole('button', { name: 'Download logs' })).toBeEnabled();
  });

  it('follows logs without overlapping requests and releases USB on navigation', async () => {
    const port = new TestDevicePort(() => ({
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
    const view = showPage();
    await connect();
    fireEvent.click(screen.getByRole('button', { name: 'Follow logs' }));
    await screen.findByText('Booted');
    expect(
      screen.getByRole('button', { name: 'Stop following' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Save to device' }),
    ).toBeDisabled();
    view.unmount();
    await waitFor(() => expect(port.close).toHaveBeenCalledOnce());
    expect(port.readable.locked).toBe(false);
    expect(port.writable.locked).toBe(false);
  });

  it('handles picker cancellation without an error', async () => {
    const requestPort = vi
      .fn()
      .mockRejectedValue(new DOMException('No port selected', 'NotFoundError'));
    vi.stubGlobal('navigator', { serial: { requestPort } });
    showPage();
    fireEvent.click(screen.getByRole('button', { name: 'Connect device' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Connect device' }),
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
    const port = new TestDevicePort(() => ({
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
    showPage();
    await connect();
    fireEvent.click(screen.getByRole('button', { name: 'Read logs' }));
    await screen.findByText('Booted');
    fireEvent.click(screen.getByRole('button', { name: 'Download logs' }));
    expect(click).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/x-ndjson');
    expect(await blob.text()).toBe(JSON.stringify(entry) + '\n');
  });

  it('preserves the saved password when updating public settings', async () => {
    const port = new TestDevicePort(() => ({
      reply: 'saved',
      reboot_required: true,
    }));
    exposePort(port);
    showPage();
    await connect();
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Saved network');
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue('');
    expect(screen.getByLabelText('Wi-Fi password')).toBeDisabled();
    expect(screen.getByLabelText('Update Wi-Fi password')).not.toBeChecked();
    expect(screen.getByText(/A Wi-Fi password is saved/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Display ID'), {
      target: { value: 'another-screen' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to device' }));
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests[1]).toEqual({
      op: 'configure',
      config: {
        wifi_ssid: 'Saved network',
        service_origin: 'https://panel.xr.se/',
        display_id: 'another-screen',
      },
    });
    expect(port.writes[1]).not.toContain('wifi_password');
  });

  it('requires an explicit choice to clear the Wi-Fi password for an open network', async () => {
    const port = new TestDevicePort(() => ({
      reply: 'saved',
      reboot_required: true,
    }));
    exposePort(port);
    showPage();
    await connect();
    fireEvent.click(screen.getByLabelText('Update Wi-Fi password'));
    fireEvent.submit(
      screen.getByRole('form', { name: 'USB device configuration' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a Wi-Fi password',
    );
    expect(port.requests).toEqual([{ op: 'config' }]);
    fireEvent.click(screen.getByLabelText('Open Wi-Fi network (no password)'));
    fireEvent.click(screen.getByRole('button', { name: 'Save to device' }));
    await screen.findByText(
      'Configuration saved. Reboot the device to apply it.',
    );
    expect(port.requests[1]).toEqual({
      op: 'configure',
      config: { ...config, wifi_ssid: 'Saved network', wifi_password: '' },
    });
    expect(screen.getByText(/No Wi-Fi password is saved/)).toBeInTheDocument();
  });

  it('reads saved device settings automatically and reloads them for review', async () => {
    const port = new TestDevicePort();
    exposePort(port);
    showPage('/device');
    await connect();
    expect(port.requests).toEqual([{ op: 'config' }]);
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Saved network');
    expect(screen.getByLabelText('Display ID')).toHaveValue('device-screen');
    expect(screen.queryByLabelText('Load config file')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Wi-Fi name'), {
      target: { value: 'Unsaved name' },
    });
    fireEvent.click(screen.getByLabelText('Update Wi-Fi password'));
    fireEvent.change(screen.getByLabelText('Wi-Fi password'), {
      target: { value: 'new-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reload settings' }));
    await screen.findByText('Saved settings loaded from the device.');
    expect(port.requests).toEqual([{ op: 'config' }, { op: 'config' }]);
    expect(screen.getByLabelText('Wi-Fi name')).toHaveValue('Saved network');
    expect(screen.getByLabelText('Wi-Fi password')).toHaveValue('');
    expect(screen.getByLabelText('Update Wi-Fi password')).not.toBeChecked();
  });
});
