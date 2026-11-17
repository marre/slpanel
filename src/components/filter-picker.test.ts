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
  await fireEvent.click(screen.getByRole('button'));
  await fireEvent.update(
    screen.getByPlaceholderText('Search or add a value…'),
    '99',
  );
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
  await fireEvent.click(screen.getByRole('button'));
  await fireEvent.click(await screen.findByRole('option', { name: /99/ }));
  await waitFor(() => expect(update).toHaveBeenCalledWith([]));
});

it('keeps selected directions compact without losing their full labels', async () => {
  const values = [
    'Hagsätra via Skanstull and Gullmarsplan',
    'Farsta strand',
    'Norsborg via Liljeholmen',
  ];
  await render(
    h(FilterPicker, {
      id: 'directions',
      modelValue: values,
      options: values.map((value) => ({
        value,
        label: value,
        transportMode: 'METRO',
      })),
      disabled: false,
      placeholder: 'All directions',
    }),
  );

  const trigger = screen.getByRole('button');
  expect(trigger).toHaveClass('h-10', 'min-h-10');
  expect(
    screen.getByText('Hagsätra via Skanstull and Gullmarsplan +2 more'),
  ).toHaveClass('truncate');
  expect(screen.getByTitle(values.join(', '))).toBeInTheDocument();
});
