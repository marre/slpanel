import { type PicographicsCanvas } from '@/lib/picographics-canvas';
import { type PicographicsBoardController } from '@/lib/picographics-board-controller';
import type { MaybePromise } from '@/lib/picographics-board-controller';

export interface PicographicsRuntimeSession {
  graphics: PicographicsCanvas;
  controller: PicographicsBoardController;
  dispose?: () => MaybePromise<unknown>;
}

export interface PicographicsRuntime {
  id: string;
  label: string;
  initialize: (
    context: CanvasRenderingContext2D,
  ) => Promise<PicographicsRuntimeSession> | PicographicsRuntimeSession;
}
