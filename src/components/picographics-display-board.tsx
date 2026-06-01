import { useEffect, useRef, useState } from 'react';

import {
  buildAccessibleSummary,
  buildBoardKey,
  createBoardGeometry,
  type DisplayBoardProps,
  LOGICAL_PANEL_WIDTH,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  slugify,
} from '@/components/display-board-shared';
import {
  localPicographicsBoardController,
  type PicographicsBoardController,
  type PicographicsBoardMarqueeState,
} from '@/lib/picographics-board-controller';
import { createCanvasPicographics } from '@/lib/picographics-canvas';
import {
  localPicographicsRuntime,
  type PicographicsRuntime,
  type PicographicsRuntimeSession,
} from '@/lib/picographics-runtime';
import { logPicographicsInfo } from '@/lib/picographics-debug';
import {
  recordPicographicsCount,
  startPicographicsProfile,
} from '@/lib/picographics-profiler';

interface PicographicsDisplayBoardProps extends DisplayBoardProps {
  runtime?: PicographicsRuntime;
}

export function PicographicsDisplayBoard({
  displayName,
  siteName,
  departures,
  tone,
  headline,
  detail,
  runtime = localPicographicsRuntime,
}: PicographicsDisplayBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runtimeState, setRuntimeState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [runtimeLabel, setRuntimeLabel] = useState(runtime.label);
  const controllerRef = useRef<PicographicsBoardController>(
    localPicographicsBoardController,
  );
  const frameInputRef = useRef<DisplayBoardProps>({
    displayName,
    siteName,
    departures,
    tone,
    headline,
    detail,
  });
  const marqueeStateRef = useRef<PicographicsBoardMarqueeState>(
    localPicographicsBoardController.createMarqueeState({
      departures,
      tone,
      headline,
      detail,
    }),
  );
  const lastTimestampRef = useRef(0);
  const pendingDeltaSecondsRef = useRef(0);
  const lastAdvancedFrameInputRef = useRef(frameInputRef.current);
  const boardKeyRef = useRef(buildBoardKey(displayName, siteName));

  useEffect(() => {
    const nextFrameInput = {
      displayName,
      siteName,
      departures,
      tone,
      headline,
      detail,
    };
    const nextBoardKey = buildBoardKey(displayName, siteName);

    frameInputRef.current = nextFrameInput;

    if (boardKeyRef.current !== nextBoardKey) {
      boardKeyRef.current = nextBoardKey;
      lastTimestampRef.current = 0;
      pendingDeltaSecondsRef.current = 0;
      lastAdvancedFrameInputRef.current = nextFrameInput;
      marqueeStateRef.current = controllerRef.current.createMarqueeState(
        nextFrameInput,
      );
    }
  }, [departures, detail, displayName, headline, siteName, tone]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    let animationFrameId = 0;
    let disposed = false;
    let activeSession: PicographicsRuntimeSession | null = null;

    const scheduleNextFrame = (session: PicographicsRuntimeSession) => {
      if (disposed) {
        return;
      }

      logDisplayBoard('scheduleNextFrame', {
        runtimeId: runtime.id,
      });

      animationFrameId = requestAnimationFrame((nextTimestamp) => {
        renderFrame(session, nextTimestamp);
      });
    };

    const handleDrawResult = (
      session: PicographicsRuntimeSession,
      drawResult: void | Promise<void>,
    ) => {
      if (isPromiseLike(drawResult)) {
        drawResult
          .then(() => {
            scheduleNextFrame(session);
          })
          .catch(() => {
            void handleError();
          });
        return;
      }

      scheduleNextFrame(session);
    };

    const renderFrame = (
      session: PicographicsRuntimeSession,
      timestamp: number,
    ) => {
      const stopFrameProfile = startPicographicsProfile('display.frame.handler');
      const isFirstFrame = lastTimestampRef.current === 0;
      const deltaSeconds =
        isFirstFrame
          ? 0
          : (timestamp - lastTimestampRef.current) / 1000;

      lastTimestampRef.current = timestamp;
      pendingDeltaSecondsRef.current += deltaSeconds;

      if (
        !isFirstFrame &&
        !shouldRenderVisibleFrame(
          session,
          frameInputRef.current,
          marqueeStateRef.current,
          pendingDeltaSecondsRef.current,
          lastAdvancedFrameInputRef.current,
        )
      ) {
        recordPicographicsCount('display.frame.skipped');
        scheduleNextFrame(session);
        stopFrameProfile();
        return;
      }

      recordPicographicsCount('display.frame.rendered');
      const effectiveDeltaSeconds = pendingDeltaSecondsRef.current;

      pendingDeltaSecondsRef.current = 0;
      lastAdvancedFrameInputRef.current = frameInputRef.current;
      logDisplayBoard('renderFrame', {
        runtimeId: runtime.id,
        timestamp,
        deltaSeconds: effectiveDeltaSeconds,
        marqueeOffset: marqueeStateRef.current.marqueeOffset,
        activeText: summarizeText(marqueeStateRef.current.activeContent.text),
      });
      const nextState = session.controller.advanceMarqueeState(
        session.graphics,
        marqueeStateRef.current,
        frameInputRef.current,
        effectiveDeltaSeconds,
      );

      const handleResolvedState = (
        resolvedState: PicographicsBoardMarqueeState,
      ) => {
        if (disposed) {
          return;
        }

        marqueeStateRef.current = resolvedState;
        handleDrawResult(
          session,
          session.controller.drawBoard(
            session.graphics,
            frameInputRef.current,
            marqueeStateRef.current,
          ),
        );
      };

      if (isPromiseLike(nextState)) {
        nextState
          .then(handleResolvedState)
          .catch(() => {
            void handleError();
          });
        stopFrameProfile();
        return;
      }

      handleResolvedState(nextState);
      stopFrameProfile();
    };

    const handleError = async () => {
      if (disposed) {
        return;
      }

      logDisplayBoard('handleError', {
        runtimeId: runtime.id,
        runtimeLabel: runtime.label,
      });

      if (runtime.id !== localPicographicsRuntime.id) {
        try {
          const fallbackRuntime = localPicographicsRuntime.initialize(context);

          if (isPromiseLike(fallbackRuntime)) {
            const session = await fallbackRuntime;
            handleReady(session, {
              status: 'error',
              label: `${runtime.label} unavailable, local fallback`,
            });
            return;
          }

          handleReady(fallbackRuntime, {
            status: 'error',
            label: `${runtime.label} unavailable, local fallback`,
          });
          return;
        } catch {
          // Fall through to the plain error state if even the local runtime fails.
        }
      }

      setRuntimeState('error');
      setRuntimeLabel(`${runtime.label} unavailable`);
    };

    const handleReady = (
      session: PicographicsRuntimeSession,
      options: {
        status: 'ready' | 'error';
        label: string;
      } = {
        status: 'ready',
        label: runtime.label,
      },
    ) => {
      if (disposed) {
        return;
      }

      logDisplayBoard('handleReady', {
        runtimeId: runtime.id,
        status: options.status,
        label: options.label,
      });

      activeSession = session;
      controllerRef.current = session.controller;
      marqueeStateRef.current = session.controller.createMarqueeState(
        frameInputRef.current,
      );
      lastTimestampRef.current = 0;
      pendingDeltaSecondsRef.current = 0;
      lastAdvancedFrameInputRef.current = frameInputRef.current;
      setRuntimeState(options.status);
      setRuntimeLabel(options.label);

      handleDrawResult(
        session,
        session.controller.drawBoard(
          session.graphics,
          frameInputRef.current,
          marqueeStateRef.current,
        ),
      );
    };

    const start = () => {
      logDisplayBoard('start', {
        runtimeId: runtime.id,
        runtimeLabel: runtime.label,
      });
      setRuntimeState('loading');
      setRuntimeLabel(runtime.label);
      controllerRef.current = localPicographicsBoardController;
      marqueeStateRef.current = localPicographicsBoardController.createMarqueeState(
        frameInputRef.current,
      );
      lastTimestampRef.current = 0;
      pendingDeltaSecondsRef.current = 0;
      lastAdvancedFrameInputRef.current = frameInputRef.current;

      // Repaint immediately so a previous runtime frame does not linger while
      // an async runtime bootstraps.
      localPicographicsBoardController.drawBoard(
        createCanvasPicographics(context),
        frameInputRef.current,
        marqueeStateRef.current,
      );

      try {
        const initializedRuntime = runtime.initialize(context);

        if (isPromiseLike(initializedRuntime)) {
          initializedRuntime
            .then((session) => {
              handleReady(session);
            })
            .catch(() => {
              void handleError();
            });
          return;
        }

        handleReady(initializedRuntime);
      } catch {
        logDisplayBoard('start:initialize-threw', {
          runtimeId: runtime.id,
        });
        void handleError();
      }
    };

    void start();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrameId);
      const disposeResult = activeSession?.dispose?.();

      if (disposeResult && isPromiseLike(disposeResult)) {
        void disposeResult;
      }
    };
  }, [runtime]);

  const accessibleSummary = buildAccessibleSummary({
    departures,
    headline,
    detail,
    tone,
    siteName,
  });

  return (
    <div
      data-testid="picographics-display-board"
      className="inline-flex w-full max-w-[68rem] rounded-[2.4rem] border border-[var(--panel-border)] bg-[linear-gradient(180deg,rgba(12,26,36,0.96),rgba(5,10,14,0.98))] p-4 shadow-[inset_0_0_0_1px_rgba(100,200,255,0.08),0_28px_80px_rgba(0,0,0,0.52)] md:p-5"
    >
      <div className="w-full rounded-[1.55rem] border border-black/70 bg-[radial-gradient(circle_at_top,rgba(94,201,255,0.08),transparent_40%),#000] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] md:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.65rem] uppercase tracking-[0.32em] text-[var(--panel-text-soft)]">
            Picographics preview
          </p>
          <span
            data-testid="picographics-runtime-status"
            className={`rounded-full border px-3 py-1 text-[0.55rem] uppercase tracking-[0.22em] ${
              runtimeState === 'error'
                ? 'border-[#ffb18c] text-[#ffd7a0]'
                : runtimeState === 'ready'
                  ? 'border-[#84d8ff] text-[#b9edff]'
                  : 'border-[var(--panel-border)] text-[var(--muted-text)]'
            }`}
          >
            {runtimeLabel}
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          role="img"
          aria-label={`SL departure board preview for ${displayName}`}
          aria-describedby={`picographics-board-summary-${slugify(displayName)}`}
          className="h-auto w-full rounded-[0.6rem] bg-black"
        />
        <p
          id={`picographics-board-summary-${slugify(displayName)}`}
          className="sr-only"
        >
          {accessibleSummary}
        </p>
      </div>
    </div>
  );
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}

function shouldRenderVisibleFrame(
  session: PicographicsRuntimeSession,
  frameInput: DisplayBoardProps,
  marqueeState: PicographicsBoardMarqueeState,
  deltaSeconds: number,
  lastAdvancedFrameInput: DisplayBoardProps,
) {
  if (frameInput !== lastAdvancedFrameInput) {
    return true;
  }

  const activeText = marqueeState.activeContent.text;
  const marqueeWidth = Math.max(session.graphics.measure_text(activeText), 1);
  let nextOffset =
    marqueeState.marqueeOffset - deltaSeconds * createBoardGeometry().marqueeSpeed;

  if (nextOffset <= -marqueeWidth) {
    nextOffset = LOGICAL_PANEL_WIDTH;
  }

  return Math.round(nextOffset) !== Math.round(marqueeState.marqueeOffset);
}

function logDisplayBoard(event: string, payload: Record<string, unknown>) {
  logPicographicsInfo('[slpanel/picographics-display-board]', event, payload);
}

function summarizeText(value: string, maxLength = 60) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}