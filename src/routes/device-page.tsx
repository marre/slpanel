import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { DeviceDiagnostics } from '@/components/device-diagnostics';
import { DeviceDisplayPicker } from '@/components/device-display-picker';

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
  WifiSecurity,
  WifiNetwork,
} from '@/lib/device-serial';

const buttonClass =
  'rounded border border-[var(--panel-border)] px-4 py-2 text-sm transition hover:border-[var(--panel-text)] hover:text-[var(--panel-text)] disabled:cursor-not-allowed disabled:opacity-40';
const primaryClass = `${buttonClass} border-[var(--panel-text)] bg-[var(--panel-text)] text-white hover:bg-[var(--panel-text-soft)] hover:text-white`;
const inputClass =
  'w-full rounded-lg border border-[var(--panel-border)] bg-white px-4 py-3 text-base md:text-sm';

type Connection = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export function DevicePage() {
  const [searchParams] = useSearchParams();
  const [config, setConfig] = useState<DeviceConfig>(() => ({
    wifi_ssid: '',
    wifi_password: '',
    service_origin:
      window.location.protocol === 'https:'
        ? `${window.location.origin}/`
        : 'https://panel.xr.se/',
    display_id: searchParams.get('display') ?? '',
  }));
  const [connection, setConnection] = useState<Connection>('disconnected');
  const [openNetwork, setOpenNetwork] = useState(false);
  const [changePassword, setChangePassword] = useState(false);
  const [passwordSet, setPasswordSet] = useState(false);
  const [busy, setBusy] = useState<
    'config' | 'settings' | 'status' | 'wifi-scan' | null
  >(null);
  const [networks, setNetworks] = useState<WifiNetwork[] | null>(null);
  const [readingLogs, setReadingLogs] = useState(false);
  const [following, setFollowing] = useState(false);
  const [logs, setLogs] = useState<DeviceLogEntry[]>([]);
  const [lost, setLost] = useState(0);
  const [diagnosticsCopyStatus, setDiagnosticsCopyStatus] = useState<
    string | null
  >(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useRef<DeviceSerialClient | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const follow = useRef(false);
  const cursor = useRef(0);
  const logReader = useRef(false);
  const requests = useRef<Promise<unknown>>(Promise.resolve());
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const savedSsid = useRef('');
  const logViewport = useRef<HTMLDivElement | null>(null);
  const secure = window.isSecureContext;
  const supported = Boolean(getDeviceSerialApi());
  const connected = connection === 'connected';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      follow.current = false;
      const current = client.current;
      client.current = null;
      void current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (following && logViewport.current) {
      logViewport.current.scrollTop = logViewport.current.scrollHeight;
    }
  }, [following, logs]);

  async function connect() {
    const api = getDeviceSerialApi();
    if (!api || !secure) {
      return;
    }
    const attempt = ++generation.current;
    let connecting: DeviceSerialClient | null = null;
    setNetworks(null);
    setConnection('connecting');
    setError(null);
    setNotice(null);
    try {
      // Invoke the picker directly from the click, preserving user activation.
      const port = await api.requestPort({
        filters: [{ usbVendorId: 0xc0de, usbProductId: 0xcafe }],
      });
      if (!mounted.current || generation.current !== attempt) {
        return;
      }
      const next = new DeviceSerialClient(port, (failure) => {
        if (!mounted.current || generation.current !== attempt) {
          return;
        }
        follow.current = false;
        setFollowing(false);
        setReadingLogs(false);
        setConnection('disconnected');
        setBusy(null);
        setError(failure.message);
        client.current = null;
      });
      connecting = next;
      client.current = next;
      await next.connect();
      const saved = await next.request({ op: 'config' });
      if (saved.reply !== 'config') {
        throw new Error(
          'Could not read device settings. Update the firmware and reconnect.',
        );
      }
      if (!mounted.current || generation.current !== attempt) {
        await next.disconnect();
        return;
      }
      requests.current = Promise.resolve();
      logReader.current = false;
      cursor.current = 0;
      setLogs([]);
      setCopyStatus(null);
      setLost(0);
      setStatus(null);
      setDiagnosticsCopyStatus(null);
      applySavedConfig(saved.config, true);
      setConnection('connected');
      setNotice('Device connected. Saved settings loaded.');
      void readLogs(true);
    } catch (failure) {
      await connecting?.disconnect();
      if (!mounted.current || generation.current !== attempt) {
        return;
      }
      client.current = null;
      setConnection('disconnected');
      if (failure instanceof DOMException && failure.name === 'NotFoundError') {
        return;
      }
      setError(
        failure instanceof Error
          ? failure.message
          : 'Could not connect. Close other apps using the USB port and try again.',
      );
    }
  }

  async function disconnect() {
    generation.current += 1;
    follow.current = false;
    setFollowing(false);
    setReadingLogs(false);
    const current = client.current;
    client.current = null;
    setConnection('disconnecting');
    await current?.disconnect();
    if (mounted.current) {
      setConnection('disconnected');
      setBusy(null);
      setNotice('Device disconnected.');
    }
  }

  async function request(request: DeviceRequest, current: DeviceSerialClient) {
    const pending = requests.current.then(() => {
      if (client.current !== current) {
        throw new Error('Device disconnected.');
      }
      return current.request(request);
    });
    requests.current = pending.catch(() => undefined);
    const reply = await pending;
    if (reply.reply === 'error') {
      throw new Error(reply.message);
    }
    return reply;
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = client.current;
    if (!current || busy) {
      return;
    }
    const attempt = generation.current;
    setError(null);
    setNotice(null);
    try {
      if (changePassword && !openNetwork && !config.wifi_password) {
        throw new Error(
          'Enter a Wi-Fi password, or select an open Wi-Fi network.',
        );
      }
      const update: DeviceConfig = {
        wifi_ssid: config.wifi_ssid,
        wifi_security: config.wifi_security,
        service_origin: config.service_origin,
        display_id: config.display_id,
        ...(changePassword
          ? { wifi_password: openNetwork ? '' : config.wifi_password }
          : {}),
      };
      validateDeviceConfig(update);
      setBusy('config');
      const reply = await request({ op: 'configure', config: update }, current);
      if (!mounted.current || generation.current !== attempt) {
        return;
      }
      if (reply.reply === 'saved') {
        savedSsid.current = update.wifi_ssid;
        if (changePassword) {
          setPasswordSet(!openNetwork);
        }
        setChangePassword(false);
        setOpenNetwork(false);
        setConfig((draft) => ({ ...draft, wifi_password: '' }));
        setNotice(
          reply.reboot_required
            ? 'Configuration saved. Reboot the device to apply it.'
            : 'Configuration saved.',
        );
      }
    } catch (failure) {
      if (mounted.current && generation.current === attempt) {
        setError(readError(failure));
      }
    } finally {
      if (mounted.current && generation.current === attempt) {
        setBusy(null);
      }
    }
  }

  function applySavedConfig(
    saved: SavedDeviceConfig,
    useSelectedDisplay = false,
  ) {
    savedSsid.current = saved.wifi_ssid;
    setConfig({
      wifi_ssid: saved.wifi_ssid,
      wifi_security: saved.wifi_security,
      wifi_password: '',
      service_origin: saved.service_origin,
      display_id: useSelectedDisplay
        ? (searchParams.get('display') ?? saved.display_id)
        : saved.display_id,
    });
    setPasswordSet(saved.wifi_password_set);
    setChangePassword(false);
    setOpenNetwork(false);
  }

  async function readSettings() {
    const current = client.current;
    if (!current || busy) {
      return;
    }
    const attempt = generation.current;
    setBusy('settings');
    setError(null);
    setNotice(null);
    try {
      const reply = await request({ op: 'config' }, current);
      if (!mounted.current || generation.current !== attempt) {
        return;
      }
      if (reply.reply === 'config') {
        applySavedConfig(reply.config);
        setNotice('Saved settings loaded from the device.');
      }
    } catch (failure) {
      if (mounted.current && generation.current === attempt) {
        setError(readError(failure));
      }
    } finally {
      if (mounted.current && generation.current === attempt) {
        setBusy(null);
      }
    }
  }

  async function readLogs(keepFollowing: boolean) {
    const current = client.current;
    if (!current || logReader.current) {
      return;
    }
    logReader.current = true;
    setReadingLogs(true);
    const attempt = generation.current;
    follow.current = keepFollowing;
    setFollowing(keepFollowing);
    setError(null);
    try {
      do {
        const reply = await request(
          { op: 'logs', after: cursor.current },
          current,
        );
        if (!mounted.current || generation.current !== attempt) {
          return;
        }
        if (reply.reply !== 'logs') {
          throw new Error('Unexpected logs response.');
        }
        cursor.current = reply.next;
        setLogs((retained) => [...retained, ...reply.entries].slice(-1000));
        setLost((count) => count + reply.lost);
        // Finish paging on a single read. Stop following after any in-flight page.
        if (keepFollowing && !follow.current) {
          break;
        }
        if (reply.more) {
          continue;
        }
        if (!follow.current) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      } while (
        mounted.current &&
        generation.current === attempt &&
        (!keepFollowing || follow.current)
      );
    } catch (failure) {
      if (mounted.current && generation.current === attempt) {
        setError(readError(failure));
      }
    } finally {
      if (mounted.current && generation.current === attempt) {
        logReader.current = false;
        setReadingLogs(false);
        follow.current = false;
        setFollowing(false);
      }
    }
  }

  async function scanWifi() {
    const current = client.current;
    if (!current || busy) return;
    const attempt = generation.current;
    setBusy('wifi-scan');
    setNetworks(null);
    setError(null);
    setNotice(null);
    try {
      const reply = await request({ op: 'wifi-scan' }, current);
      if (
        mounted.current &&
        generation.current === attempt &&
        reply.reply === 'wifi-scan'
      ) {
        setNetworks(reply.networks);
      }
    } catch (failure) {
      if (mounted.current && generation.current === attempt)
        setError(readError(failure));
    } finally {
      if (mounted.current && generation.current === attempt) setBusy(null);
    }
  }

  function selectNetwork(network: WifiNetwork) {
    // A draft SSID may differ from the network owning the durable password.
    const changed = network.ssid !== savedSsid.current;
    setConfig((draft) => ({
      ...draft,
      wifi_ssid: network.ssid,
      wifi_password: '',
      wifi_security: draft.wifi_security === undefined ? undefined : 'auto',
    }));
    setChangePassword(changed || !network.secured || !passwordSet);
    setOpenNetwork(!network.secured);
  }

  async function readStatus() {
    const current = client.current;
    if (!current || busy) {
      return;
    }
    const attempt = generation.current;
    setBusy('status');
    setError(null);
    try {
      const reply = await request({ op: 'status' }, current);
      if (
        mounted.current &&
        generation.current === attempt &&
        reply.reply === 'status'
      ) {
        setStatus(reply.details);
        setDiagnosticsCopyStatus(null);
      }
    } catch (failure) {
      if (mounted.current && generation.current === attempt) {
        setError(readError(failure));
      }
    } finally {
      if (mounted.current && generation.current === attempt) {
        setBusy(null);
      }
    }
  }

  async function copyDiagnostics() {
    if (status === null) return;
    try {
      await navigator.clipboard.writeText(status);
      if (mounted.current) setDiagnosticsCopyStatus('Diagnostics copied.');
    } catch {
      if (mounted.current)
        setDiagnosticsCopyStatus(
          'Could not copy diagnostics. Select and copy the raw text below.',
        );
    }
  }

  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(
        logs
          .map(
            (entry) =>
              `#${entry.seq} · ${timestamp(entry)} · +${entry.uptime_ms} ms · ${entry.level}\n${entry.message}`,
          )
          .join('\n\n'),
      );
      if (mounted.current) setCopyStatus('Logs copied.');
    } catch {
      if (mounted.current)
        setCopyStatus('Could not copy logs. Try downloading them instead.');
    }
  }

  function downloadLogs() {
    const url = URL.createObjectURL(
      new Blob([logs.map((entry) => JSON.stringify(entry)).join('\n') + '\n'], {
        type: 'application/x-ndjson',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'slpanel-logs.jsonl';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <p className="text-[0.7rem] font-semibold text-[var(--muted-text)]">
          USB device
        </p>
        <h1 className="text-3xl font-semibold text-[var(--app-text)]">
          Connect your SLPanel
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-[var(--muted-text)]">
          Plug in the panel with a USB data cable to configure Wi-Fi or read its
          logs. Close any terminal or other app using the device first.
        </p>
      </div>

      {!secure ? (
        <p role="alert" className="text-amber-800">
          Open this page over HTTPS or on localhost to connect a USB device.
        </p>
      ) : !supported ? (
        <p role="alert" className="text-amber-800">
          This browser does not support Web Serial. Open this page in desktop
          Chrome or Edge.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--panel-border)] bg-[var(--card-bg)] p-5">
        <span
          className={`mr-auto text-sm ${connected ? 'text-emerald-800' : 'text-[var(--muted-text)]'}`}
          role="status"
        >
          {connection === 'connected'
            ? 'Connected via USB'
            : connection === 'connecting'
              ? 'Connecting…'
              : connection === 'disconnecting'
                ? 'Disconnecting…'
                : 'No device connected'}
        </span>
        {connected ? (
          <button
            type="button"
            className={buttonClass}
            onClick={() => void disconnect()}
          >
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className={primaryClass}
            disabled={!secure || !supported || connection !== 'disconnected'}
            onClick={() => void connect()}
          >
            {connection === 'connecting' ? 'Connecting…' : 'Connect device'}
          </button>
        )}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-800"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-[var(--panel-text)]">
          {notice}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:items-start">
        <form
          onSubmit={(event) => void save(event)}
          className="space-y-5 rounded-lg border border-[var(--panel-border)] bg-[var(--card-bg)] p-5"
          aria-label="USB device configuration"
        >
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--app-text)]">
              Device configuration
            </h3>
            <p className="text-sm leading-6 text-[var(--muted-text)]">
              Connect to load saved settings from the device, then edit them.
              The device never exports its Wi-Fi password.
            </p>
          </div>
          <fieldset
            disabled={!connected || Boolean(busy)}
            className="space-y-4 disabled:opacity-60"
          >
            <div className="space-y-2">
              <button
                type="button"
                className={buttonClass}
                onClick={() => void scanWifi()}
              >
                {busy === 'wifi-scan'
                  ? 'Scanning Wi-Fi…'
                  : 'Scan Wi-Fi networks'}
              </button>
              <p className="text-xs text-[var(--muted-text)]" role="status">
                {busy === 'wifi-scan'
                  ? 'Looking for nearby networks. The panel shows a train while scanning.'
                  : networks?.length === 0
                    ? 'No networks found. Try scanning again or enter a hidden network below.'
                    : 'Scan for nearby 2.4 GHz networks, or enter a hidden network below.'}
              </p>
              {networks && networks.length > 0 && (
                <div
                  className="space-y-2"
                  aria-label="Available Wi-Fi networks"
                >
                  {networks.map((network) => (
                    <button
                      key={`${network.ssid}-${network.secured}`}
                      type="button"
                      className={`${buttonClass} flex w-full items-center justify-between gap-3 text-left`}
                      onClick={() => selectNetwork(network)}
                    >
                      <span>{network.ssid}</span>
                      <span className="text-xs text-[var(--muted-text)]">
                        {network.secured ? 'Password required' : 'Open'} ·{' '}
                        {network.rssi} dBm
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label htmlFor="device-ssid" className="text-sm">
                Wi-Fi name
              </label>
              <input
                id="device-ssid"
                className={inputClass}
                value={config.wifi_ssid}
                autoComplete="off"
                onChange={(event) =>
                  setConfig((draft) => ({
                    ...draft,
                    wifi_ssid: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="device-security" className="text-sm">
                Wi-Fi security
              </label>
              <select
                id="device-security"
                className={inputClass}
                value={config.wifi_security ?? 'auto'}
                disabled={config.wifi_security === undefined || openNetwork}
                onChange={(event) =>
                  setConfig((draft) => ({
                    ...draft,
                    wifi_security: event.target.value as WifiSecurity,
                  }))
                }
              >
                <option value="auto">Automatic (WPA2/WPA3)</option>
                <option value="wpa2">WPA2 (compatibility)</option>
                <option value="wpa3">WPA3 only</option>
              </select>
              <p className="text-sm text-[var(--muted-text)]">
                Use WPA2 to test mixed-network compatibility, or WPA3 for a
                WPA3-only network.
              </p>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={changePassword}
                  onChange={(event) => {
                    setChangePassword(event.target.checked);
                    setOpenNetwork(false);
                    if (!event.target.checked) {
                      setConfig((draft) => ({ ...draft, wifi_password: '' }));
                    }
                  }}
                />
                Update Wi-Fi password
              </label>
              <label htmlFor="device-password" className="text-sm">
                Wi-Fi password
              </label>
              <input
                id="device-password"
                type="password"
                className={inputClass}
                value={config.wifi_password ?? ''}
                disabled={!changePassword || openNetwork}
                required={changePassword && !openNetwork}
                autoComplete="new-password"
                onChange={(event) =>
                  setConfig((draft) => ({
                    ...draft,
                    wifi_password: event.target.value,
                  }))
                }
              />
              <p className="text-xs leading-5 text-[var(--muted-text)]">
                {passwordSet
                  ? 'A Wi-Fi password is saved on the device.'
                  : 'No Wi-Fi password is saved on the device.'}{' '}
                Leave the update option unchecked to keep it unchanged.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={openNetwork}
                  disabled={!changePassword}
                  onChange={(event) => {
                    setOpenNetwork(event.target.checked);
                    if (event.target.checked) {
                      setConfig((draft) => ({
                        ...draft,
                        wifi_password: '',
                        wifi_security:
                          draft.wifi_security === undefined
                            ? undefined
                            : 'auto',
                      }));
                    }
                  }}
                />
                Open Wi-Fi network (no password)
              </label>
            </div>
            <div className="space-y-2">
              <label htmlFor="device-origin" className="text-sm">
                Service URL
              </label>
              <input
                id="device-origin"
                type="url"
                className={inputClass}
                value={config.service_origin}
                onChange={(event) =>
                  setConfig((draft) => ({
                    ...draft,
                    service_origin: event.target.value,
                  }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <DeviceDisplayPicker
                displayId={config.display_id}
                ownerId={searchParams.get('owner')}
                serviceOrigin={config.service_origin}
                onSelect={(display_id) =>
                  setConfig((draft) => ({
                    ...draft,
                    display_id,
                  }))
                }
              />
              <label htmlFor="device-display" className="text-sm">
                Display ID
              </label>
              <input
                id="device-display"
                className={inputClass}
                value={config.display_id}
                onChange={(event) =>
                  setConfig((draft) => ({
                    ...draft,
                    display_id: event.target.value,
                  }))
                }
                required
              />
              <p className="text-xs leading-5 text-[var(--muted-text)]">
                Choose a display from the Service URL above, or type an ID
                manually.
              </p>
            </div>
          </fieldset>
          <button
            type="submit"
            className={primaryClass}
            disabled={!connected || Boolean(busy)}
          >
            {busy === 'config' ? 'Saving…' : 'Save to device'}
          </button>
          <button
            type="button"
            className={buttonClass}
            disabled={!connected || Boolean(busy)}
            onClick={() => void readSettings()}
          >
            {busy === 'settings' ? 'Loading…' : 'Reload settings'}
          </button>
          <p className="text-xs leading-5 text-[var(--muted-text)]">
            Wi-Fi credentials stay in this page’s memory and are cleared from
            the password field after saving. Reboot the panel after saving.
          </p>
        </form>

        <div className="min-w-0 space-y-5 rounded-lg border border-[var(--panel-border)] bg-[var(--card-bg)] p-5">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-[var(--app-text)]">
              Device logs
            </h3>
            <p className="text-sm leading-6 text-[var(--muted-text)]">
              Logs stream automatically when connected. UTC timestamps appear
              once the panel has synchronized its clock.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={!connected || readingLogs}
              onClick={() => void readLogs(false)}
            >
              {readingLogs && !following ? 'Reading…' : 'Read logs'}
            </button>
            <button
              type="button"
              className={following ? primaryClass : buttonClass}
              disabled={!connected || (readingLogs && !following)}
              onClick={() => {
                if (following) {
                  follow.current = false;
                  setFollowing(false);
                } else {
                  void readLogs(true);
                }
              }}
            >
              {following ? 'Stop following' : 'Follow logs'}
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!logs.length}
              onClick={() => void copyLogs()}
            >
              Copy logs
            </button>
            <button
              type="button"
              className={buttonClass}
              disabled={!logs.length}
              onClick={downloadLogs}
            >
              Download logs
            </button>
          </div>
          <span role="status" className="text-xs text-[var(--muted-text)]">
            {copyStatus}
          </span>
          {lost > 0 ? (
            <p role="status" className="text-sm text-amber-800">
              {lost} log entries were overwritten on the device before they
              could be read.
            </p>
          ) : null}
          <div
            className="max-h-[32rem] min-h-48 overflow-auto rounded-lg border border-[var(--panel-border)] bg-slate-50 p-4"
            ref={logViewport}
            aria-label="Device logs"
            role="region"
            tabIndex={0}
          >
            {!logs.length ? (
              <p className="text-sm text-[var(--muted-text)]">
                {following
                  ? 'Waiting for log entries…'
                  : 'Connect a device to stream its logs.'}
              </p>
            ) : (
              <ol className="space-y-3 font-mono text-xs leading-5">
                {logs.map((entry) => (
                  <li key={entry.seq} className="break-words">
                    <div
                      className={
                        entry.level === 'warn'
                          ? 'text-amber-800'
                          : 'text-[var(--muted-text)]'
                      }
                    >
                      #{entry.seq} · {timestamp(entry)} · +{entry.uptime_ms} ms
                      · {entry.level}
                    </div>
                    <div className="whitespace-pre-wrap">{entry.message}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <p className="text-xs text-[var(--muted-text)]">
            This page retains up to 1,000 entries. The device’s log history
            clears on reboot.
          </p>
          <details className="space-y-3 border-t border-[var(--panel-border)] pt-4">
            <summary className="cursor-pointer text-sm text-[var(--muted-text)]">
              Current device diagnostics
            </summary>
            <button
              type="button"
              className={buttonClass}
              disabled={!connected || Boolean(busy)}
              onClick={() => void readStatus()}
            >
              {busy === 'status' ? 'Reading…' : 'Read diagnostics'}
            </button>
            {status !== null ? (
              <>
                <DeviceDiagnostics details={status} />
                <details
                  open
                  className="space-y-3 rounded border border-[var(--panel-border)] bg-slate-50 p-4"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    Raw diagnostics
                  </summary>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      className={buttonClass}
                      onClick={() => void copyDiagnostics()}
                    >
                      Copy diagnostics
                    </button>
                    <span
                      role="status"
                      className="text-xs text-[var(--muted-text)]"
                    >
                      {diagnosticsCopyStatus}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words text-xs leading-6">
                    {status}
                  </pre>
                </details>
              </>
            ) : null}
          </details>
        </div>
      </div>
    </section>
  );
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
