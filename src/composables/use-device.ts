import { uploadFirmware, outcome } from '@/lib/firmware-updater';
import type { Package, Phase } from '@/lib/firmware-updater';
import type { DeviceInfo, UpdateIdentity } from '@/lib/firmware-protocol';
import { useRoute } from 'vue-router';
import { ref, shallowRef, computed, watch, onBeforeUnmount } from 'vue';

import {
  DeviceSerialClient,
  getDeviceSerialApi,
  validateDeviceConfig,
} from '@/lib/device-serial';
import type {
  DeviceConfig,
  DeviceLogEntry,
  DeviceRequest,
  SavedDeviceConfig,
  WifiNetwork,
} from '@/lib/device-serial';
export function useDevice() {
  const route = useRoute();
  const config = ref<DeviceConfig>({
    wifi_ssid: '',
    wifi_password: '',
    service_origin:
      window.location.protocol === 'https:'
        ? `${window.location.origin}/`
        : 'https://panel.xr.se/',
    display_id:
      (typeof route.query.display === 'string' ? route.query.display : null) ??
      '',
  });
  const connection = ref<Connection>('disconnected');
  const openNetwork = ref(false);
  const changePassword = ref(false);
  const passwordSet = ref(false);
  const busy = ref<
    'config' | 'settings' | 'status' | 'wifi-scan' | 'update' | null
  >(null);
  const networks = ref<WifiNetwork[] | null>(null);
  const readingLogs = ref(false);
  const following = ref(false);
  const logs = ref<DeviceLogEntry[]>([]);
  const lost = ref(0);
  const diagnosticsCopyStatus = ref<string | null>(null);
  const status = ref<string | null>(null);
  const notice = ref<string | null>(null);
  const error = ref<string | null>(null);
  const firmwareInfo = shallowRef<DeviceInfo | null>(null);
  const firmwarePhase = ref<Phase | null>(null);
  const firmwareBytes = ref(0);
  const firmwareOutcome = ref<string | null>(null);
  let cancellation: AbortController | null = null;
  let expectedUpdate: (UpdateIdentity & { device_id: string }) | null = null;
  try {
    const stored = JSON.parse(localStorage.getItem('slpanel-update') ?? 'null');
    if (
      stored &&
      /^[0-9a-f]{16}$/.test(stored.device_id) &&
      /^[0-9a-f]{64}$/.test(stored.image_id) &&
      /^[0-9a-f]{32}$/.test(stored.attempt_id)
    )
      expectedUpdate = stored;
  } catch {
    /* local state is optional; the device's receipt is authoritative */
  }
  const client = shallowRef<DeviceSerialClient | null>(null);
  const mounted = shallowRef(true);
  const generation = shallowRef(0);
  const follow = shallowRef(false);
  const cursor = shallowRef(0);
  const logReader = shallowRef(false);
  const requests = shallowRef<Promise<unknown>>(Promise.resolve());
  const copyStatus = ref<string | null>(null);
  const savedSsid = shallowRef('');
  const logViewport = shallowRef<HTMLDivElement | null>(null);
  const secure = window.isSecureContext;
  const supported = Boolean(getDeviceSerialApi());
  const connected = computed(() => connection.value === 'connected');
  watch(
    changePassword,
    (value) => {
      if (!value) {
        config.value.wifi_password = '';
        openNetwork.value = false;
      }
    },
    { flush: 'sync' },
  );
  watch(
    openNetwork,
    (value) => {
      if (value) {
        config.value.wifi_password = '';
        if (config.value.wifi_security !== undefined)
          config.value.wifi_security = 'auto';
      }
    },
    { flush: 'sync' },
  );
  onBeforeUnmount(() => {
    mounted.value = false;
    generation.value += 1;
    follow.value = false;
    const current = client.value;
    client.value = null;
    config.value.wifi_password = '';
    void current?.disconnect();
  });
  watch(
    [following, logs],
    () => {
      if (following.value && logViewport.value)
        logViewport.value.scrollTop = logViewport.value.scrollHeight;
    },
    { flush: 'post' },
  );
  async function connect() {
    const api = getDeviceSerialApi();
    if (!api || !secure) {
      return;
    }
    const attempt = ++generation.value;
    let connecting: DeviceSerialClient | null = null;
    networks.value = null;
    connection.value = 'connecting';
    error.value = null;
    notice.value = null;
    try {
      // Invoke the picker directly from the click, preserving user activation.
      const port = await api.requestPort({
        filters: [
          {
            usbVendorId: 0xc0de,
            usbProductId: 0xcafe,
          },
        ],
      });
      if (!mounted.value || generation.value !== attempt) {
        return;
      }
      const next = new DeviceSerialClient(port, (failure) => {
        if (!mounted.value || generation.value !== attempt) {
          return;
        }
        follow.value = false;
        following.value = false;
        readingLogs.value = false;
        connection.value = 'disconnected';
        busy.value = null;
        error.value = failure.message;
        client.value = null;
      });
      connecting = next;
      client.value = next;
      await next.connect();
      const saved = await next.request({
        op: 'config',
      });
      if (saved.reply !== 'config') {
        throw new Error(
          'Could not read device settings. Update the firmware and reconnect.',
        );
      }
      if (!mounted.value || generation.value !== attempt) {
        await next.disconnect();
        return;
      }
      firmwareInfo.value = null;
      if (next.protocolVersion === 2) {
        const info = await next.request({ op: 'device-info' });
        if (info.reply !== 'device-info')
          throw new Error('Could not read firmware capabilities.');
        if (!mounted.value || generation.value !== attempt) {
          await next.disconnect();
          return;
        }
        firmwareInfo.value = info;
      }
      requests.value = Promise.resolve();
      logReader.value = false;
      cursor.value = 0;
      logs.value = [];
      copyStatus.value = null;
      lost.value = 0;
      status.value = null;
      diagnosticsCopyStatus.value = null;
      applySavedConfig(saved.config, true);
      connection.value = 'connected';
      notice.value = 'Device connected. Saved settings loaded.';
      if (expectedUpdate) void checkFirmware();
      else void readLogs(true);
    } catch (failure) {
      await connecting?.disconnect();
      if (!mounted.value || generation.value !== attempt) {
        return;
      }
      client.value = null;
      connection.value = 'disconnected';
      if (failure instanceof DOMException && failure.name === 'NotFoundError') {
        return;
      }
      error.value =
        failure instanceof Error
          ? failure.message
          : 'Could not connect. Close other apps using the USB port and try again.';
    }
  }
  async function disconnect() {
    generation.value += 1;
    follow.value = false;
    following.value = false;
    readingLogs.value = false;
    const current = client.value;
    client.value = null;
    connection.value = 'disconnecting';
    await current?.disconnect();
    if (mounted.value) {
      connection.value = 'disconnected';
      busy.value = null;
      notice.value = 'Device disconnected.';
    }
  }
  async function request(request: DeviceRequest, current: DeviceSerialClient) {
    const pending = requests.value.then(() => {
      if (client.value !== current) {
        throw new Error('Device disconnected.');
      }
      return current.request(request);
    });
    requests.value = pending.catch(() => undefined);
    const reply = await pending;
    if (reply.reply === 'error') {
      throw new Error(reply.message);
    }
    return reply;
  }
  async function save() {
    const current = client.value;
    if (!current || busy.value) {
      return;
    }
    const attempt = generation.value;
    error.value = null;
    notice.value = null;
    try {
      if (
        changePassword.value &&
        !openNetwork.value &&
        !config.value.wifi_password
      ) {
        throw new Error(
          'Enter a Wi-Fi password, or select an open Wi-Fi network.',
        );
      }
      const update: DeviceConfig = {
        wifi_ssid: config.value.wifi_ssid,
        wifi_security: config.value.wifi_security,
        service_origin: config.value.service_origin,
        display_id: config.value.display_id,
        ...(changePassword.value
          ? {
              wifi_password: openNetwork.value
                ? ''
                : config.value.wifi_password,
            }
          : {}),
      };
      validateDeviceConfig(update);
      busy.value = 'config';
      const reply = await request(
        {
          op: 'configure',
          config: update,
        },
        current,
      );
      if (!mounted.value || generation.value !== attempt) {
        return;
      }
      if (reply.reply === 'saved') {
        savedSsid.value = update.wifi_ssid;
        if (changePassword.value) {
          passwordSet.value = !openNetwork.value;
        }
        changePassword.value = false;
        openNetwork.value = false;
        config.value = {
          ...config.value,
          wifi_password: '',
        };
        notice.value = reply.reboot_required
          ? 'Configuration saved. Reboot the device to apply it.'
          : 'Configuration saved.';
      }
    } catch (failure) {
      if (mounted.value && generation.value === attempt) {
        error.value = readError(failure);
      }
    } finally {
      if (mounted.value && generation.value === attempt) {
        busy.value = null;
      }
    }
  }
  function applySavedConfig(
    saved: SavedDeviceConfig,
    useSelectedDisplay = false,
  ) {
    savedSsid.value = saved.wifi_ssid;
    config.value = {
      wifi_ssid: saved.wifi_ssid,
      wifi_security: saved.wifi_security,
      wifi_password: '',
      service_origin: saved.service_origin,
      display_id: useSelectedDisplay
        ? ((typeof route.query.display === 'string'
            ? route.query.display
            : null) ?? saved.display_id)
        : saved.display_id,
    };
    passwordSet.value = saved.wifi_password_set;
    changePassword.value = false;
    openNetwork.value = false;
  }
  async function readSettings() {
    const current = client.value;
    if (!current || busy.value) {
      return;
    }
    const attempt = generation.value;
    busy.value = 'settings';
    error.value = null;
    notice.value = null;
    try {
      const reply = await request(
        {
          op: 'config',
        },
        current,
      );
      if (!mounted.value || generation.value !== attempt) {
        return;
      }
      if (reply.reply === 'config') {
        applySavedConfig(reply.config);
        notice.value = 'Saved settings loaded from the device.';
      }
    } catch (failure) {
      if (mounted.value && generation.value === attempt) {
        error.value = readError(failure);
      }
    } finally {
      if (mounted.value && generation.value === attempt) {
        busy.value = null;
      }
    }
  }
  async function readLogs(keepFollowing: boolean) {
    const current = client.value;
    if (!current || logReader.value || busy.value === 'update') {
      return;
    }
    logReader.value = true;
    readingLogs.value = true;
    const attempt = generation.value;
    follow.value = keepFollowing;
    following.value = keepFollowing;
    error.value = null;
    try {
      do {
        const reply = await request(
          {
            op: 'logs',
            after: cursor.value,
          },
          current,
        );
        if (!mounted.value || generation.value !== attempt) {
          return;
        }
        if (reply.reply !== 'logs') {
          throw new Error('Unexpected logs response.');
        }
        cursor.value = reply.next;
        logs.value = [...logs.value, ...reply.entries].slice(-1000);
        lost.value = lost.value + reply.lost;
        // Finish paging on a single read. Stop following after any in-flight page.
        if (keepFollowing && !follow.value) {
          break;
        }
        if (reply.more) {
          continue;
        }
        if (!follow.value) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      } while (
        mounted.value &&
        generation.value === attempt &&
        (!keepFollowing || follow.value)
      );
    } catch (failure) {
      if (mounted.value && generation.value === attempt) {
        error.value = readError(failure);
      }
    } finally {
      if (mounted.value && generation.value === attempt) {
        logReader.value = false;
        readingLogs.value = false;
        follow.value = false;
        following.value = false;
      }
    }
  }
  async function scanWifi() {
    const current = client.value;
    if (!current || busy.value) return;
    const attempt = generation.value;
    busy.value = 'wifi-scan';
    networks.value = null;
    error.value = null;
    notice.value = null;
    try {
      const reply = await request(
        {
          op: 'wifi-scan',
        },
        current,
      );
      if (
        mounted.value &&
        generation.value === attempt &&
        reply.reply === 'wifi-scan'
      ) {
        networks.value = reply.networks;
      }
    } catch (failure) {
      if (mounted.value && generation.value === attempt)
        error.value = readError(failure);
    } finally {
      if (mounted.value && generation.value === attempt) busy.value = null;
    }
  }
  function selectNetwork(network: WifiNetwork) {
    // A draft SSID may differ from the network owning the durable password.
    const changed = network.ssid !== savedSsid.value;
    config.value = {
      ...config.value,
      wifi_ssid: network.ssid,
      wifi_password: '',
      wifi_security:
        config.value.wifi_security === undefined ? undefined : 'auto',
    };
    changePassword.value = changed || !network.secured || !passwordSet.value;
    openNetwork.value = !network.secured;
  }
  async function readStatus() {
    const current = client.value;
    if (!current || busy.value) {
      return;
    }
    const attempt = generation.value;
    busy.value = 'status';
    error.value = null;
    try {
      const reply = await request(
        {
          op: 'status',
        },
        current,
      );
      if (
        mounted.value &&
        generation.value === attempt &&
        reply.reply === 'status'
      ) {
        status.value = reply.details;
        diagnosticsCopyStatus.value = null;
      }
    } catch (failure) {
      if (mounted.value && generation.value === attempt) {
        error.value = readError(failure);
      }
    } finally {
      if (mounted.value && generation.value === attempt) {
        busy.value = null;
      }
    }
  }
  async function copyDiagnostics() {
    if (status.value === null) return;
    try {
      await navigator.clipboard.writeText(status.value);
      if (mounted.value) diagnosticsCopyStatus.value = 'Diagnostics copied.';
    } catch {
      if (mounted.value)
        diagnosticsCopyStatus.value =
          'Could not copy diagnostics. Select and copy the raw text below.';
    }
  }
  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(
        logs.value
          .map(
            (entry) =>
              `#${entry.seq} · ${timestamp(entry)} · +${entry.uptime_ms} ms · ${entry.level}\n${entry.message}`,
          )
          .join('\n\n'),
      );
      if (mounted.value) copyStatus.value = 'Logs copied.';
    } catch {
      if (mounted.value)
        copyStatus.value = 'Could not copy logs. Try downloading them instead.';
    }
  }
  function downloadLogs() {
    const url = URL.createObjectURL(
      new Blob(
        [logs.value.map((entry) => JSON.stringify(entry)).join('\n') + '\n'],
        {
          type: 'application/x-ndjson',
        },
      ),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'slpanel-logs.jsonl';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  type Connection =
    'disconnected' | 'connecting' | 'connected' | 'disconnecting';

  function toggleFollowing() {
    if (following.value) {
      follow.value = false;
      following.value = false;
    } else {
      void readLogs(true);
    }
  }

  async function updateFirmware(pkg: Package) {
    const current = client.value,
      info = firmwareInfo.value;
    if (!current || !info || busy.value) return;
    follow.value = false;
    following.value = false;
    busy.value = 'update';
    error.value = null;
    firmwareOutcome.value = null;
    cancellation = new AbortController();
    try {
      await requests.value;
      await uploadFirmware(
        pkg,
        info,
        (r) => request(r, current),
        (phase, bytes) => {
          firmwarePhase.value = phase;
          firmwareBytes.value = bytes;
        },
        (identity) => {
          expectedUpdate = { ...identity, device_id: info.device_id };
          // Storage failure must not prevent a safe update; keep the receipt in RAM.
          try {
            localStorage.setItem(
              'slpanel-update',
              JSON.stringify(expectedUpdate),
            );
          } catch {
            /* optional */
          }
        },
        cancellation.signal,
      );
      await disconnect();
      notice.value =
        'Firmware restarted. Reconnect this panel to check the result.';
    } catch (failure) {
      error.value = readError(failure);
      if (expectedUpdate)
        notice.value =
          'Reconnect this panel to check whether the update was confirmed.';
    } finally {
      busy.value = null;
      cancellation = null;
    }
  }
  function cancelFirmware() {
    cancellation?.abort();
  }
  async function checkFirmware() {
    const current = client.value,
      info = firmwareInfo.value;
    if (!current || !info || !expectedUpdate || busy.value) return;
    busy.value = 'update';
    follow.value = false;
    following.value = false;
    firmwarePhase.value = 'Checking device';
    try {
      for (let i = 0; i < 35 && client.value === current; i++) {
        const status = await request({ op: 'update-status' }, current);
        if (status.reply !== 'update-status')
          throw new Error('Could not read the update result.');
        const result = outcome(expectedUpdate, info, status.last_result);
        if (result) {
          firmwareOutcome.value = result;
          firmwarePhase.value = null;
          expectedUpdate = null;
          try {
            localStorage.removeItem('slpanel-update');
          } catch {
            /* optional */
          }
          return;
        }
        if (!['trial', 'pending'].includes(status.state)) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      notice.value =
        'The device has not reported a terminal result for this update yet.';
    } catch (failure) {
      error.value = readError(failure);
    } finally {
      busy.value = null;
    }
  }
  return {
    firmwareInfo,
    firmwarePhase,
    firmwareBytes,
    firmwareOutcome,
    updateFirmware,
    cancelFirmware,
    checkFirmware,
    config,
    connection,
    openNetwork,
    changePassword,
    passwordSet,
    busy,
    networks,
    readingLogs,
    following,
    logs,
    lost,
    diagnosticsCopyStatus,
    status,
    notice,
    error,
    copyStatus,
    logViewport,
    secure,
    supported,
    connected,
    connect,
    disconnect,
    save,
    scanWifi,
    selectNetwork,
    readSettings,
    readLogs,
    readStatus,
    copyDiagnostics,
    copyLogs,
    downloadLogs,
    toggleFollowing,
  };
}
function readError(error: unknown): string {
  return error instanceof Error ? error.message : 'Device operation failed.';
}
function timestamp(entry: DeviceLogEntry): string {
  if (entry.unix_ms === null) {
    return 'UTC unsynced';
  }
  const date = new Date(entry.unix_ms);
  return Number.isNaN(date.getTime())
    ? `UTC(ms) ${entry.unix_ms}`
    : date.toISOString();
}
