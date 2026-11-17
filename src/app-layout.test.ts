import { h } from 'vue';
import { fireEvent, screen, waitFor } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import AppLayout from '@/app-layout.vue';
async function renderLayout(entry = '/') {
  await render(
    routerFixture(
      [entry],
      [
        [
          {
            element: h(AppLayout, {}),
            children: [
              {
                path: '/',
                element: h('h1', {}, ['Home']),
                children: [],
              },
              {
                path: '/devices',
                element: h('h1', {}, ['Display settings']),
                children: [],
              },
            ],
          },
        ],
      ],
    ),
  );
}
describe('AppLayout', () => {
  beforeEach(() => window.localStorage.clear());
  it('shows one owner selector in the header and retains the owner between pages', async () => {
    await renderLayout('/?owner=Ab12Cd34');
    expect(
      screen.getAllByRole('button', { name: 'Select owner' }),
    ).toHaveLength(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Select owner' }));
    expect(screen.getByRole('textbox', { name: 'Owner ID' })).toHaveValue(
      'Ab12Cd34',
    );
    expect(screen.getByRole('link', { name: 'Devices' })).toHaveAttribute(
      'href',
      '/devices?owner=Ab12Cd34',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await fireEvent.click(screen.getByRole('link', { name: 'Devices' }));
    expect(
      await screen.findByRole('heading', { name: 'Display settings' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Select owner' }),
    ).toHaveTextContent('Ab12Cd34');
    expect(window.localStorage.getItem('slpanel.owner-id')).toBe('Ab12Cd34');
  });

  it('updates workspace selection from the global header', async () => {
    await renderLayout('/?owner=Ab12Cd34');
    await fireEvent.click(screen.getByRole('button', { name: 'Select owner' }));
    await fireEvent.update(
      screen.getByRole('textbox', { name: 'Owner ID' }),
      'Cd56Ef78',
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Switch owner' }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Scenes' })).toHaveAttribute(
        'href',
        '/scenes?owner=Cd56Ef78',
      );
    });
    expect(window.localStorage.getItem('slpanel.owner-id')).toBe('Cd56Ef78');
  });

  it('exposes persistent navigation at desktop widths without a hamburger', async () => {
    await renderLayout();
    expect(screen.getByRole('button', { name: 'Menu' })).toHaveClass(
      'lg:hidden',
    );
    expect(screen.getByRole('navigation')).toHaveClass('lg:flex');
  });

  it('opens the mobile menu, navigates and closes it', async () => {
    await renderLayout();
    const button = screen.getByRole('button', {
      name: 'Menu',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.click(
      screen.getByRole('link', {
        name: 'Devices',
      }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Display settings',
      }),
    ).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('link', {
        name: 'Devices',
      }),
    ).toHaveAttribute('aria-current', 'page');
  });
  it('closes the menu with Escape and returns focus to the menu button', async () => {
    await renderLayout();
    const button = screen.getByRole('button', {
      name: 'Menu',
    });
    await fireEvent.click(button);
    await fireEvent.keyDown(screen.getByRole('navigation'), {
      key: 'Escape',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    expect(
      screen.getByRole('link', {
        name: 'Skip to content',
      }),
    ).toHaveAttribute('href', '#main-content');
  });
});
