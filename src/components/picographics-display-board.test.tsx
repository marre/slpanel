import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { localPicographicsBoardController } from '@/lib/picographics-board-controller';
import type { PicographicsRuntime } from '@/lib/picographics-runtime';
import { PicographicsDisplayBoard } from '@/components/picographics-display-board';

describe('PicographicsDisplayBoard', () => {
  let context: CanvasRenderingContext2D & {
    arc: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
    fillRect: ReturnType<typeof vi.fn>;
  };
  let animationFrameCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      canvas: document.createElement('canvas'),
      drawImage: vi.fn(),
      fill: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '#000000',
    } as unknown as CanvasRenderingContext2D & {
      arc: ReturnType<typeof vi.fn>;
      beginPath: ReturnType<typeof vi.fn>;
      canvas: HTMLCanvasElement;
      drawImage: ReturnType<typeof vi.fn>;
      fill: ReturnType<typeof vi.fn>;
      fillRect: ReturnType<typeof vi.fn>;
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context,
    );

    animationFrameCallbacks = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrameCallbacks.push(callback);
        return animationFrameCallbacks.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the default local runtime once initialization succeeds', async () => {
    render(
      <PicographicsDisplayBoard
        displayName="Demo board preview"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading departures"
        detail="Board is starting"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('picographics-runtime-status'),
      ).toHaveTextContent(/local picographics shim/i);
    });

    expect(
      screen.getByTestId('picographics-display-board'),
    ).toBeInTheDocument();
  });

  it('shows an unavailable status when runtime initialization fails', async () => {
    const failingRuntime: PicographicsRuntime = {
      id: 'unicorn',
      label: 'MicroPython Unicorn',
      async initialize() {
        throw new Error('runtime bootstrap failed');
      },
    };

    render(
      <PicographicsDisplayBoard
        displayName="Demo board preview"
        siteName="Slussen"
        departures={[]}
        tone="error"
        headline="Runtime failed"
        detail="Preview unavailable"
        runtime={failingRuntime}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('picographics-runtime-status'),
      ).toHaveTextContent(/micropython unicorn unavailable/i);
    });
  });

  it('accepts a runtime-provided controller session', async () => {
    const drawBoardMock = vi.fn();
    const runtime: PicographicsRuntime = {
      id: 'pyscript',
      label: 'PyScript',
      initialize() {
        return {
          graphics: {
            create_pen: vi.fn(),
            set_pen: vi.fn(),
            clear: vi.fn(),
            pixel: vi.fn(),
            rectangle: vi.fn(),
            text: vi.fn(),
            measure_text: vi.fn(() => 10),
            update: vi.fn(),
          },
          controller: {
            ...localPicographicsBoardController,
            drawBoard: drawBoardMock,
          },
        };
      },
    };

    render(
      <PicographicsDisplayBoard
        displayName="Demo board preview"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading departures"
        detail="Board is starting"
        runtime={runtime}
      />,
    );

    await waitFor(() => {
      expect(drawBoardMock).toHaveBeenCalled();
    });

    expect(screen.getByTestId('picographics-runtime-status')).toHaveTextContent(
      /pyscript/i,
    );
  });

  it('repaints immediately when switching to a runtime that is still loading', async () => {
    const pendingRuntime: PicographicsRuntime = {
      id: 'pyscript',
      label: 'PyScript bootstrap',
      initialize() {
        return new Promise(() => undefined);
      },
    };

    const { rerender } = render(
      <PicographicsDisplayBoard
        displayName="Demo board preview"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Loading departures"
        detail="Board is starting"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('picographics-runtime-status'),
      ).toHaveTextContent(/local picographics shim/i);
    });

    const initialDrawCount = context.fillRect.mock.calls.length;

    rerender(
      <PicographicsDisplayBoard
        displayName="Demo board preview"
        siteName="Slussen"
        departures={[]}
        tone="loading"
        headline="Booting Python"
        detail="Waiting for the hosted runtime"
        runtime={pendingRuntime}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByTestId('picographics-runtime-status'),
      ).toHaveTextContent(/pyscript bootstrap/i);
      expect(context.fillRect.mock.calls.length).toBeGreaterThan(
        initialDrawCount,
      );
    });
  });

  it('continues advancing frames with an async runtime controller', async () => {
    const observedOffsets: number[] = [];
    const runtime: PicographicsRuntime = {
      id: 'pyscript',
      label: 'PyScript bootstrap',
      initialize() {
        return {
          graphics: {
            create_pen: vi.fn(),
            set_pen: vi.fn(),
            clear: vi.fn(),
            pixel: vi.fn(),
            rectangle: vi.fn(),
            text: vi.fn(),
            measure_text: vi.fn(() => 24),
            update: vi.fn(),
          },
          controller: {
            createMarqueeState() {
              return {
                activeContent: {
                  text: 'No later departures',
                  interruptible: false,
                },
                pendingContent: {
                  text: 'No later departures',
                  interruptible: false,
                },
                marqueeOffset: 128,
              };
            },
            async advanceMarqueeState(
              _graphics,
              marqueeState,
              _frameInput,
              deltaSeconds,
            ) {
              return {
                ...marqueeState,
                marqueeOffset: marqueeState.marqueeOffset - deltaSeconds * 18,
              };
            },
            async drawBoard(_graphics, _frameInput, marqueeState) {
              observedOffsets.push(marqueeState.marqueeOffset);
            },
          },
        };
      },
    };

    render(
      <PicographicsDisplayBoard
        displayName="Demo board preview"
        siteName="Slussen"
        departures={[]}
        tone="live"
        headline="Live departures"
        detail="Board is running"
        runtime={runtime}
      />,
    );

    await waitFor(() => {
      expect(observedOffsets).toHaveLength(1);
      expect(animationFrameCallbacks).toHaveLength(1);
    });

    animationFrameCallbacks.shift()?.(1000);

    await waitFor(() => {
      expect(observedOffsets).toHaveLength(2);
      expect(observedOffsets[1]).toBe(128);
      expect(animationFrameCallbacks).toHaveLength(1);
    });

    animationFrameCallbacks.shift()?.(2000);

    await waitFor(() => {
      expect(observedOffsets).toHaveLength(3);
      expect(observedOffsets[2]).toBe(110);
    });
  });

  it('skips async controller work when a frame cannot change the visible marquee position', async () => {
    const advanceMarqueeStateMock = vi
      .fn()
      .mockImplementation(
        async (_graphics, marqueeState, _frameInput, deltaSeconds) => ({
          ...marqueeState,
          marqueeOffset: marqueeState.marqueeOffset - deltaSeconds * 18,
        }),
      );
    const drawBoardMock = vi.fn();
    const runtime: PicographicsRuntime = {
      id: 'pyscript',
      label: 'PyScript bootstrap',
      initialize() {
        return {
          graphics: {
            create_pen: vi.fn(),
            set_pen: vi.fn(),
            clear: vi.fn(),
            pixel: vi.fn(),
            rectangle: vi.fn(),
            text: vi.fn(),
            measure_text: vi.fn(() => 24),
            update: vi.fn(),
          },
          controller: {
            createMarqueeState() {
              return {
                activeContent: {
                  text: 'No later departures',
                  interruptible: false,
                },
                pendingContent: {
                  text: 'No later departures',
                  interruptible: false,
                },
                marqueeOffset: 128,
              };
            },
            advanceMarqueeState: advanceMarqueeStateMock,
            drawBoard: drawBoardMock,
          },
        };
      },
    };

    render(
      <PicographicsDisplayBoard
        displayName="Demo board preview"
        siteName="Slussen"
        departures={[]}
        tone="live"
        headline="Live departures"
        detail="Board is running"
        runtime={runtime}
      />,
    );

    await waitFor(() => {
      expect(drawBoardMock).toHaveBeenCalledTimes(1);
      expect(animationFrameCallbacks).toHaveLength(1);
    });

    animationFrameCallbacks.shift()?.(1000);

    await waitFor(() => {
      expect(advanceMarqueeStateMock).toHaveBeenCalledTimes(1);
      expect(drawBoardMock).toHaveBeenCalledTimes(2);
      expect(animationFrameCallbacks).toHaveLength(1);
    });

    animationFrameCallbacks.shift()?.(1010);

    await waitFor(() => {
      expect(advanceMarqueeStateMock).toHaveBeenCalledTimes(1);
      expect(drawBoardMock).toHaveBeenCalledTimes(2);
      expect(animationFrameCallbacks).toHaveLength(1);
    });

    animationFrameCallbacks.shift()?.(1060);

    await waitFor(() => {
      expect(advanceMarqueeStateMock).toHaveBeenCalledTimes(2);
      expect(drawBoardMock).toHaveBeenCalledTimes(3);
    });
  });
});
