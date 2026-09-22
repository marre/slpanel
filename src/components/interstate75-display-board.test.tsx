import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DepartureRecord } from '@/api/types';
import { Interstate75DisplayBoard } from '@/components/interstate75-display-board';

const { createWasmBoardMock } = vi.hoisted(() => ({
  createWasmBoardMock: vi.fn(),
}));

vi.mock('@/lib/wasm-renderer', () => ({
  createWasmBoard: createWasmBoardMock,
}));

describe('Interstate75DisplayBoard', () => {
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
    createWasmBoardMock.mockReturnValue(new Promise(() => undefined));

    render(
      <Interstate75DisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading"
        detail="Starting"
      />,
    );

    expect(screen.getByTestId('interstate75-runtime-status')).toHaveTextContent(
      /initializing/i,
    );
  });

  it('shows ready state and calls drawFrame on init', async () => {
    const drawFrameMock = vi.fn().mockResolvedValue(undefined);
    const disposeMock = vi.fn();

    createWasmBoardMock.mockResolvedValue({
      drawFrame: drawFrameMock,
      advanceFrame: vi.fn().mockResolvedValue(undefined),
      dispose: disposeMock,
    });

    render(
      <Interstate75DisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading departures"
        detail="Starting"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('interstate75-runtime-status'),
      ).toHaveTextContent(/interstate 75 preview/i);
    });

    expect(drawFrameMock).toHaveBeenCalled();
    expect(disposeMock).not.toHaveBeenCalled();
  });

  it('passes the complete frame input to the Rust renderer', async () => {
    const drawFrameMock = vi.fn().mockResolvedValue(undefined);
    const disposeMock = vi.fn();

    createWasmBoardMock.mockResolvedValue({
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
      <Interstate75DisplayBoard
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

    const frameInputJson = drawFrameMock.mock.calls[0]?.[1] as string;
    const frameInput = JSON.parse(frameInputJson) as {
      tone: string;
      departures: DepartureRecord[];
    };

    expect(frameInput.tone).toBe('live');
    expect(frameInput.departures).toEqual(departures);
  });

  it('shows error state when initialization fails', async () => {
    createWasmBoardMock.mockRejectedValue(new Error('bootstrap failed'));

    render(
      <Interstate75DisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="error"
        headline="Failed"
        detail="Unavailable"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('interstate75-runtime-status'),
      ).toHaveTextContent(/unavailable/i);
    });
  });

  it('disposes the board on unmount', async () => {
    const disposeMock = vi.fn();

    createWasmBoardMock.mockResolvedValue({
      drawFrame: vi.fn().mockResolvedValue(undefined),
      advanceFrame: vi.fn().mockResolvedValue(undefined),
      dispose: disposeMock,
    });

    const { unmount } = render(
      <Interstate75DisplayBoard
        displayName="Demo board"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading"
        detail="Starting"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('interstate75-runtime-status'),
      ).toHaveTextContent(/interstate 75 preview/i);
    });

    unmount();

    expect(disposeMock).toHaveBeenCalled();
  });
});
