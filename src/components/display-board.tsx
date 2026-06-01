import { useEffect, useRef } from 'react';

import type { DepartureRecord } from '@/api/types';
import {
  buildAccessibleSummary,
  buildBoardKey,
  buildMarqueeContent,
  CLASSIC_BOARD_FONT_OPTIONS,
  createBoardGeometry,
  DIODE_SCALE,
  type DisplayBoardProps,
  getToneColors,
  PANEL_HEIGHT,
  PANEL_WIDTH,
  shouldSwapMarqueeImmediately,
  slugify,
} from '@/components/display-board-shared';
import {
  measureText,
  renderText,
  renderTextLine,
} from '@/font/sl-font-renderer';

export function DisplayBoard({
  displayName,
  siteName,
  departures,
  tone,
  headline,
  detail,
}: DisplayBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameInputRef = useRef<DisplayBoardProps>({
    displayName,
    siteName,
    departures,
    tone,
    headline,
    detail,
  });
  const initialMarqueeContent = buildMarqueeContent({
    departures,
    tone,
    headline,
    detail,
  });
  const marqueeStateRef = useRef({
    activeContent: initialMarqueeContent,
    pendingContent: initialMarqueeContent,
    marqueeOffset: PANEL_WIDTH,
    lastTimestamp: 0,
    boardKey: buildBoardKey(displayName, siteName),
  });

  useEffect(() => {
    const nextFrameInput = {
      displayName,
      siteName,
      departures,
      tone,
      headline,
      detail,
    };
    const nextMarqueeContent = buildMarqueeContent(nextFrameInput);
    const nextBoardKey = buildBoardKey(displayName, siteName);

    frameInputRef.current = nextFrameInput;
    marqueeStateRef.current.pendingContent = nextMarqueeContent;

    if (marqueeStateRef.current.boardKey !== nextBoardKey) {
      marqueeStateRef.current = {
        activeContent: nextMarqueeContent,
        pendingContent: nextMarqueeContent,
        marqueeOffset: PANEL_WIDTH,
        lastTimestamp: 0,
        boardKey: nextBoardKey,
      };
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

    const renderFrame = (timestamp: number) => {
      const frameInput = frameInputRef.current;
      const marqueeState = marqueeStateRef.current;
      const layout = createBoardGeometry(DIODE_SCALE);

      marqueeState.pendingContent = buildMarqueeContent(frameInput);

      if (!marqueeState.activeContent.text) {
        marqueeState.activeContent = marqueeState.pendingContent;
      }

      let resetThisFrame = false;

      if (
        shouldSwapMarqueeImmediately(
          marqueeState.activeContent,
          marqueeState.pendingContent,
        )
      ) {
        marqueeState.activeContent = marqueeState.pendingContent;
        marqueeState.marqueeOffset = PANEL_WIDTH;
        marqueeState.lastTimestamp = timestamp;
        resetThisFrame = true;
      }

      const marqueeWidth = Math.max(
        measureText(
          marqueeState.activeContent.text,
          CLASSIC_BOARD_FONT_OPTIONS,
        ),
        1,
      );

      if (marqueeState.lastTimestamp === 0 || resetThisFrame) {
        marqueeState.lastTimestamp = timestamp;
      } else {
        const delta = timestamp - marqueeState.lastTimestamp;
        marqueeState.lastTimestamp = timestamp;
        marqueeState.marqueeOffset -= (delta / 1000) * layout.marqueeSpeed;
      }

      if (marqueeState.marqueeOffset <= -marqueeWidth) {
        marqueeState.marqueeOffset = PANEL_WIDTH;
        marqueeState.activeContent = marqueeState.pendingContent;
      }

      drawBoard(context, {
        departures: frameInput.departures,
        headline: frameInput.headline,
        tone: frameInput.tone,
        marqueeText: marqueeState.activeContent.text,
        marqueeOffset: marqueeState.marqueeOffset,
      });

      animationFrameId = requestAnimationFrame(renderFrame);
    };

    const frameInput = frameInputRef.current;
    const marqueeState = marqueeStateRef.current;

    drawBoard(context, {
      departures: frameInput.departures,
      headline: frameInput.headline,
      tone: frameInput.tone,
      marqueeText: marqueeState.activeContent.text,
      marqueeOffset: marqueeState.marqueeOffset,
    });

    animationFrameId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const accessibleSummary = buildAccessibleSummary({
    departures,
    headline,
    detail,
    tone,
    siteName,
  });

  return (
    <div
      data-testid="classic-display-board"
      className="inline-flex w-full max-w-[68rem] rounded-[2.4rem] border border-[var(--panel-border)] bg-[linear-gradient(180deg,rgba(18,24,28,0.96),rgba(6,9,12,0.98))] p-4 shadow-[inset_0_0_0_1px_rgba(255,188,85,0.08),0_28px_80px_rgba(0,0,0,0.52)] md:p-5"
    >
      <div className="w-full rounded-[1.55rem] border border-black/70 bg-[radial-gradient(circle_at_top,rgba(255,176,84,0.06),transparent_40%),#000] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] md:p-4">
        <canvas
          ref={canvasRef}
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          role="img"
          aria-label={`SL departure board for ${displayName}`}
          aria-describedby={`display-board-summary-${slugify(displayName)}`}
          className="h-auto w-full rounded-[0.6rem] bg-black"
        />
        <p
          id={`display-board-summary-${slugify(displayName)}`}
          className="sr-only"
        >
          {accessibleSummary}
        </p>
      </div>
    </div>
  );
}

function drawBoard(
  context: CanvasRenderingContext2D,
  input: {
    departures: DepartureRecord[];
    headline: string;
    tone: DisplayBoardProps['tone'];
    marqueeText: string;
    marqueeOffset: number;
  },
) {
  const colors = getToneColors(input.tone);
  const layout = createBoardGeometry(DIODE_SCALE);
  const [rowOneY, rowTwoY] = layout.rowYs;

  context.fillStyle = '#020202';
  context.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

  if (input.tone === 'live' && input.departures.length > 0) {
    drawLeadDeparture(
      context,
      input.departures[0],
      colors.primary,
      layout,
      rowOneY,
    );
  } else {
    renderTextLine(
      context,
      input.headline,
      layout.panelPadding,
      rowOneY,
      PANEL_WIDTH - layout.panelPadding * 2,
      {
        ...CLASSIC_BOARD_FONT_OPTIONS,
        color: colors.primary,
      },
    );
  }

  renderText(
    context,
    input.marqueeText,
    Math.round(input.marqueeOffset),
    rowTwoY,
    {
      ...CLASSIC_BOARD_FONT_OPTIONS,
      color: colors.primary,
    },
  );
}

function drawLeadDeparture(
  context: CanvasRenderingContext2D,
  departure: DepartureRecord,
  color: string,
  layout: Pick<
    ReturnType<typeof createBoardGeometry>,
    'panelPadding' | 'leadDepartureGap'
  >,
  rowY: number,
) {
  const lineNumber = departure.line_number || '--';
  const destination = departure.destination || 'Unknown';
  const displayTime = departure.display_time || 'Now';
  const lineWidth = measureText(lineNumber, CLASSIC_BOARD_FONT_OPTIONS);
  const timeWidth = measureText(displayTime, CLASSIC_BOARD_FONT_OPTIONS);
  const timeX = PANEL_WIDTH - timeWidth - layout.panelPadding;
  const destinationX = lineWidth + layout.leadDepartureGap;
  const destinationWidth = Math.max(
    0,
    timeX - destinationX - layout.panelPadding,
  );

  renderText(context, lineNumber, layout.panelPadding, rowY, {
    ...CLASSIC_BOARD_FONT_OPTIONS,
    color,
  });

  renderTextLine(context, destination, destinationX, rowY, destinationWidth, {
    ...CLASSIC_BOARD_FONT_OPTIONS,
    color,
  });

  renderText(context, displayTime, timeX, rowY, {
    ...CLASSIC_BOARD_FONT_OPTIONS,
    color,
  });
}
