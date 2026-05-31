import { useEffect, useRef } from 'react';

import type { DepartureRecord } from '@/api/types';
import {
  measureText,
  renderText,
  renderTextLine,
} from '@/font/sl-font-renderer';

const PANEL_WIDTH = 128;
const PANEL_HEIGHT = 32;
const ROW_ONE_Y = 3;
const ROW_TWO_Y = 19;
const MARQUEE_SPEED = 18;
const FONT_OPTIONS = { scale: 1, gap: 1 } as const;

type BoardTone = 'live' | 'loading' | 'empty' | 'error';

interface DisplayBoardProps {
  displayName: string;
  siteName: string | null;
  departures: DepartureRecord[];
  tone: BoardTone;
  headline: string;
  detail: string;
}

interface MarqueeContent {
  text: string;
  interruptible: boolean;
}

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
        measureText(marqueeState.activeContent.text, FONT_OPTIONS),
        1,
      );

      if (marqueeState.lastTimestamp === 0 || resetThisFrame) {
        marqueeState.lastTimestamp = timestamp;
      } else {
        const delta = timestamp - marqueeState.lastTimestamp;
        marqueeState.lastTimestamp = timestamp;
        marqueeState.marqueeOffset -= (delta / 1000) * MARQUEE_SPEED;
      }

      if (marqueeState.marqueeOffset <= -marqueeWidth) {
        marqueeState.marqueeOffset = PANEL_WIDTH;
        marqueeState.activeContent = marqueeState.pendingContent;
      }

      drawBoard(context, {
        departures: frameInput.departures,
        displayName: frameInput.displayName,
        headline: frameInput.headline,
        detail: frameInput.detail,
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
      displayName: frameInput.displayName,
      headline: frameInput.headline,
      detail: frameInput.detail,
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
    <div className="inline-flex w-full max-w-[68rem] rounded-[2.4rem] border border-[var(--panel-border)] bg-[linear-gradient(180deg,rgba(18,24,28,0.96),rgba(6,9,12,0.98))] p-4 shadow-[inset_0_0_0_1px_rgba(255,188,85,0.08),0_28px_80px_rgba(0,0,0,0.52)] md:p-5">
      <div className="w-full rounded-[1.55rem] border border-black/70 bg-[radial-gradient(circle_at_top,rgba(255,176,84,0.06),transparent_40%),#000] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)] md:p-4">
        <canvas
          ref={canvasRef}
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          role="img"
          aria-label={`SL departure board for ${displayName}`}
          aria-describedby={`display-board-summary-${slugify(displayName)}`}
          className="h-auto w-full rounded-[0.6rem] bg-black [image-rendering:pixelated]"
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
    displayName: string;
    headline: string;
    detail: string;
    tone: BoardTone;
    marqueeText: string;
    marqueeOffset: number;
  },
) {
  context.fillStyle = '#020202';
  context.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

  const colors = getToneColors(input.tone);

  if (input.tone === 'live' && input.departures.length > 0) {
    drawLeadDeparture(context, input.departures[0], colors.primary);
  } else {
    renderTextLine(context, input.headline, 2, ROW_ONE_Y, PANEL_WIDTH - 4, {
      ...FONT_OPTIONS,
      color: colors.primary,
    });
  }

  renderText(
    context,
    input.marqueeText,
    Math.round(input.marqueeOffset),
    ROW_TWO_Y,
    {
      ...FONT_OPTIONS,
      color: colors.secondary,
    },
  );
}

function drawLeadDeparture(
  context: CanvasRenderingContext2D,
  departure: DepartureRecord,
  color: string,
) {
  const lineNumber = departure.line_number || '--';
  const destination = departure.destination || 'Unknown';
  const displayTime = departure.display_time || 'Now';
  const lineWidth = measureText(lineNumber, FONT_OPTIONS);
  const timeWidth = measureText(displayTime, FONT_OPTIONS);
  const timeX = PANEL_WIDTH - timeWidth - 2;
  const destinationX = lineWidth + 5;
  const destinationWidth = Math.max(0, timeX - destinationX - 2);

  renderText(context, lineNumber, 2, ROW_ONE_Y, {
    ...FONT_OPTIONS,
    color,
  });

  renderTextLine(
    context,
    destination,
    destinationX,
    ROW_ONE_Y,
    destinationWidth,
    {
      ...FONT_OPTIONS,
      color,
    },
  );

  renderText(context, displayTime, timeX, ROW_ONE_Y, {
    ...FONT_OPTIONS,
    color,
  });
}

function buildMarqueeContent(input: {
  departures: DepartureRecord[];
  tone: BoardTone;
  headline: string;
  detail: string;
}): MarqueeContent {
  if (input.tone === 'live' && input.departures.length > 0) {
    const followingDepartures = input.departures
      .slice(1, 4)
      .map((departure) => formatCompactDeparture(departure));

    return {
      text: followingDepartures.join('     ') || 'No later departures',
      interruptible: false,
    };
  }

  return {
    text: [input.headline ?? '', input.detail].filter(Boolean).join('     '),
    interruptible: true,
  };
}

function shouldSwapMarqueeImmediately(
  activeContent: MarqueeContent,
  pendingContent: MarqueeContent,
) {
  return (
    activeContent.interruptible && activeContent.text !== pendingContent.text
  );
}

function buildAccessibleSummary(input: {
  departures: DepartureRecord[];
  headline: string;
  detail: string;
  tone: BoardTone;
  siteName: string | null;
}) {
  if (input.tone === 'live' && input.departures.length > 0) {
    const nextDeparture = input.departures[0];

    return [
      input.siteName ? `Stop ${input.siteName}.` : '',
      `Next departure: line ${nextDeparture.line_number} to ${nextDeparture.destination}, ${nextDeparture.display_time}.`,
      input.departures.length > 1
        ? `Later departures include ${input.departures
            .slice(1, 4)
            .map(
              (departure) =>
                `line ${departure.line_number} to ${departure.destination} in ${departure.display_time}`,
            )
            .join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [input.headline, input.detail].filter(Boolean).join(' ');
}

function formatCompactDeparture(departure: DepartureRecord) {
  return `${departure.line_number} ${departure.destination} ${departure.display_time}`.trim();
}

function getToneColors(tone: BoardTone) {
  switch (tone) {
    case 'error':
      return {
        primary: '#ffd7a0',
        secondary: '#ffbf6b',
      };
    case 'loading':
      return {
        primary: '#ffbe64',
        secondary: '#ff9b29',
      };
    case 'empty':
      return {
        primary: '#ffc978',
        secondary: '#ffae43',
      };
    default:
      return {
        primary: '#ffb347',
        secondary: '#ff9625',
      };
  }
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function buildBoardKey(displayName: string, siteName: string | null) {
  return `${displayName}::${siteName ?? ''}`;
}
