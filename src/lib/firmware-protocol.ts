export type Manifest = {
  format: number;
  board: string;
  layout: string;
  version: string;
  revision: string;
  image_size: number;
  payload_sha256: string;
  key_id: string;
  signature: string;
};
export type UpdateIdentity = { image_id: string; attempt_id: string };
export type UpdateState =
  | 'idle'
  | 'receiving'
  | 'ready'
  | 'pending'
  | 'trial'
  | 'confirmed'
  | 'rolled-back'
  | 'rejected';
export type Receipt = UpdateIdentity & {
  running_image_id: string;
  outcome: 'confirmed' | 'rolled-back' | 'rejected';
  reason: string;
};
export type UpdateStatus = {
  state: UpdateState;
  image_id: string | null;
  attempt_id: string | null;
  next_offset: number;
  resume_offset: number;
  authorized: boolean;
  authorization_remaining_ms: number;
  maintenance: boolean;
  lease_remaining_ms: number;
  last_result: Receipt | null;
};
export type DeviceInfo = {
  device_id: string;
  board: string;
  layout: string;
  firmware_version: string;
  firmware_revision: string;
  running_image_id: string;
  bootloader_version: string;
  capabilities: string[];
  update_limits: {
    image_size: number;
    chunk_bytes: number;
    checkpoint_bytes: number;
  };
  security: { signed_updates: boolean; hardware_secure_boot: boolean };
};
export type UpdateRequest =
  | { op: 'device-info' }
  | { op: 'update-status' }
  | { op: 'begin-update'; manifest: Manifest }
  | ({
      op: 'write-update-chunk';
      offset: number;
      data: string;
    } & UpdateIdentity)
  | ({
      op: 'finish-update' | 'activate-update' | 'abort-update';
    } & UpdateIdentity)
  | { op: 'enter-bootloader' };
export type UpdateReply =
  | ({ reply: 'device-info' } & DeviceInfo)
  | ({ reply: 'update-status' } & UpdateStatus)
  | ({
      reply: 'update-begun';
      next_offset: number;
      resume_offset: number;
      chunk_bytes: number;
    } & UpdateIdentity)
  | ({
      reply: 'update-chunk-written';
      next_offset: number;
      resume_offset: number;
    } & UpdateIdentity)
  | ({ reply: 'update-ready' | 'update-aborted' } & UpdateIdentity)
  | ({ reply: 'update-activating'; rebooting: true } & UpdateIdentity)
  | { reply: 'bootloader-ready'; rebooting: true };
const states = [
  'idle',
  'receiving',
  'ready',
  'pending',
  'trial',
  'confirmed',
  'rolled-back',
  'rejected',
];
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const hex = (v: unknown, n: number) =>
  typeof v === 'string' && new RegExp(`^[0-9a-f]{${n}}$`).test(v);
const counter = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const identity = (v: Record<string, unknown>) =>
  hex(v.image_id, 64) && hex(v.attempt_id, 32);
const offsets = (v: Record<string, unknown>) =>
  counter(v.next_offset) &&
  counter(v.resume_offset) &&
  v.next_offset <= 1572864 &&
  v.next_offset % 256 === 0 &&
  v.resume_offset <= v.next_offset &&
  v.resume_offset % 4096 === 0;
export function isUpdateReply(v: unknown): v is UpdateReply {
  if (!object(v)) return false;
  switch (v.reply) {
    case 'device-info':
      return (
        hex(v.device_id, 16) &&
        [
          'board',
          'layout',
          'firmware_version',
          'firmware_revision',
          'bootloader_version',
        ].every((k) => typeof v[k] === 'string') &&
        hex(v.running_image_id, 64) &&
        Array.isArray(v.capabilities) &&
        v.capabilities.every((c) => typeof c === 'string') &&
        object(v.update_limits) &&
        ['image_size', 'chunk_bytes', 'checkpoint_bytes'].every((k) =>
          counter((v.update_limits as Record<string, unknown>)[k]),
        ) &&
        object(v.security) &&
        typeof v.security.signed_updates === 'boolean' &&
        typeof v.security.hardware_secure_boot === 'boolean'
      );
    case 'update-status':
      return (
        states.includes(String(v.state)) &&
        (v.image_id === null || hex(v.image_id, 64)) &&
        (v.attempt_id === null || hex(v.attempt_id, 32)) &&
        offsets(v) &&
        typeof v.authorized === 'boolean' &&
        typeof v.maintenance === 'boolean' &&
        counter(v.authorization_remaining_ms) &&
        counter(v.lease_remaining_ms) &&
        (v.last_result === null ||
          (object(v.last_result) &&
            identity(v.last_result) &&
            hex(v.last_result.running_image_id, 64) &&
            ['confirmed', 'rolled-back', 'rejected'].includes(
              String(v.last_result.outcome),
            ) &&
            typeof v.last_result.reason === 'string'))
      );
    case 'update-begun':
      return identity(v) && offsets(v) && v.chunk_bytes === 256;
    case 'update-chunk-written':
      return identity(v) && offsets(v);
    case 'update-ready':
    case 'update-aborted':
      return identity(v);
    case 'update-activating':
      return identity(v) && v.rebooting === true;
    case 'bootloader-ready':
      return v.rebooting === true;
    default:
      return false;
  }
}
export const expectedUpdateReply: Record<string, string> = {
  'begin-update': 'update-begun',
  'write-update-chunk': 'update-chunk-written',
  'finish-update': 'update-ready',
  'activate-update': 'update-activating',
  'abort-update': 'update-aborted',
  'enter-bootloader': 'bootloader-ready',
};
