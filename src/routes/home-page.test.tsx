import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { HomePage } from '@/routes/home-page';

describe('HomePage', () => {
  it('renders the scaffold actions', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: /admin workspace is live/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /open config workspace/i }),
    ).toHaveAttribute('href', '/config');
    expect(
      screen.getByRole('link', { name: /open display shell/i }),
    ).toHaveAttribute('href', '/display/demo-board');
  });
});
