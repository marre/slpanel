import { effectScope, nextTick, ref } from 'vue';
import { usePolling } from './use-polling';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => vi.useRealTimers());

it('aborts the old request and ignores a late result when the stop changes', async () => {
  const stop = ref('first');
  const pending: { signal: AbortSignal; resolve: (value: string[]) => void }[] =
    [];
  const scope = effectScope();
  const polling = scope.run(() =>
    usePolling(
      () => stop.value,
      (signal) =>
        new Promise<string[]>((resolve) => pending.push({ signal, resolve })),
      () => 30,
    ),
  )!;
  stop.value = 'second';
  await nextTick();
  expect(pending[0].signal.aborted).toBe(true);
  pending[1].resolve(['new']);
  await Promise.resolve();
  pending[0].resolve(['old']);
  await Promise.resolve();
  expect(polling.data.value).toEqual(['new']);
  scope.stop();
  expect(pending[1].signal.aborted).toBe(true);
});

it('keeps the last departures visible on a refresh failure and disposes the timer', async () => {
  vi.useFakeTimers();
  const load = vi
    .fn()
    .mockResolvedValueOnce(['last departures'])
    .mockRejectedValueOnce(new Error('Service unavailable'));
  const scope = effectScope();
  const polling = scope.run(() =>
    usePolling(
      () => 'stop',
      load,
      () => 30,
    ),
  )!;
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(polling.data.value).toEqual(['last departures']);
  expect(polling.error.value).toBe('Service unavailable');
  scope.stop();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(load).toHaveBeenCalledTimes(2);
});
