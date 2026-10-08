import { shallowRef, watch, onMounted, onBeforeUnmount } from 'vue';
import type { DepartureRecord } from '@/api/types';
import {
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
} from '@/components/display-board-shared';
import {
  measureText,
  renderText,
  renderTextLine,
} from '@/font/sl-font-renderer';
export function useDisplayCanvas(props: DisplayBoardProps) {
  const canvasRef = shallowRef<HTMLCanvasElement | null>(null);
  const initialContent = buildMarqueeContent(props);
  // Animation state belongs to the renderer, and does not drive the DOM.
  let marquee = {
    activeContent: initialContent,
    pendingContent: initialContent,
    marqueeOffset: PANEL_WIDTH,
    lastTimestamp: 0,
    boardKey: buildBoardKey(props.displayName, props.siteName),
  };
  let context: CanvasRenderingContext2D | null = null;
  let animationFrameId = 0;
  let reducedMotion = false;
  function drawStillFrame() {
    if (!context) return;
    const content = buildMarqueeContent(props);
    drawBoard(context, {
      departures: props.departures,
      headline: props.headline,
      tone: props.tone,
      marqueeText: content.text,
      marqueeOffset: layoutCenterOffset(content.text),
    });
  }
  watch(
    () => [
      props.departures,
      props.detail,
      props.displayName,
      props.headline,
      props.siteName,
      props.tone,
    ],
    () => {
      const content = buildMarqueeContent(props);
      const boardKey = buildBoardKey(props.displayName, props.siteName);
      marquee.pendingContent = content;
      if (marquee.boardKey !== boardKey) {
        marquee = {
          activeContent: content,
          pendingContent: content,
          marqueeOffset: PANEL_WIDTH,
          lastTimestamp: 0,
          boardKey,
        };
      }
      if (reducedMotion) drawStillFrame();
    },
    { flush: 'post' },
  );
  function renderFrame(timestamp: number) {
    if (!context) return;
    const layout = createBoardGeometry(DIODE_SCALE);
    marquee.pendingContent = buildMarqueeContent(props);
    if (!marquee.activeContent.text)
      marquee.activeContent = marquee.pendingContent;
    let resetThisFrame = false;
    if (
      shouldSwapMarqueeImmediately(
        marquee.activeContent,
        marquee.pendingContent,
      )
    ) {
      marquee.activeContent = marquee.pendingContent;
      marquee.marqueeOffset = PANEL_WIDTH;
      marquee.lastTimestamp = timestamp;
      resetThisFrame = true;
    }
    const marqueeWidth = Math.max(
      measureText(marquee.activeContent.text, CLASSIC_BOARD_FONT_OPTIONS),
      1,
    );
    if (marquee.lastTimestamp === 0 || resetThisFrame)
      marquee.lastTimestamp = timestamp;
    else {
      const delta = timestamp - marquee.lastTimestamp;
      marquee.lastTimestamp = timestamp;
      marquee.marqueeOffset -= (delta / 1000) * layout.marqueeSpeed;
    }
    if (marquee.marqueeOffset <= -marqueeWidth) {
      marquee.marqueeOffset = PANEL_WIDTH;
      marquee.activeContent = marquee.pendingContent;
    }
    drawBoard(context, {
      departures: props.departures,
      headline: props.headline,
      tone: props.tone,
      marqueeText: marquee.activeContent.text,
      marqueeOffset: marquee.marqueeOffset,
    });
    animationFrameId = requestAnimationFrame(renderFrame);
  }
  onMounted(() => {
    context = canvasRef.value?.getContext('2d') ?? null;
    if (!context) return;
    reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) drawStillFrame();
    else {
      drawBoard(context, {
        departures: props.departures,
        headline: props.headline,
        tone: props.tone,
        marqueeText: marquee.activeContent.text,
        marqueeOffset: marquee.marqueeOffset,
      });
      animationFrameId = requestAnimationFrame(renderFrame);
    }
  });
  onBeforeUnmount(() => {
    cancelAnimationFrame(animationFrameId);
    context = null;
  });
  return { canvasRef };
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
function layoutCenterOffset(text: string) {
  const textWidth = Math.max(measureText(text, CLASSIC_BOARD_FONT_OPTIONS), 1);
  if (textWidth >= PANEL_WIDTH) {
    return 0;
  }
  return Math.round((PANEL_WIDTH - textWidth) / 2);
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
