<script setup lang="ts">
import { computed, shallowRef, ref, watch } from 'vue';
import {
  readPackage,
  listReleases,
  downloadRelease,
  firmwareCompatibilityError,
} from '@/lib/firmware-updater';
import type { Package, Phase, Release } from '@/lib/firmware-updater';
import type { DeviceInfo } from '@/lib/firmware-protocol';
const props = defineProps<{
  info: DeviceInfo | null;
  connected: boolean;
  busy: boolean;
  phase: Phase | null;
  bytes: number;
  outcome: string | null;
}>();
const emit = defineEmits<{ update: [pkg: Package]; cancel: []; check: [] }>();
const confirmOpen = ref(false);
const buttonlessUpdate = computed(
  () => props.info?.capabilities.includes('signed-usb-update-v1') ?? false,
);
const confirmationDescription = computed(() => {
  const summary = `Install firmware ${pkg.value?.manifest.version ?? ''} on the connected panel? The display will go blank and restart. Keep USB connected during upload.`;
  return buttonlessUpdate.value
    ? summary
    : `${summary} This installed firmware requires holding GPIO22 for two seconds just before installation (within 60 seconds).`;
});
watch(
  () => [props.info, props.connected],
  () => {
    confirmOpen.value = false;
  },
);
function confirmUpdate() {
  const selected = pkg.value;
  if (!selected || cannotUpdate.value) return;
  confirmOpen.value = false;
  emit('update', selected);
}
const manifest = shallowRef<File | null>(null),
  image = shallowRef<File | null>(null),
  pkg = shallowRef<Package | null>(null),
  error = ref<string | null>(null),
  checking = ref(false);
const compatibilityError = computed(() => {
  if (!pkg.value || !props.info) return null;
  return firmwareCompatibilityError(pkg.value, props.info);
});
const cannotUpdate = computed(() => {
  return (
    !props.connected ||
    props.busy ||
    !pkg.value ||
    checking.value ||
    downloading.value ||
    !!compatibilityError.value
  );
});
const releases = shallowRef<Release[]>([]),
  selectedRelease = ref(''),
  downloading = ref(false);
watch(
  () => props.info,
  async (info) => {
    releases.value = [];
    if (!info?.capabilities.includes('staged-update-v1')) return;
    try {
      const listed = await listReleases(info);
      if (props.info === info) releases.value = listed;
    } catch {
      /* Local signed files remain available when catalogue is unavailable. */
    }
  },
  { immediate: true },
);
async function download() {
  const release = releases.value.find(
    (r) => r.image_id === selectedRelease.value,
  );
  if (!release || props.busy) return;
  downloading.value = true;
  error.value = null;
  confirmOpen.value = false;
  pkg.value = null;
  try {
    pkg.value = await downloadRelease(release);
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Could not download release.';
  } finally {
    downloading.value = false;
  }
}
async function select(event: Event, kind: 'manifest' | 'image') {
  const file = (event.target as HTMLInputElement).files?.[0] ?? null;
  if (kind === 'manifest') manifest.value = file;
  else image.value = file;
  pkg.value = null;
  error.value = null;
  confirmOpen.value = false;
  const m = manifest.value,
    b = image.value;
  if (!m || !b) return;
  checking.value = true;
  try {
    if (m.size > 1024 || b.size !== 1572864)
      throw new Error(
        'Choose manifest.json and the exact firmware.bin release files.',
      );
    const result = await readPackage(
      await m.text(),
      new Uint8Array(await b.arrayBuffer()),
    );
    if (manifest.value === m && image.value === b) pkg.value = result;
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'Could not check the firmware files.';
  } finally {
    checking.value = false;
  }
}
</script>
<template>
  <UCard class="space-y-4">
    <h2 class="text-lg font-semibold">Firmware update</h2>
    <p v-if="info" class="text-sm">
      Installed firmware: {{ info.firmware_version }} · Device
      {{ info.device_id }}
    </p>
    <p v-else class="text-sm">
      Connect a panel to check whether it supports signed firmware updates.
    </p>
    <p v-if="info?.security.trusted_key_id" class="text-xs">
      Trusted key ID: <code>{{ info.security.trusted_key_id }}</code>
    </p>
    <p
      v-if="connected && !info?.capabilities.includes('staged-update-v1')"
      class="text-sm"
    >
      This panel needs a one-time bootloader installation using the recovery
      UF2.
    </p>
    <template v-if="info?.capabilities.includes('staged-update-v1')">
      <div v-if="releases.length" class="flex flex-wrap gap-3 my-4">
        <label class="text-sm"
          >Compatible release
          <select
            v-model="selectedRelease"
            :disabled="busy || downloading"
            class="border rounded p-2"
          >
            <option value="">Choose a release</option>
            <option
              v-for="release in releases"
              :key="release.image_id"
              :value="release.image_id"
            >
              {{ release.version }}
            </option>
          </select>
        </label>
        <UButton
          :disabled="!selectedRelease || busy || downloading"
          @click="download"
          >Download release</UButton
        >
      </div>
      <p v-if="downloading" role="status">Downloading firmware…</p>
      <p class="text-sm">
        Download a compatible signed release and select both files. Settings are
        preserved. The panel checks the release signature before installing it.
      </p>
      <div class="flex flex-wrap gap-4 my-4">
        <label class="text-sm"
          >Release manifest
          <input
            type="file"
            accept=".json"
            :disabled="busy"
            @change="select($event, 'manifest')"
        /></label>
        <label class="text-sm"
          >Firmware image
          <input
            type="file"
            accept=".bin"
            :disabled="busy"
            @change="select($event, 'image')"
        /></label>
      </div>
      <p v-if="checking" role="status">Checking release files…</p>
      <p v-if="compatibilityError" role="alert" class="text-sm text-red-700">
        {{ compatibilityError }}
      </p>
      <p v-if="pkg && !compatibilityError" class="text-sm">
        Ready to install {{ pkg.manifest.version }}.
        <template v-if="buttonlessUpdate">
          No physical button is needed for this signed USB update.
        </template>
        <template v-else>
          The currently installed firmware still requires holding the
          blank-output button (GPIO22) for two seconds before starting the
          update, within 60 seconds. Once firmware supporting button-free
          updates is installed, subsequent signed updates will not require a
          button.
        </template>
      </p>
      <UButton class="mt-4" :disabled="cannotUpdate" @click="confirmOpen = true"
        >Update firmware</UButton
      >
      <UButton
        v-if="phase === 'Uploading' && busy"
        variant="outline"
        class="ml-3"
        @click="emit('cancel')"
        >Cancel upload</UButton
      >
      <UButton
        v-if="phase === 'Checking device'"
        variant="outline"
        class="ml-3"
        :disabled="!connected || busy"
        @click="emit('check')"
        >Check update result</UButton
      >
    </template>
    <div v-if="phase" role="status" class="mt-4">
      {{ phase
      }}{{
        phase === 'Uploading'
          ? ` · ${Math.floor((bytes / 1572864) * 100)}%`
          : ''
      }}
      <progress
        v-if="phase === 'Uploading'"
        :value="bytes"
        :max="1572864"
        class="block w-full"
        aria-label="Firmware upload"
      />
      <p v-if="phase === 'Checking device'" class="text-sm">
        Reconnect the same panel. Success is shown after it confirms the new
        firmware.
      </p>
    </div>
    <p v-if="outcome" role="status" class="mt-3">{{ outcome }}</p>
    <p v-if="error" role="alert" class="mt-3 text-red-700">{{ error }}</p>
  </UCard>
  <UModal
    :open="confirmOpen"
    title="Install firmware update?"
    :description="confirmationDescription"
    :ui="{ footer: 'justify-end' }"
    @update:open="confirmOpen = $event"
  >
    <template #footer>
      <UButton color="neutral" variant="outline" @click="confirmOpen = false">
        Cancel
      </UButton>
      <UButton :disabled="cannotUpdate" @click="confirmUpdate">
        Install firmware
      </UButton>
    </template>
  </UModal>
</template>
