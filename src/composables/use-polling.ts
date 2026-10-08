import { ref, shallowRef, watch, type WatchSource } from 'vue';

/** Restart on dependency changes; abort requests and timers on scope disposal. */
export function usePolling<T>(
  source: WatchSource,
  load: (signal: AbortSignal) => Promise<T> | null,
  interval: () => number,
) {
  const data = shallowRef<T | null>(null);
  const error = ref<string | null>(null);
  const loading = ref(false);

  watch(
    source,
    (_value, _previous, onCleanup) => {
      data.value = null;
      error.value = null;
      loading.value = false;
      let controller: AbortController | null = null;
      const refresh = async () => {
        controller?.abort();
        const request = new AbortController();
        controller = request;
        const pending = load(request.signal);
        if (!pending) return;
        loading.value = true;
        error.value = null;
        try {
          const result = await pending;
          if (!request.signal.aborted) data.value = result;
        } catch (failure) {
          if (!request.signal.aborted) {
            error.value =
              failure instanceof Error
                ? failure.message
                : 'Could not load departures.';
          }
        } finally {
          if (!request.signal.aborted) loading.value = false;
        }
      };
      void refresh();
      const timer = window.setInterval(
        () => void refresh(),
        Math.max(1, Number(interval()) || 30) * 1000,
      );
      onCleanup(() => {
        controller?.abort();
        window.clearInterval(timer);
      });
    },
    { immediate: true },
  );

  return { data, error, loading };
}
