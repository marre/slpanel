import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { AppLayout } from '@/app-layout';

function renderLayout() {
  render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<h1>Home</h1>} />
          <Route path="/config" element={<h1>Display settings</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  it('opens the mobile menu, navigates and closes it', () => {
    renderLayout();
    const button = screen.getByRole('button', { name: 'Menu' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('link', { name: 'My displays' }));
    expect(
      screen.getByRole('heading', { name: 'Display settings' }),
    ).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('link', { name: 'My displays' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('closes the menu with Escape and returns focus to the menu button', () => {
    renderLayout();
    const button = screen.getByRole('button', { name: 'Menu' });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('navigation'), { key: 'Escape' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
    expect(
      screen.getByRole('link', { name: 'Skip to content' }),
    ).toHaveAttribute('href', '#main-content');
  });
});
