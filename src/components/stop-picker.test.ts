import { h } from 'vue';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render } from '@/test/render';
import StopPicker from './stop-picker.vue';
import { searchStops } from '@/lib/config-api';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/config-api', () => ({ searchStops: vi.fn() }));
afterEach(() => vi.mocked(searchStops).mockReset());

it('shows search failures and aborts the active search when disposed', async () => {
  vi.mocked(searchStops).mockRejectedValue(
    new Error('Stop service unavailable'),
  );
  const view = await render(h(StopPicker, { siteId: null, siteName: null }));
  await fireEvent.input(
    screen.getByPlaceholderText('e.g. Slussen, Centralen…'),
    { target: { value: 'Slussen' } },
  );
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Stop service unavailable',
    ),
  );
  const signal = vi.mocked(searchStops).mock.calls[0][1]!;
  view.unmount();
  expect(signal.aborted).toBe(true);
});
