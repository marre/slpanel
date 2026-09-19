import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DepartureRecord } from '@/api/types';
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

  it('sends only the frame input to the board (no measurements sync)', async () => {
    const drawFrameMock = vi.fn().mockResolvedValue(undefined);
    const disposeMock = vi.fn();

    createPicographicsBoardMock.mockResolvedValue({
      drawFrame: drawFrameMock,
      advanceFrame: vi.fn().mockResolvedValue(undefined),
      dispose: disposeMock,
    });

    const departures: DepartureRecord[] = [
      {
        line_number: '17',
        destination: 'Hagsätra',
        display_time: '1 min',
        minutes_until_departure: 1,
        scheduled_at: '2026-05-29T12:01:00Z',
        expected_at: '2026-05-29T12:01:00Z',
        transport_mode: 'METRO',
        platform: '2',
        state: 'EXPECTED',
      },
      {
        line_number: '18',
        destination: 'Farsta strand',
        display_time: '4 min',
        minutes_until_departure: 4,
        scheduled_at: '2026-05-29T12:04:00Z',
        expected_at: '2026-05-29T12:04:00Z',
        transport_mode: 'METRO',
        platform: '2',
        state: 'EXPECTED',
      },
    ];

    render(
      <PicographicsDisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={departures}
        tone="live"
        headline="Live departures"
        detail="Board is running"
      />,
    );

    await waitFor(() => {
      expect(drawFrameMock).toHaveBeenCalled();
    });

    expect(drawFrameMock.mock.calls[0]).toHaveLength(2);
    const frameInput = JSON.parse(drawFrameMock.mock.calls[0]?.[1] as string) as {
      departures: DepartureRecord[];
      tone: string;
      headline: string;
      detail: string;
    };

    expect(frameInput.tone).toBe('live');
    expect(frameInput.headline).toBe('Live departures');
    expect(frameInput.detail).toBe('Board is running');
    expect(frameInput.departures).toHaveLength(2);
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
