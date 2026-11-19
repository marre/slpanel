import { h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render } from '@/test/render';
import FirmwareUpdate from './firmware-update.vue';
import type { DeviceInfo } from '@/lib/firmware-protocol';

const imageId = 'a'.repeat(64);
const release = { image_id: imageId, version: '0.0.6' };
vi.mock('@/lib/firmware-updater', () => ({
  listReleases: vi.fn(async () => [release]),
  downloadRelease: vi.fn(async () => ({
    manifest: { version: '0.0.6' },
    imageId,
    bytes: new Uint8Array(0),
  })),
  readPackage: vi.fn(),
}));

const info: DeviceInfo = {
  device_id: '1234567890abcdef',
  board: 'interstate75w-rp2350',
  layout: 'slpanel-rp2350-4m-v2',
  firmware_version: '0.0.5',
  firmware_revision: 'c'.repeat(40),
  running_image_id: 'b'.repeat(64),
  bootloader_version: '0.1.0',
  capabilities: ['staged-update-v1', 'signed-usb-update-v1'],
  update_limits: {
    image_size: 1572864,
    chunk_bytes: 256,
    checkpoint_bytes: 4096,
  },
  security: { signed_updates: true, hardware_secure_boot: false },
};

async function ready(infoToUse: DeviceInfo, onUpdate = vi.fn()) {
  await render(
    h(FirmwareUpdate, {
      info: infoToUse,
      connected: true,
      busy: false,
      phase: null,
      bytes: 0,
      outcome: null,
      onUpdate,
    }),
  );
  await screen.findByRole('option', { name: release.version });
  await fireEvent.change(
    screen.getByRole('combobox', { name: 'Compatible release' }),
    { target: { value: imageId } },
  );
  await fireEvent.click(
    screen.getByRole('button', { name: 'Download release' }),
  );
  await screen.findByText(/Ready to install 0\.0\.6/);
  return onUpdate;
}

describe('signed firmware installation confirmation', () => {
  it('updates without a GPIO press on capable firmware only after explicit confirmation', async () => {
    const update = await ready(info);
    expect(
      screen.getByText(/No physical button is needed/),
    ).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Update firmware' }),
    );
    expect(
      await screen.findByText('Install firmware update?'),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(update).not.toHaveBeenCalled();
    await fireEvent.click(
      screen.getByRole('button', { name: 'Update firmware' }),
    );
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Install firmware' }),
    );
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('still instructs a physical press for older installed firmware', async () => {
    await ready({ ...info, capabilities: ['staged-update-v1'] });
    expect(
      screen.getByText(/still requires holding the blank-output/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No physical button is needed/),
    ).not.toBeInTheDocument();
  });
});
