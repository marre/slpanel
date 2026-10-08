export type Field = {
  key: string;
  label: string;
  description: string;
  format?: 'duration' | 'boolean' | 'timestamp' | 'buttons' | 'http' | 'state';
};
export const groups: {
  title: string;
  description: string;
  summary: string[];
  fields: Field[];
}[] = [
  {
    title: 'Wi-Fi connection',
    summary: ['wifi', 'ip', 'elapsed_ms', 'wifi_error', 'wifi_stalled'],
    description: 'Network connection and recovery progress.',
    fields: [
      {
        key: 'wifi',
        label: 'Connection state',
        description: 'The current step in connecting the panel to Wi-Fi.',
        format: 'state',
      },
      {
        key: 'ip',
        label: 'IP address',
        description: 'The local network address assigned to the panel.',
      },
      {
        key: 'elapsed_ms',
        label: 'Time in current state',
        description:
          'Time spent in the current Wi-Fi step, rather than total uptime.',
        format: 'duration',
      },
      {
        key: 'wifi_error',
        label: 'Connection error',
        description: 'The most recently reported Wi-Fi attachment error.',
        format: 'state',
      },
      {
        key: 'attach_attempts',
        label: 'Connection attempts',
        description: 'Number of attempts to join the network.',
      },
      {
        key: 'attach_failures',
        label: 'Failed connections',
        description: 'Number of unsuccessful network attachment attempts.',
      },
      {
        key: 'retry_ms',
        label: 'Retry delay',
        description: 'The reported delay before retrying a connection.',
        format: 'duration',
      },
      {
        key: 'wifi_restarts',
        label: 'Radio restarts',
        description: 'Recovery restarts of the Wi-Fi radio.',
      },
      {
        key: 'wifi_restart_limit',
        label: 'Radio restart limit',
        description: 'Maximum number of recovery restarts allowed.',
      },
      {
        key: 'wifi_stalled',
        label: 'Recovery exhausted',
        description: 'Whether automatic radio recovery has reached its limit.',
        format: 'boolean',
      },
      {
        key: 'startup_slow',
        label: 'Slow startup',
        description:
          'Whether the current radio startup step has exceeded its expected time.',
        format: 'boolean',
      },
      {
        key: 'spi',
        label: 'Radio bus activity',
        description:
          'The current activity on the bus connecting the processor and radio.',
        format: 'state',
      },
      {
        key: 'spi_reads',
        label: 'Radio bus reads',
        description: 'Read operations tracked during radio startup.',
      },
      {
        key: 'spi_writes',
        label: 'Radio bus writes',
        description: 'Write operations tracked during radio startup.',
      },
      {
        key: 'irq_wakes',
        label: 'Radio interrupt wakeups',
        description: 'Radio event checks triggered by a hardware interrupt.',
      },
      {
        key: 'poll_wakes',
        label: 'Radio timer wakeups',
        description: 'Radio event checks triggered by periodic polling.',
      },
      {
        key: 'event_poll_ms',
        label: 'Radio polling interval',
        description:
          'How often the firmware checks for radio events as a fallback.',
        format: 'duration',
      },
      {
        key: 'control_repoll_ms',
        label: 'Connection polling interval',
        description: 'How often connection control is checked again.',
        format: 'duration',
      },
      {
        key: 'diag',
        label: 'Network diagnostics version',
        description: 'Version of the network diagnostic fields.',
      },
    ],
  },
  {
    title: 'Device clock',
    summary: ['ntp', 'time', 'unix_ms', 'sync_age_ms'],
    description:
      'Time synchronization used for departure times and secure connections.',
    fields: [
      {
        key: 'ntp',
        label: 'Clock sync progress',
        description:
          'The current step in fetching time from a network time server.',
        format: 'state',
      },
      {
        key: 'time',
        label: 'Clock state',
        description: 'Whether the panel has a usable synchronized clock.',
        format: 'state',
      },
      {
        key: 'unix_ms',
        label: 'Device time (UTC)',
        description:
          'The panel’s current time when this snapshot was captured.',
        format: 'timestamp',
      },
      {
        key: 'sync_age_ms',
        label: 'Time since clock sync',
        description: 'How long ago the clock last synchronized successfully.',
        format: 'duration',
      },
    ],
  },
  {
    title: 'Transit data',
    summary: [
      'api_state',
      'api_departures',
      'api_data_age_ms',
      'https',
      'https_error',
      'http',
    ],
    description:
      'Service requests and the departure data available to the panel.',
    fields: [
      {
        key: 'https',
        label: 'Service connection stage',
        description: 'The current step in requesting data from the service.',
        format: 'state',
      },
      {
        key: 'https_error',
        label: 'Service error',
        description: 'The error reported for the latest service request.',
        format: 'state',
      },
      {
        key: 'https_attempts',
        label: 'Service requests attempted',
        description: 'Total service request attempts.',
      },
      {
        key: 'https_ok',
        label: 'Successful service requests',
        description: 'Service requests completed successfully.',
      },
      {
        key: 'http',
        label: 'HTTP response code',
        description:
          'The reported HTTP status; 200 indicates a successful response.',
        format: 'http',
      },
      {
        key: 'api_bytes',
        label: 'Response size (bytes)',
        description: 'The reported size of the service response.',
      },
      {
        key: 'api_age_ms',
        label: 'Time since successful request',
        description:
          'Time since any service request last succeeded. This may include a configuration request.',
        format: 'duration',
      },
      {
        key: 'api_request',
        label: 'Request type',
        description:
          'Whether the panel is fetching configuration or departures.',
        format: 'state',
      },
      {
        key: 'api_state',
        label: 'Departure board state',
        description:
          'The application state used to select what the board shows.',
        format: 'state',
      },
      {
        key: 'api_departures',
        label: 'Available departures',
        description: 'Number of departures currently held by the application.',
      },
      {
        key: 'api_data_age_ms',
        label: 'Age of departure data',
        description:
          'Time since departure data was last received successfully.',
        format: 'duration',
      },
      {
        key: 'api_generation',
        label: 'View revision',
        description:
          'The application’s generation counter for its current view.',
      },
    ],
  },
  {
    title: 'Panel activity',
    summary: ['scene', 'render', 'scan', 'frames'],
    description: 'Rendering, LED output, and hardware button activity.',
    fields: [
      {
        key: 'scene',
        label: 'Display content',
        description: 'The type of content currently selected for rendering.',
        format: 'state',
      },
      {
        key: 'render',
        label: 'Rendering stage',
        description:
          'Whether the processor is waiting, drawing, submitting a frame, or idle.',
        format: 'state',
      },
      {
        key: 'render_ms',
        label: 'Time in rendering stage',
        description:
          'Time spent in the current rendering stage, rather than total frame time.',
        format: 'duration',
      },
      {
        key: 'frames',
        label: 'Frames drawn',
        description: 'Total frames produced by the renderer.',
      },
      {
        key: 'commits',
        label: 'Frames accepted',
        description: 'Frames successfully submitted to the output driver.',
      },
      {
        key: 'busy',
        label: 'Frame submissions deferred',
        description: 'Submissions rejected because the output driver was busy.',
      },
      {
        key: 'scan',
        label: 'LED output stage',
        description:
          'The current step in transferring a frame to the LED matrix.',
        format: 'state',
      },
      {
        key: 'scan_ms',
        label: 'Time in output stage',
        description:
          'Time spent in the current LED output stage, rather than total scan time.',
        format: 'duration',
      },
      {
        key: 'scans',
        label: 'Completed LED scans',
        description: 'Completed output scans recorded by the driver.',
      },
      {
        key: 'swaps',
        label: 'Display buffer swaps',
        description: 'Number of output frame buffer swaps.',
      },
      {
        key: 'buttons',
        label: 'Button press counts',
        description: 'Presses recorded for hardware buttons 0, 1, and 2.',
        format: 'buttons',
      },
      {
        key: 'last_button',
        label: 'Last button pressed',
        description: 'Index of the most recently pressed hardware button.',
      },
      {
        key: 'fence_polls',
        label: 'Output completion checks',
        description:
          'Timer checks for the signal that LED output has finished.',
      },
      {
        key: 'fence_after_poll',
        label: 'Completions after a timer check',
        description: 'Output completions that followed timer polling.',
      },
      {
        key: 'fence_flag',
        label: 'Output completion signal',
        description:
          'The last sampled hardware completion flag. A single sample does not indicate overall panel health.',
        format: 'boolean',
      },
      {
        key: 'fence_sample_ms',
        label: 'Time since signal sample',
        description: 'Age of the most recent output completion flag sample.',
        format: 'duration',
      },
      {
        key: 'fence_poll_flag_seen',
        label: 'Completion signals seen by polling',
        description: 'Timer checks that observed the completion flag set.',
      },
      {
        key: 'fence_repoll_ms',
        label: 'Output check interval',
        description: 'Fallback interval for checking output completion.',
        format: 'duration',
      },
      {
        key: 'panel_diag',
        label: 'Panel diagnostics version',
        description: 'Version of the panel diagnostic fields.',
      },
    ],
  },
];
const states: Record<string, string> = {
  'waiting-settings': 'Waiting for configuration',
  'invalid-settings': 'Configuration needs attention',
  'waiting-link': 'Waiting for Wi-Fi link',
  'clearing-lease': 'Clearing network address',
  'waiting-network': 'Waiting for network',
  'pio-setup': 'Setting up radio signals',
  'radio-init': 'Starting Wi-Fi radio',
  'controller-init': 'Starting Wi-Fi controller',
  'power-management': 'Setting radio power mode',
  'stack-init': 'Starting network stack',
  'waiting-scene': 'Waiting for display content',
  dns: 'Looking up server address',
  dhcp: 'Obtaining network address',
  tcp: 'Opening network connection',
  tls: 'Establishing secure connection',
  http: 'Exchanging HTTP data',
  decode: 'Reading service response',
  dma: 'Transferring pixels',
  fence: 'Waiting for output completion',
  swap: 'Swapping display buffers',
  commit: 'Submitting frame',
  synced: 'Synchronized',
  unsynced: 'Not synchronized',
  stale: 'Out of date',
  none: 'None',
  unprovisioned: 'Device setup required',
  'loading-config': 'Loading configuration',
  'missing-stop': 'No stop configured',
  'loading-departures': 'Loading departures',
  'configuration-error': 'Configuration error',
};
export function formatValue(
  value: string,
  format?: Field['format'],
  key?: string,
): string {
  if (key === 'api_request' && value === 'display')
    return 'Display configuration';
  if (key === 'https_error') {
    const errors: Record<string, string> = {
      none: 'None',
      timeout: 'Request timed out',
      authentication: 'Authentication failed',
      validation: 'Configuration rejected',
      malformed: 'Invalid response',
      oversize: 'Response too large',
      'not-found': 'Display not found',
      provider: 'Transit provider error',
      http: 'HTTP request failed',
      transport: 'Network or secure connection failed',
    };
    return errors[value] ?? value;
  }
  if (format === 'state') {
    return (
      states[value] ??
      value.replaceAll('-', ' ').replace(/^./, (first) => first.toUpperCase())
    );
  }
  if (format === 'boolean') {
    return value === 'true' ? 'Yes' : value === 'false' ? 'No' : value;
  }
  if (format === 'http' && value === '0') return 'No response yet';
  if (format === 'buttons' && /^\d+,\d+,\d+$/.test(value)) {
    return value
      .split(',')
      .map((count, index) => `Button ${index}: ${count}`)
      .join(' · ');
  }
  if (
    (format === 'duration' || format === 'timestamp') &&
    /^\d+$/.test(value)
  ) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) {
      if (format === 'duration') {
        return number < 1000
          ? `${number} ms`
          : `${(number / 1000).toLocaleString('en', {
              maximumFractionDigits: 3,
            })} s`;
      }
      const date = new Date(number);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  if (format === 'duration' && value === 'none') return 'Not available yet';
  return value || 'Empty';
}
