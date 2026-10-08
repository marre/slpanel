<script setup lang="ts">
import type { DeviceLogEntry } from '@/lib/device-serial';
import { useRoute } from 'vue-router';
import { useDevice } from '@/composables/use-device';
import DeviceDiagnostics from '@/components/device-diagnostics.vue';
import DeviceDisplayPicker from '@/components/device-display-picker.vue';
const route = useRoute();
const {
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
} = useDevice();
const buttonClass =
  'rounded border border-[var(--panel-border)] px-4 py-2 text-sm transition hover:border-[var(--panel-text)] hover:text-[var(--panel-text)] disabled:cursor-not-allowed disabled:opacity-40';
const primaryClass = `${buttonClass} border-[var(--panel-text)] bg-[var(--panel-text)] text-white hover:bg-[var(--panel-text-soft)] hover:text-white`;

function timestamp(entry: DeviceLogEntry): string {
  if (entry.unix_ms === null) {
    return 'UTC unsynced';
  }
  const date = new Date(entry.unix_ms);
  return Number.isNaN(date.getTime())
    ? `UTC(ms) ${entry.unix_ms}`
    : date.toISOString();
}
</script>
<template>
  <section class="space-y-8">
    <div class="space-y-3">
      <p class="text-[0.7rem] font-semibold text-[var(--muted-text)]">
        USB device
      </p>
      <h1 class="text-3xl font-semibold text-[var(--app-text)]">
        Connect your SLPanel
      </h1>
      <p class="max-w-3xl text-sm leading-7 text-[var(--muted-text)]">
        Plug in the panel with a USB data cable to configure Wi-Fi or read its
        logs. Close any terminal or other app using the device first.
      </p>
    </div>
    <p v-if="!secure" role="alert" class="text-amber-800">
      Open this page over HTTPS or on localhost to connect a USB device.
    </p>
    <p v-else-if="!supported" role="alert" class="text-amber-800">
      This browser does not support Web Serial. Open this page in desktop Chrome
      or Edge.
    </p>
    <div
      class="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--panel-border)] bg-[var(--card-bg)] p-5"
    >
      <span
        :class="`mr-auto text-sm ${connected ? 'text-emerald-800' : 'text-[var(--muted-text)]'}`"
        role="status"
      >
        <template v-if="connection === 'connected'">{{
          'Connected via USB'
        }}</template
        ><template v-else
          ><template v-if="connection === 'connecting'">{{
            'Connecting…'
          }}</template
          ><template v-else>{{
            connection === 'disconnecting'
              ? 'Disconnecting…'
              : 'No device connected'
          }}</template></template
        >
      </span>
      <UButton
        v-if="connected"
        variant="outline"
        type="button"
        :class="buttonClass"
        @click="disconnect"
      >
        Disconnect </UButton
      ><UButton
        v-else
        variant="solid"
        type="button"
        :class="primaryClass"
        :disabled="!secure || !supported || connection !== 'disconnected'"
        @click="connect"
      >
        {{ connection === 'connecting' ? 'Connecting…' : 'Connect device' }}
      </UButton>
    </div>
    <p
      v-if="error"
      role="alert"
      class="rounded-lg border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-800"
    >
      {{ error }}
    </p>
    <p v-if="notice" role="status" class="text-sm text-[var(--panel-text)]">
      {{ notice }}
    </p>
    <div
      class="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:items-start"
    >
      <form
        class="space-y-5 rounded-lg border border-[var(--panel-border)] bg-[var(--card-bg)] p-5"
        aria-label="USB device configuration"
        @submit.prevent="save"
      >
        <div class="space-y-2">
          <h3 class="text-lg font-semibold text-[var(--app-text)]">
            Device configuration
          </h3>
          <p class="text-sm leading-6 text-[var(--muted-text)]">
            Connect to load saved settings from the device, then edit them. The
            device never exports its Wi-Fi password.
          </p>
        </div>
        <fieldset
          :disabled="!connected || Boolean(busy)"
          class="space-y-4 disabled:opacity-60"
        >
          <div class="space-y-2">
            <UButton
              variant="outline"
              type="button"
              :class="buttonClass"
              @click="scanWifi"
            >
              {{
                busy === 'wifi-scan' ? 'Scanning Wi-Fi…' : 'Scan Wi-Fi networks'
              }}
            </UButton>
            <p class="text-xs text-[var(--muted-text)]" role="status">
              <template v-if="busy === 'wifi-scan'">
                {{
                  'Looking for nearby networks. The panel shows a train while scanning.'
                }} </template
              ><template v-else>
                {{
                  networks?.length === 0
                    ? 'No networks found. Try scanning again or enter a hidden network below.'
                    : 'Scan for nearby 2.4 GHz networks, or enter a hidden network below.'
                }}
              </template>
            </p>
            <div
              v-if="networks && networks.length > 0"
              class="space-y-2"
              aria-label="Available Wi-Fi networks"
            >
              <template
                v-for="network in networks"
                :key="`${network.ssid}-${network.secured}`"
              >
                <UButton
                  variant="outline"
                  type="button"
                  :class="`${buttonClass} flex w-full items-center justify-between gap-3 text-left`"
                  @click="() => selectNetwork(network)"
                >
                  <span>{{ network.ssid }}</span>
                  <span class="text-xs text-[var(--muted-text)]">
                    {{ network.secured ? 'Password required' : 'Open' }} ·{{
                      ' '
                    }}
                    {{ network.rssi }} dBm
                  </span>
                </UButton>
              </template>
            </div>
          </div>
          <div class="space-y-2">
            <label for="device-ssid" class="text-sm"> Wi-Fi name </label>
            <UInput
              id="device-ssid"
              v-model="config.wifi_ssid"
              class="w-full"
              auto-complete="off"
              required
            ></UInput>
          </div>
          <div class="space-y-2">
            <label for="device-security" class="text-sm">
              Wi-Fi security
            </label>
            <USelect
              id="device-security"
              v-model="config.wifi_security"
              :items="[
                { value: 'auto', label: 'Automatic (WPA2/WPA3)' },
                { value: 'wpa2', label: 'WPA2 (compatibility)' },
                { value: 'wpa3', label: 'WPA3 only' },
              ]"
              :disabled="config.wifi_security === undefined || openNetwork"
              class="w-full"
            />
            <p class="text-sm text-[var(--muted-text)]">
              Use WPA2 to test mixed-network compatibility, or WPA3 for a
              WPA3-only network.
            </p>
          </div>
          <div class="space-y-2">
            <label class="flex items-center gap-2 text-sm">
              <input v-model="changePassword" type="checkbox" /> Update Wi-Fi
              password
            </label>
            <label for="device-password" class="text-sm">
              Wi-Fi password
            </label>
            <UInput
              id="device-password"
              v-model="config.wifi_password"
              type="password"
              class="w-full"
              :disabled="!changePassword || openNetwork"
              :required="changePassword && !openNetwork"
              auto-complete="new-password"
            ></UInput>
            <p class="text-xs leading-5 text-[var(--muted-text)]">
              {{
                passwordSet
                  ? 'A Wi-Fi password is saved on the device.'
                  : 'No Wi-Fi password is saved on the device.'
              }}{{ ' ' }} Leave the update option unchecked to keep it
              unchanged.
            </p>
            <label class="flex items-center gap-2 text-sm">
              <input
                v-model="openNetwork"
                type="checkbox"
                :disabled="!changePassword"
              />
              Open Wi-Fi network (no password)
            </label>
          </div>
          <div class="space-y-2">
            <label for="device-origin" class="text-sm"> Service URL </label>
            <UInput
              id="device-origin"
              v-model="config.service_origin"
              type="url"
              class="w-full"
              required
            ></UInput>
          </div>
          <div class="space-y-2">
            <DeviceDisplayPicker
              v-model:display-id="config.display_id"
              :owner-id="
                typeof route.query.owner === 'string' ? route.query.owner : null
              "
              :service-origin="config.service_origin"
            />
            <label for="device-display" class="text-sm"> Display ID </label>
            <UInput
              id="device-display"
              v-model="config.display_id"
              class="w-full"
              required
            ></UInput>
            <p class="text-xs leading-5 text-[var(--muted-text)]">
              Choose a display from the Service URL above, or type an ID
              manually.
            </p>
          </div>
        </fieldset>
        <UButton
          variant="solid"
          type="submit"
          :class="primaryClass"
          :disabled="!connected || Boolean(busy)"
        >
          {{ busy === 'config' ? 'Saving…' : 'Save to device' }}
        </UButton>
        <UButton
          variant="outline"
          type="button"
          :class="buttonClass"
          :disabled="!connected || Boolean(busy)"
          @click="readSettings"
        >
          {{ busy === 'settings' ? 'Loading…' : 'Reload settings' }}
        </UButton>
        <p class="text-xs leading-5 text-[var(--muted-text)]">
          Wi-Fi credentials stay in this page’s memory and are cleared from the
          password field after saving. Reboot the panel after saving.
        </p>
      </form>
      <div
        class="min-w-0 space-y-5 rounded-lg border border-[var(--panel-border)] bg-[var(--card-bg)] p-5"
      >
        <div class="space-y-2">
          <h3 class="text-lg font-semibold text-[var(--app-text)]">
            Device logs
          </h3>
          <p class="text-sm leading-6 text-[var(--muted-text)]">
            Logs stream automatically when connected. UTC timestamps appear once
            the panel has synchronized its clock.
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton
            variant="outline"
            type="button"
            :class="buttonClass"
            :disabled="!connected || readingLogs"
            @click="() => void readLogs(false)"
          >
            {{ readingLogs && !following ? 'Reading…' : 'Read logs' }}
          </UButton>
          <UButton
            variant="outline"
            type="button"
            :class="following ? primaryClass : buttonClass"
            :disabled="!connected || (readingLogs && !following)"
            @click="toggleFollowing"
          >
            {{ following ? 'Stop following' : 'Follow logs' }}
          </UButton>
          <UButton
            variant="outline"
            type="button"
            :class="buttonClass"
            :disabled="!logs.length"
            @click="copyLogs"
          >
            Copy logs
          </UButton>
          <UButton
            variant="outline"
            type="button"
            :class="buttonClass"
            :disabled="!logs.length"
            @click="downloadLogs"
          >
            Download logs
          </UButton>
        </div>
        <span role="status" class="text-xs text-[var(--muted-text)]">
          {{ copyStatus }}
        </span>
        <p v-if="lost > 0" role="status" class="text-sm text-amber-800">
          {{ lost }} log entries were overwritten on the device before they
          could be read.
        </p>
        <div
          ref="logViewport"
          class="max-h-[32rem] min-h-48 overflow-auto rounded-lg border border-[var(--panel-border)] bg-slate-50 p-4"
          aria-label="Device logs"
          role="region"
          :tabIndex="0"
        >
          <p v-if="!logs.length" class="text-sm text-[var(--muted-text)]">
            {{
              following
                ? 'Waiting for log entries…'
                : 'Connect a device to stream its logs.'
            }}
          </p>
          <ol v-else class="space-y-3 font-mono text-xs leading-5">
            <li v-for="entry in logs" :key="entry.seq" class="break-words">
              <div
                :class="
                  entry.level === 'warn'
                    ? 'text-amber-800'
                    : 'text-[var(--muted-text)]'
                "
              >
                #{{ entry.seq }} · {{ timestamp(entry) }} · +{{
                  entry.uptime_ms
                }}
                ms · {{ entry.level }}
              </div>
              <div class="whitespace-pre-wrap">{{ entry.message }}</div>
            </li>
          </ol>
        </div>
        <p class="text-xs text-[var(--muted-text)]">
          This page retains up to 1,000 entries. The device’s log history clears
          on reboot.
        </p>
        <details class="space-y-3 border-t border-[var(--panel-border)] pt-4">
          <summary class="cursor-pointer text-sm text-[var(--muted-text)]">
            Current device diagnostics
          </summary>
          <UButton
            variant="outline"
            type="button"
            :class="buttonClass"
            :disabled="!connected || Boolean(busy)"
            @click="readStatus"
          >
            {{ busy === 'status' ? 'Reading…' : 'Read diagnostics' }}
          </UButton>
          <template v-if="status !== null">
            <DeviceDiagnostics :details="status"></DeviceDiagnostics>
            <details
              open
              class="space-y-3 rounded border border-[var(--panel-border)] bg-slate-50 p-4"
            >
              <summary class="cursor-pointer text-sm font-medium">
                Raw diagnostics
              </summary>
              <div class="flex flex-wrap items-center gap-3">
                <UButton
                  variant="outline"
                  type="button"
                  :class="buttonClass"
                  @click="copyDiagnostics"
                >
                  Copy diagnostics
                </UButton>
                <span role="status" class="text-xs text-[var(--muted-text)]">
                  {{ diagnosticsCopyStatus }}
                </span>
              </div>
              <pre class="whitespace-pre-wrap break-words text-xs leading-6">{{
                status
              }}</pre>
            </details>
          </template>
        </details>
      </div>
    </div>
  </section>
</template>
