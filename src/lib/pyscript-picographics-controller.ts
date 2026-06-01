import {
  type PicographicsBoardController,
  type PicographicsBoardFrameInput,
} from '@/lib/picographics-board-controller';
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
  setFrameInputJson?: (frameInputJson: string) => void | Promise<void>;
  setMeasurementsJson?: (measurementsJson: string) => void | Promise<void>;
  advanceAndDrawCurrentFrameJson?: (
    deltaSeconds: number,
  ) => string | Promise<string>;
  advanceAndDrawFrameJson: (
    frameInputJson: string,
    deltaSeconds: number,
    measurementsJson: string,
  ) => string | Promise<string>;
  drawBoardCommandsJson: (
    frameInputJson: string,
    measurementsJson: string,
  ) => string | Promise<string>;
}

interface PythonRenderedFrame {
  commands?: DrawCommand[];
}

interface CachedRenderedFrame {
  frameInput: PicographicsBoardFrameInput;
  commands: DrawCommand[];
}

export function createPyScriptPicographicsController(
  bridge: PyScriptPicographicsBridge,
): PicographicsBoardController {
  let cachedRenderedFrame: CachedRenderedFrame | null = null;
  let cachedFrameInputJson: string | null = null;
  let cachedMeasurementsJson: string | null = null;

  return {
    async drawFrame(graphics, frameInput) {
      const stopDrawProfile = startPicographicsProfile('controller.draw.total');
      const cachedCommands = getCachedCommands(frameInput);

      if (cachedCommands) {
        recordPicographicsCount('controller.draw.cached');
        logController('drawFrame:cached-response', {
          tone: frameInput.tone,
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
        const measurements = collectMeasurements(graphics, frameInput);
        stopMeasurementProfile();
        const frameInputJson = syncFrameInput(frameInput);
        const measurementsJson = syncMeasurements(measurements);
        logController('drawFrame:request', {
          tone: frameInput.tone,
        });
        const response = await bridge.drawBoardCommandsJson(
          frameInputJson,
          measurementsJson,
        );
        const stopParseProfile = startPicographicsProfile(
          'controller.parseCommands',
        );
        const commands = parseCommandsResponse(response);
        stopParseProfile();

        logController('drawFrame:response', {
          commandCount: commands.length,
          commandPreview: commands.slice(0, 5),
        });

        replayDrawCommands(graphics, commands);
      } finally {
        stopDrawProfile();
      }
    },

    async advanceFrame(graphics, frameInput, deltaSeconds) {
      const stopAdvanceProfile = startPicographicsProfile(
        'controller.advance.total',
      );

      try {
        const stopMeasurementProfile = startPicographicsProfile(
          'controller.measurements',
        );
        const measurements = collectMeasurements(graphics, frameInput);
        stopMeasurementProfile();
        const frameInputJson = syncFrameInput(frameInput);
        const measurementsJson = syncMeasurements(measurements);
        logController('advanceFrame:request', {
          deltaSeconds,
          measurements,
        });
        const response = bridge.advanceAndDrawCurrentFrameJson
          ? await bridge.advanceAndDrawCurrentFrameJson(deltaSeconds)
          : await bridge.advanceAndDrawFrameJson(
              frameInputJson,
              deltaSeconds,
              measurementsJson,
            );
        const stopParseProfile = startPicographicsProfile(
          'controller.parseCommands',
        );
        const commands = parseCommandsResponse(response);
        stopParseProfile();
        consumeRenderedFrame({ frameInput, commands });

        logController('advanceFrame:response', {
          commandCount: commands.length,
        });

        replayDrawCommands(graphics, commands);
      } finally {
        stopAdvanceProfile();
      }
    },
  };

  function getCachedCommands(frameInput: PicographicsBoardFrameInput) {
    if (cachedRenderedFrame?.frameInput !== frameInput) {
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
  }

  function parseCommandsResponse(response: string | Promise<string>) {
    const parsed = JSON.parse(String(response)) as
      | DrawCommand[]
      | PythonRenderedFrame;

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return parsed.commands ?? [];
  }
}

function logController(event: string, payload: Record<string, unknown>) {
  logPicographicsInfo('[slpanel/pyscript-controller]', event, payload);
}

function collectMeasurements(
  graphics: PicographicsCanvas,
  frameInput: PicographicsBoardFrameInput,
) {
  const measurements: Record<string, number> = {};

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
