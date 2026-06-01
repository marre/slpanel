import type { DepartureRecord } from '@/api/types';
import {
  buildMarqueeContent,
  createBoardGeometry,
  type DisplayBoardProps,
  getToneColors,
  LOGICAL_PANEL_WIDTH,
  type MarqueeContent,
} from '@/components/display-board-shared';
import type { PicographicsCanvas } from '@/lib/picographics-canvas';

export type MaybePromise<T> = T | Promise<T>;

export interface PicographicsBoardMarqueeState {
  activeContent: MarqueeContent;
  pendingContent: MarqueeContent;
  marqueeOffset: number;
}

export type PicographicsBoardFrameInput = Pick<
  DisplayBoardProps,
  'departures' | 'tone' | 'headline' | 'detail'
>;

export interface PicographicsBoardController {
  createMarqueeState: (
    frameInput: PicographicsBoardFrameInput,
  ) => PicographicsBoardMarqueeState;
  advanceMarqueeState: (
    graphics: PicographicsCanvas,
    marqueeState: PicographicsBoardMarqueeState,
    frameInput: PicographicsBoardFrameInput,
    deltaSeconds: number,
  ) => MaybePromise<PicographicsBoardMarqueeState>;
  drawBoard: (
    graphics: PicographicsCanvas,
    frameInput: PicographicsBoardFrameInput,
    marqueeState: PicographicsBoardMarqueeState,
  ) => MaybePromise<void>;
}

export const localPicographicsBoardController: PicographicsBoardController = {
  createMarqueeState(frameInput) {
    const content = buildMarqueeContent(frameInput);

    return {
      activeContent: content,
      pendingContent: content,
      marqueeOffset: LOGICAL_PANEL_WIDTH,
    };
  },

  advanceMarqueeState(graphics, marqueeState, frameInput, deltaSeconds) {
    const pendingContent = buildMarqueeContent(frameInput);
    let activeContent = marqueeState.activeContent.text
      ? marqueeState.activeContent
      : pendingContent;
    let marqueeOffset = marqueeState.marqueeOffset;

    if (
      activeContent.interruptible &&
      activeContent.text !== pendingContent.text
    ) {
      activeContent = pendingContent;
      marqueeOffset = LOGICAL_PANEL_WIDTH;
    }

    const marqueeWidth = Math.max(graphics.measure_text(activeContent.text), 1);
    marqueeOffset -= deltaSeconds * createBoardGeometry().marqueeSpeed;

    if (marqueeOffset <= -marqueeWidth) {
      marqueeOffset = LOGICAL_PANEL_WIDTH;
      activeContent = pendingContent;
    }

    return {
      activeContent,
      pendingContent,
      marqueeOffset,
    };
  },

  drawBoard(graphics, frameInput, marqueeState) {
    const colors = getToneColors(frameInput.tone);
    const layout = createBoardGeometry();
    const [rowOneY, rowTwoY] = layout.rowYs;

    graphics.set_pen('#020202');
    graphics.clear();

    if (frameInput.tone === 'live' && frameInput.departures.length > 0) {
      drawLeadDeparture(
        graphics,
        frameInput.departures[0],
        colors.primary,
        layout,
        rowOneY,
      );
    } else {
      graphics.set_pen(colors.primary);
      graphics.text(
        frameInput.headline,
        layout.panelPadding,
        rowOneY,
        LOGICAL_PANEL_WIDTH - layout.panelPadding * 2,
      );
    }

    graphics.set_pen(colors.primary);
    graphics.text(
      marqueeState.activeContent.text,
      Math.round(marqueeState.marqueeOffset),
      rowTwoY,
    );
    graphics.update();
  },
};

function drawLeadDeparture(
  graphics: PicographicsCanvas,
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
  const lineWidth = graphics.measure_text(lineNumber);
  const timeWidth = graphics.measure_text(displayTime);
  const timeX = LOGICAL_PANEL_WIDTH - timeWidth - layout.panelPadding;
  const destinationX = lineWidth + layout.leadDepartureGap;
  const destinationWidth = Math.max(
    0,
    timeX - destinationX - layout.panelPadding,
  );

  graphics.set_pen(color);
  graphics.text(lineNumber, layout.panelPadding, rowY);
  graphics.text(destination, destinationX, rowY, destinationWidth);
  graphics.text(displayTime, timeX, rowY);
}
