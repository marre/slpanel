import { useEffect, useRef, useState } from 'react';

import {
  buildAccessibleSummary,
  type DisplayBoardProps,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  slugify,
} from '@/components/display-board-shared';
import {
  createPicographicsBoard,
  type PicographicsBoard,
} from '@/lib/picographics-bridge';

export function PicographicsDisplayBoard({
  displayName,
  siteName,
  departures,
  tone,
  headline,
  detail,
}: DisplayBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const boardRef = useRef<PicographicsBoard | null>(null);
  const [statusText, setStatusText] = useState('Initializing…');
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    let disposed = false;
    let animationId = 0;

    createPicographicsBoard(context)
      .then((board) => {
        if (disposed) {
          board.dispose();
          return;
        }

        boardRef.current = board;
        setStatusText('Picographics preview');
        setReady(true);

        const buildFrameJson = () =>
          JSON.stringify({
            departures,
            tone,
            headline,
            detail,
          });

        const renderLoop = () => {
          if (disposed || !boardRef.current) return;

          board.advanceFrame(canvas, buildFrameJson(), 1 / 60).catch(() => {});

          animationId = requestAnimationFrame(renderLoop);
        };

        board
          .drawFrame(canvas, buildFrameJson())
          .then(() => {
            if (disposed) {
              return;
            }

            const prefersReducedMotion =
              typeof window !== 'undefined' &&
              typeof window.matchMedia === 'function' &&
              window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            if (!prefersReducedMotion) {
              animationId = requestAnimationFrame(renderLoop);
            }
          })
          .catch(() => {
            if (!disposed) {
              setStatusText('Picographics unavailable');
              setFailed(true);
            }
          });
      })
      .catch(() => {
        if (!disposed) {
          setStatusText('Picographics unavailable');
          setFailed(true);
        }
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      boardRef.current?.dispose();
      boardRef.current = null;
    };
  }, []);

  // Re-draw on prop changes
  useEffect(() => {
    if (!ready || !boardRef.current || !canvasRef.current) return;

    const frameInputJson = JSON.stringify({
      departures,
      tone,
      headline,
      detail,
    });

    boardRef.current.drawFrame(canvasRef.current, frameInputJson).catch(() => {});
  }, [departures, tone, headline, detail, ready]);

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
      className="w-full max-w-[68rem] rounded-[2.4rem] border border-[var(--panel-border)] bg-[linear-gradient(180deg,rgba(12,26,36,0.96),rgba(5,10,14,0.98))] p-4 shadow-[inset_0_0_0_1px_rgba(100,200,255,0.08),0_28px_80px_rgba(0,0,0,0.52)] md:p-5"
    >
      <div className="w-full rounded-[1.55rem] border border-black/70 bg-[radial-gradient(circle_at_top,rgba(94,201,255,0.08),transparent_40%),#000] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] md:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.7rem] uppercase tracking-[0.22em] text-[var(--panel-text-soft)]">
            Interstate 75 W
          </p>
          <span
            data-testid="picographics-runtime-status"
            role="status"
            className={`rounded-full border px-3 py-1 text-[0.7rem] uppercase tracking-[0.18em] ${
              failed
                ? 'border-[#ffb18c] text-[#ffd7a0]'
                : ready
                  ? 'border-[#84d8ff] text-[#b9edff]'
                  : 'border-[var(--panel-border)] text-[var(--muted-text)]'
            }`}
          >
            {statusText}
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
