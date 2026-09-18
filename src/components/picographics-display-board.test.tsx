import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PicographicsDisplayBoard } from '@/components/picographics-display-board';

const { createPicographicsBoardMock } = vi.hoisted(() => ({
  createPicographicsBoardMock: vi.fn(),
}));

vi.mock('@/lib/picographics-bridge', () => ({
  createPicographicsBoard: createPicographicsBoardMock,
}));

describe('PicographicsDisplayBoard', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      arc: vi.fn(),
      beginPath: vi.fn(),
      canvas: document.createElement('canvas'),
      fillStyle: '#000000',
      fill: vi.fn(),
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading state while the board initializes', () => {
    createPicographicsBoardMock.mockReturnValue(new Promise(() => undefined));

    render(
      <PicographicsDisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading"
        detail="Starting"
      />,
    );

    expect(screen.getByTestId('picographics-runtime-status')).toHaveTextContent(
      /initializing/i,
    );
  });

  it('shows ready state and calls drawFrame on init', async () => {
    const drawFrameMock = vi.fn().mockResolvedValue(undefined);
    const disposeMock = vi.fn();

    createPicographicsBoardMock.mockResolvedValue({
      drawFrame: drawFrameMock,
      advanceFrame: vi.fn().mockResolvedValue(undefined),
      dispose: disposeMock,
    });

    render(
      <PicographicsDisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading departures"
        detail="Starting"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('picographics-runtime-status')).toHaveTextContent(
        /picographics preview/i,
      );
    });

    expect(drawFrameMock).toHaveBeenCalled();
    expect(disposeMock).not.toHaveBeenCalled();
  });

  it('shows error state when initialization fails', async () => {
    createPicographicsBoardMock.mockRejectedValue(new Error('bootstrap failed'));

    render(
      <PicographicsDisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="error"
        headline="Failed"
        detail="Unavailable"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('picographics-runtime-status')).toHaveTextContent(
        /unavailable/i,
      );
    });
  });

  it('disposes the board on unmount', async () => {
    const disposeMock = vi.fn();

    createPicographicsBoardMock.mockResolvedValue({
      drawFrame: vi.fn().mockResolvedValue(undefined),
      advanceFrame: vi.fn().mockResolvedValue(undefined),
      dispose: disposeMock,
    });

    const { unmount } = render(
      <PicographicsDisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading"
        detail="Starting"
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('picographics-runtime-status')).toHaveTextContent(
        /picographics preview/i,
      );
    });

    unmount();

    expect(disposeMock).toHaveBeenCalled();
  });
});
