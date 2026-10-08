import { h } from 'vue';
import { fireEvent, screen } from '@testing-library/vue';
import { render, routerFixture } from '@/test/render';
import AppLayout from '@/app-layout.vue';
async function renderLayout() {
  await render(
    routerFixture(
      ['/'],
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
                path: '/config',
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
        name: 'My displays',
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
        name: 'My displays',
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
