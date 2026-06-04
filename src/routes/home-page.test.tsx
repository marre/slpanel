import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, vi } from 'vitest';

import { HomePage } from '@/routes/home-page';

describe('HomePage', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '#000000',
    } as unknown as CanvasRenderingContext2D);

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the scaffold actions', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: /real-time SL transit displays/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /set up a display/i }),
    ).toHaveAttribute('href', '/config');
    expect(
      screen.getByRole('link', { name: /view demo board/i }),
    ).toHaveAttribute('href', '/display/demo-board');
    expect(
      screen.getByRole('link', { name: /pyscript preview/i }),
    ).toHaveAttribute(
      'href',
      '/display/demo-board?renderer=interstate75&runtime=pyscript',
    );
  });
});
