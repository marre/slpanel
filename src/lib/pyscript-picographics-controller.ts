import {
  type PicographicsBoardController,
  type PicographicsBoardFrameInput,
  type PicographicsBoardMarqueeState,
} from '@/lib/picographics-board-controller';
import type { MarqueeContent } from '@/components/display-board-shared';
import type { PicographicsCanvas } from '@/lib/picographics-canvas';
import { logPicographicsInfo } from '@/lib/picographics-debug';

type DrawCommand =
  | ['set_pen', string]
  | ['clear']
  | ['pixel', number, number]
  | ['rectangle', number, number, number, number]
  | ['text', string, number, number]
  | ['text', string, number, number, number]
  | ['update'];

export interface PyScriptPicographicsBridge {
  createMarqueeStateJson: (frameInputJson: string) => string;
  advanceAndDrawFrameJson: (
    frameInputJson: string,
    marqueeStateJson: string,
    deltaSeconds: number,
    measurementsJson: string,
  ) => string | Promise<string>;
  advanceMarqueeStateJson: (
    frameInputJson: string,
    marqueeStateJson: string,
    deltaSeconds: number,
    measurementsJson: string,
  ) => string | Promise<string>;
  drawBoardCommandsJson: (
    frameInputJson: string,
    marqueeStateJson: string,
    measurementsJson: string,
  ) => string | Promise<string>;
}

interface PythonMarqueeState {
  active_content?: PythonMarqueeContent;
  pending_content?: PythonMarqueeContent;
  marquee_offset?: number;
}

interface PythonMarqueeContent {
  text?: string;
  interruptible?: boolean;
}

interface PythonRenderedFrame {
  marquee_state?: PythonMarqueeState;
  commands?: DrawCommand[];
}

interface CachedRenderedFrame {
  frameInput: PicographicsBoardFrameInput;
  marqueeState: PicographicsBoardMarqueeState;
  commands: DrawCommand[];
}

export function createPyScriptPicographicsController(
  bridge: PyScriptPicographicsBridge,
): PicographicsBoardController {
  let cachedRenderedFrame: CachedRenderedFrame | null = null;

  return {
    createMarqueeState(frameInput) {
      cachedRenderedFrame = null;
      logController('createMarqueeState:request', {
        tone: frameInput.tone,
        headline: summarizeText(frameInput.headline),
        detail: summarizeText(frameInput.detail),
      });

      const nextState = normalizeMarqueeState(
        JSON.parse(
          bridge.createMarqueeStateJson(JSON.stringify(frameInput)),
        ) as PythonMarqueeState,
      );

      logController('createMarqueeState:response', {
        activeText: summarizeText(nextState.activeContent.text),
        marqueeOffset: nextState.marqueeOffset,
      });

      return nextState;
    },

    async advanceMarqueeState(graphics, marqueeState, frameInput, deltaSeconds) {
      const measurements = collectMeasurements(graphics, frameInput, marqueeState);
      const frameInputJson = JSON.stringify(frameInput);
      const marqueeStateJson = JSON.stringify(serializeMarqueeState(marqueeState));
      logController('advanceMarqueeState:request', {
        deltaSeconds,
        activeText: summarizeText(marqueeState.activeContent.text),
        marqueeOffset: marqueeState.marqueeOffset,
        measurements,
      });
      const response = await bridge.advanceAndDrawFrameJson(
        frameInputJson,
        marqueeStateJson,
        deltaSeconds,
        JSON.stringify(measurements),
      );

      const renderedFrame = JSON.parse(String(response)) as PythonRenderedFrame;

      const nextState = normalizeMarqueeState(
        renderedFrame.marquee_state,
      );

      cachedRenderedFrame = {
        frameInput,
        marqueeState: nextState,
        commands: renderedFrame.commands ?? [],
      };

      logController('advanceMarqueeState:response', {
        activeText: summarizeText(nextState.activeContent.text),
        pendingText: summarizeText(nextState.pendingContent.text),
        marqueeOffset: nextState.marqueeOffset,
      });

      return nextState;
    },

    async drawBoard(graphics, frameInput, marqueeState) {
      const cachedCommands = getCachedCommands(frameInput, marqueeState);

      if (cachedCommands) {
        logController('drawBoard:cached-response', {
          tone: frameInput.tone,
          activeText: summarizeText(marqueeState.activeContent.text),
          marqueeOffset: marqueeState.marqueeOffset,
          commandCount: cachedCommands.length,
        });
        replayDrawCommands(graphics, cachedCommands);
        return;
      }

      const measurements = collectMeasurements(graphics, frameInput, marqueeState);
      logController('drawBoard:request', {
        tone: frameInput.tone,
        activeText: summarizeText(marqueeState.activeContent.text),
        marqueeOffset: marqueeState.marqueeOffset,
      });
      const response = await bridge.drawBoardCommandsJson(
        JSON.stringify(frameInput),
        JSON.stringify(serializeMarqueeState(marqueeState)),
        JSON.stringify(measurements),
      );
      const commands = JSON.parse(String(response)) as DrawCommand[];

      logController('drawBoard:response', {
        commandCount: commands.length,
        commandPreview: commands.slice(0, 5),
      });

      replayDrawCommands(graphics, commands);
    },
  };

  function getCachedCommands(
    frameInput: PicographicsBoardFrameInput,
    marqueeState: PicographicsBoardMarqueeState,
  ) {
    if (
      cachedRenderedFrame?.frameInput !== frameInput ||
      cachedRenderedFrame.marqueeState !== marqueeState
    ) {
      cachedRenderedFrame = null;
      return null;
    }

    const commands = cachedRenderedFrame.commands;

    cachedRenderedFrame = null;

    return commands;
  }
}

function logController(event: string, payload: Record<string, unknown>) {
  logPicographicsInfo('[slpanel/pyscript-controller]', event, payload);
}

function summarizeText(value: string, maxLength = 60) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function collectMeasurements(
  graphics: PicographicsCanvas,
  frameInput: PicographicsBoardFrameInput,
  marqueeState: PicographicsBoardMarqueeState,
) {
  const measurements: Record<string, number> = {};
  const activeMarqueeText = marqueeState.activeContent.text;

  if (activeMarqueeText) {
    measurements[activeMarqueeText] = graphics.measure_text(activeMarqueeText);
  }

  if (frameInput.tone === 'live' && frameInput.departures.length > 0) {
    const leadDeparture = frameInput.departures[0];
    const lineNumber = leadDeparture.line_number || '--';
    const displayTime = leadDeparture.display_time || 'Now';

    measurements[lineNumber] = graphics.measure_text(lineNumber);
    measurements[displayTime] = graphics.measure_text(displayTime);
  }

  return measurements;
}

function replayDrawCommands(
  graphics: PicographicsCanvas,
  commands: DrawCommand[],
) {
  for (const command of commands) {
    const [operation, ...args] = command;

    switch (operation) {
      case 'set_pen':
        graphics.set_pen(args[0] as string);
        break;
      case 'clear':
        graphics.clear();
        break;
      case 'pixel':
        graphics.pixel(args[0] as number, args[1] as number);
        break;
      case 'rectangle':
        graphics.rectangle(
          args[0] as number,
          args[1] as number,
          args[2] as number,
          args[3] as number,
        );
        break;
      case 'text':
        graphics.text(
          args[0] as string,
          args[1] as number,
          args[2] as number,
          args[3] as number | undefined,
        );
        break;
      case 'update':
        graphics.update();
        break;
    }
  }
}

function serializeMarqueeState(
  marqueeState: PicographicsBoardMarqueeState,
): PythonMarqueeState {
  return {
    active_content: serializeMarqueeContent(marqueeState.activeContent),
    pending_content: serializeMarqueeContent(marqueeState.pendingContent),
    marquee_offset: marqueeState.marqueeOffset,
  };
}

function serializeMarqueeContent(content: MarqueeContent): PythonMarqueeContent {
  return {
    text: content.text,
    interruptible: content.interruptible,
  };
}

function normalizeMarqueeState(
  pythonState: PythonMarqueeState | undefined,
): PicographicsBoardMarqueeState {
  return {
    activeContent: normalizeMarqueeContent(pythonState?.active_content),
    pendingContent: normalizeMarqueeContent(pythonState?.pending_content),
    marqueeOffset: pythonState?.marquee_offset ?? 128,
  };
}

function normalizeMarqueeContent(
  content: PythonMarqueeContent | undefined,
): MarqueeContent {
  return {
    text: content?.text ?? '',
    interruptible: content?.interruptible ?? true,
  };
}
