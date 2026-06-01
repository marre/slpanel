import { type DisplayBoardProps } from '@/components/display-board-shared';
import type { PicographicsCanvas } from '@/lib/picographics-canvas';

export type MaybePromise<T> = T | Promise<T>;

export type PicographicsBoardFrameInput = Pick<
  DisplayBoardProps,
  'departures' | 'tone' | 'headline' | 'detail'
>;

export interface PicographicsBoardController {
  drawFrame: (
    graphics: PicographicsCanvas,
    frameInput: PicographicsBoardFrameInput,
  ) => MaybePromise<void>;
  advanceFrame: (
    graphics: PicographicsCanvas,
    frameInput: PicographicsBoardFrameInput,
    deltaSeconds: number,
  ) => MaybePromise<void>;
}
