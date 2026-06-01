import {
  type PicographicsBoardController,
  type PicographicsBoardFrameInput,
  type PicographicsBoardMarqueeState,
} from '@/lib/picographics-board-controller';
import { type MarqueeContent } from '@/components/display-board-shared';
import type { PicographicsCanvas } from '@/lib/picographics-canvas';
import { logPicographicsInfo } from '@/lib/picographics-debug';
import {
  recordPicographicsCount,
  startPicographicsProfile,
} from '@/lib/picographics-profiler';

type DrawCommand =
  | ['set_pen', string | number]
  | ['clear']
  | ['pixel', number, number]
  | ['rectangle', number, number, number, number]
  | ['text', string, number, number]
  | ['text', string, number, number, number]
  | ['update'];

export interface PyScriptPicographicsBridge {
  createMarqueeStateJson: (frameInputJson: string) => string;
  setFrameInputJson?: (frameInputJson: string) => void | Promise<void>;
  setMeasurementsJson?: (measurementsJson: string) => void | Promise<void>;
  advanceAndDrawCurrentFrameJson?: (
    deltaSeconds: number,
  ) => string | Promise<string>;
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
  let cachedFrameInputJson: string | null = null;
  let cachedMeasurementsJson: string | null = null;

  return {
    createMarqueeState(frameInput) {
      cachedRenderedFrame = null;
      cachedMeasurementsJson = null;
      cachedFrameInputJson = JSON.stringify(frameInput);
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

    async advanceMarqueeState(
      graphics,
      marqueeState,
      frameInput,
      deltaSeconds,
    ) {
      const stopAdvanceProfile = startPicographicsProfile(
        'controller.advance.total',
      );

      try {
        const stopMeasurementProfile = startPicographicsProfile(
          'controller.measurements',
        );
        const measurements = collectMeasurements(
          graphics,
          frameInput,
          marqueeState,
        );
        stopMeasurementProfile();
        const frameInputJson = syncFrameInput(frameInput);
        const measurementsJson = syncMeasurements(measurements);
        const marqueeStateJson = JSON.stringify(
          serializeMarqueeState(marqueeState),
        );
        logController('advanceMarqueeState:request', {
          deltaSeconds,
          activeText: summarizeText(marqueeState.activeContent.text),
          marqueeOffset: marqueeState.marqueeOffset,
          measurements,
        });
        const response = bridge.advanceAndDrawCurrentFrameJson
          ? await bridge.advanceAndDrawCurrentFrameJson(deltaSeconds)
          : await bridge.advanceAndDrawFrameJson(
              frameInputJson,
              marqueeStateJson,
              deltaSeconds,
              measurementsJson,
            );
        const stopParseProfile = startPicographicsProfile(
          'controller.parseFrame',
        );
        const renderedFrame = toCachedRenderedFrame(
          frameInput,
          JSON.parse(String(response)) as PythonRenderedFrame,
        );
        stopParseProfile();

        const nextState = consumeRenderedFrame(renderedFrame);

        logController('advanceMarqueeState:response', {
          activeText: summarizeText(nextState.activeContent.text),
          pendingText: summarizeText(nextState.pendingContent.text),
          marqueeOffset: nextState.marqueeOffset,
        });

        return nextState;
      } finally {
        stopAdvanceProfile();
      }
    },

    async drawBoard(graphics, frameInput, marqueeState) {
      const stopDrawProfile = startPicographicsProfile('controller.draw.total');
      const cachedCommands = getCachedCommands(frameInput, marqueeState);

      if (cachedCommands) {
        recordPicographicsCount('controller.draw.cached');
        logController('drawBoard:cached-response', {
          tone: frameInput.tone,
          activeText: summarizeText(marqueeState.activeContent.text),
          marqueeOffset: marqueeState.marqueeOffset,
          commandCount: cachedCommands.length,
        });
        replayDrawCommands(graphics, cachedCommands);
        stopDrawProfile();
        return;
      }

      try {
        const stopMeasurementProfile = startPicographicsProfile(
          'controller.measurements',
        );
        const measurements = collectMeasurements(
          graphics,
          frameInput,
          marqueeState,
        );
        stopMeasurementProfile();
        const frameInputJson = syncFrameInput(frameInput);
        const measurementsJson = syncMeasurements(measurements);
        logController('drawBoard:request', {
          tone: frameInput.tone,
          activeText: summarizeText(marqueeState.activeContent.text),
          marqueeOffset: marqueeState.marqueeOffset,
        });
        const response = await bridge.drawBoardCommandsJson(
          frameInputJson,
          JSON.stringify(serializeMarqueeState(marqueeState)),
          measurementsJson,
        );
        const stopParseProfile = startPicographicsProfile(
          'controller.parseCommands',
        );
        const commands = JSON.parse(String(response)) as DrawCommand[];
        stopParseProfile();

        logController('drawBoard:response', {
          commandCount: commands.length,
          commandPreview: commands.slice(0, 5),
        });

        replayDrawCommands(graphics, commands);
      } finally {
        stopDrawProfile();
      }
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

  function syncFrameInput(frameInput: PicographicsBoardFrameInput) {
    const frameInputJson = JSON.stringify(frameInput);

    if (frameInputJson !== cachedFrameInputJson) {
      cachedFrameInputJson = frameInputJson;
      bridge.setFrameInputJson?.(frameInputJson);
    }

    return frameInputJson;
  }

  function syncMeasurements(measurements: Record<string, number>) {
    const measurementsJson = JSON.stringify(measurements);

    if (measurementsJson !== cachedMeasurementsJson) {
      cachedMeasurementsJson = measurementsJson;
      bridge.setMeasurementsJson?.(measurementsJson);
    }

    return measurementsJson;
  }

  function consumeRenderedFrame(renderedFrame: CachedRenderedFrame) {
    cachedRenderedFrame = renderedFrame;
    recordPicographicsCount(
      'controller.commands.prepared',
      cachedRenderedFrame.commands.length,
    );

    return cachedRenderedFrame.marqueeState;
  }

  function toCachedRenderedFrame(
    frameInput: PicographicsBoardFrameInput,
    renderedFrame: PythonRenderedFrame,
  ): CachedRenderedFrame {
    return {
      frameInput,
      marqueeState: normalizeMarqueeState(renderedFrame.marquee_state),
      commands: renderedFrame.commands ?? [],
    };
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
  const stopReplayProfile = startPicographicsProfile('controller.replay');
  recordPicographicsCount('controller.commands.replayed', commands.length);

  for (const command of commands) {
    const [operation, ...args] = command;

    switch (operation) {
      case 'set_pen':
        graphics.set_pen(args[0] as string | number);
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

  stopReplayProfile();
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

function serializeMarqueeContent(
  content: MarqueeContent,
): PythonMarqueeContent {
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
