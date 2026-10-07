import { startTransition, useEffect, useState } from 'react';

import type { DisplayRecord } from '@/api/types';
import { listDisplays } from '@/lib/config-api';

const ownerPattern = /^[A-Za-z0-9]{8}$/;
const inputClass =
  'w-full rounded-lg border border-[var(--panel-border)] bg-white px-4 py-3 text-base md:text-sm';

export function DeviceDisplayPicker({
  displayId,
  ownerId,
  serviceOrigin,
  onSelect,
}: {
  displayId: string;
  ownerId: string | null;
  serviceOrigin: string;
  onSelect: (id: string) => void;
}) {
  const [ownerInput, setOwnerInput] = useState<string | null>(
    ownerId ?? window.localStorage.getItem('slpanel.owner-id'),
  );
  const owner = ownerInput ?? displayId.split('-')[0];
  const [result, setResult] = useState<{
    owner: string;
    service: string;
    displays: DisplayRecord[];
    error?: string;
  } | null>(null);
  const validOwner = ownerPattern.test(owner);
  const service = serviceOrigin.trim().replace(/\/+$/, '');
  let validService = false;
  try {
    const url = new URL(service);
    validService =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash;
  } catch {
    // Wait for a complete Service URL before looking up displays.
  }
  const current =
    result?.owner === owner && result.service === service ? result : null;
  const selected = current?.displays.some(
    (display) => display.id === displayId,
  );

  useEffect(() => {
    if (!validOwner || !validService) return;
    const controller = new AbortController();
    listDisplays(owner, controller.signal, service)
      .then((displays) => {
        if (!controller.signal.aborted) {
          startTransition(() => setResult({ owner, service, displays }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({
            owner,
            service,
            displays: [],
            error:
              'Could not load displays. You can still enter a Display ID below.',
          });
        }
      });
    return () => controller.abort();
  }, [owner, validOwner, service, validService]);

  return (
    <div className="space-y-2">
      <label htmlFor="device-display-owner" className="text-sm">
        Owner ID
      </label>
      <input
        id="device-display-owner"
        className={inputClass}
        value={owner}
        onChange={(event) => setOwnerInput(event.target.value.trim())}
        placeholder="Your 8-character owner ID"
      />
      <label htmlFor="device-saved-display" className="block text-sm">
        Saved display
      </label>
      <select
        id="device-saved-display"
        className={inputClass}
        value={selected ? displayId : ''}
        disabled={!current?.displays.length}
        onChange={(event) => {
          if (event.target.value) onSelect(event.target.value);
        }}
      >
        <option value="">
          {!validOwner
            ? 'Enter an 8-character owner ID'
            : !validService
              ? 'Enter a valid HTTPS Service URL'
              : !current
                ? 'Loading displays…'
                : 'Choose a display'}
        </option>
        {current?.displays.map((display) => (
          <option key={display.id} value={display.id}>
            {display.name}
            {display.site_name ? ` — ${display.site_name}` : ''}
          </option>
        ))}
      </select>
      {current?.error ? (
        <p role="status" className="text-xs leading-5 text-[var(--muted-text)]">
          {current.error}
        </p>
      ) : current && current.displays.length === 0 ? (
        <p className="text-xs leading-5 text-[var(--muted-text)]">
          No saved displays for this owner at the Service URL. Enter an ID below
          or create a display on that service.
        </p>
      ) : null}
    </div>
  );
}
