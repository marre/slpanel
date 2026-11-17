import { h } from 'vue';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render } from '@/test/render';
import FilterPicker from './filter-picker.vue';
import { expect, it, vi } from 'vitest';

it('creates and removes a custom filter through Nuxt UI SelectMenu', async () => {
  const update = vi.fn();
  const view = await render(
    h(FilterPicker, {
      id: 'filters',
      modelValue: [],
      options: [],
      disabled: false,
      placeholder: 'Line numbers',
      'onUpdate:modelValue': update,
    }),
  );
  await fireEvent.click(screen.getByRole('combobox'));
  await fireEvent.update(screen.getByPlaceholderText('Search or add a value…'), '99');
  await fireEvent.click(await screen.findByRole('option', { name: /99/ }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(['99']));
  await view.rerender(
    h(FilterPicker, {
      id: 'filters',
      modelValue: ['99'],
      options: [],
      disabled: false,
      placeholder: 'Line numbers',
      'onUpdate:modelValue': update,
    }),
  );
  await fireEvent.click(screen.getByRole('combobox'));
  await fireEvent.click(await screen.findByRole('option', { name: /99/ }));
  await waitFor(() => expect(update).toHaveBeenCalledWith([]));
});
