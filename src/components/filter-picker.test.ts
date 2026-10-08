import { h } from 'vue';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render } from '@/test/render';
import FilterPicker from './filter-picker.vue';
import { expect, it, vi } from 'vitest';

it('creates and removes a custom filter through the Nuxt UI combobox', async () => {
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
  const input = screen.getByPlaceholderText('Line numbers');
  input.focus();
  await fireEvent.keyDown(input, { key: 'ArrowDown' });
  await fireEvent.input(input, { target: { value: '99' } });
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
  await fireEvent.keyDown(input, { key: 'Escape' });
  await fireEvent.click(await screen.findByRole('button', { name: '99' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith([]));
});
