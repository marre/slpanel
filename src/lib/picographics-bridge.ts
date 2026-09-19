import { createCanvasPicographics } from './picographics-canvas';

const PYSCRIPT_CSS = 'https://pyscript.net/releases/2026.3.1/core.css';
const PYSCRIPT_JS = 'https://pyscript.net/releases/2026.3.1/core.js';

declare global {
  interface Window {
    __slpanelPicographicsApi?: {
      result: string | null;
      setFrameInputJson: (json: string) => void;
      advanceAndDrawCurrentFrameJson: (deltaSeconds: number) => void;
      drawBoardCommandsJson: (frameInputJson: string) => void;
    };
  }
}

export interface PicographicsBoard {
  setFrameInput(json: string): void;
  drawFrame(canvas: HTMLCanvasElement, frameInputJson: string): Promise<void>;
  advanceFrame(
    canvas: HTMLCanvasElement,
    frameInputJson: string,
    deltaSeconds: number,
  ): Promise<void>;
  dispose(): void;
}

let pyScriptAssetPromise: Promise<void> | null = null;

function ensurePyScriptAssets(): Promise<void> {
  if (pyScriptAssetPromise) {
    return pyScriptAssetPromise;
  }

  const doc = document;

  const existingLink = doc.querySelector(
    'link[data-slpanel-pyscript]',
  ) as HTMLLinkElement | null;

  if (!existingLink) {
    const link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = PYSCRIPT_CSS;
    link.dataset.slpanelPyscript = 'true';
    doc.head.appendChild(link);
  }

  pyScriptAssetPromise = new Promise((resolve, reject) => {
    const existingScript = doc.querySelector(
      'script[data-slpanel-pyscript]',
    ) as HTMLScriptElement | null;
    const script = existingScript ?? doc.createElement('script');

    if (script.dataset.loaded === 'true') {
      resolve();
      return;
    }

    script.type = 'module';
    script.src = PYSCRIPT_JS;
    script.dataset.slpanelPyscript = 'true';

    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => {
      pyScriptAssetPromise = null;
      reject(new Error('Could not load PyScript.'));
    }, { once: true });

    if (!existingScript) {
      doc.head.appendChild(script);
    }
  });

  return pyScriptAssetPromise;
}

async function loadPythonSource(
  fetcher: typeof fetch,
  url: string,
): Promise<string> {
  const response = await fetcher(url, {
    headers: { accept: 'text/plain' },
  });

  if (!response.ok) {
    throw new Error(`Could not load ${url}.`);
  }

  return response.text();
}

export async function createPicographicsBoard(
  context: CanvasRenderingContext2D,
  options: {
    fetch?: typeof fetch;
  } = {},
): Promise<PicographicsBoard> {
  const localFetch = options.fetch ?? fetch;

  await ensurePyScriptAssets();

  const [picographicsSource, fontSource, textSource, engineSource, bridgeSource] =
    await Promise.all([
      loadPythonSource(localFetch, '/python/picographics.py'),
      loadPythonSource(localFetch, '/python/sl_font.py'),
      loadPythonSource(localFetch, '/python/sl_text.py'),
      loadPythonSource(localFetch, '/python/board_engine.py'),
      loadPythonSource(localFetch, '/python/picographics_bridge.py'),
    ]);

  // Wait for MicroPython interpreter and mpy-script custom element
  const coreModule = await import(/* @vite-ignore */ PYSCRIPT_JS) as {
    whenDefined?: (type: string) => Promise<unknown>;
  };

  const readiness: Promise<unknown>[] = [];

  if (coreModule.whenDefined) {
    readiness.push(coreModule.whenDefined('mpy'));
  }

  if (window.customElements) {
    readiness.push(window.customElements.whenDefined('mpy-script'));
  }

  if (readiness.length > 0) {
    await Promise.race([
      Promise.any(readiness),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
  }

  const targetId = `slpanel-pyscript-target-${Math.random().toString(36).slice(2, 10)}`;
  const target = document.createElement('div');
  target.id = targetId;
  target.style.position = 'fixed';
  target.style.left = '-9999px';
  target.style.top = '0';
  target.style.width = '1px';
  target.style.height = '1px';
  target.style.overflow = 'hidden';
  target.style.opacity = '0';
  document.body.appendChild(target);

  const apiProperty = `__slpanelPicographicsApi_${Math.random().toString(36).slice(2, 10)}`;

  const bootstrap = [
    'import sys',
    '',
    'def _register_module(name, source):',
    '    class _Shim:',
    '        pass',
    '    ns = {"__name__": name}',
    '    exec(source, ns)',
    '    mod = _Shim()',
    '    mod.__name__ = name',
    '    for k, v in ns.items():',
    '        if k == "__name__":',
    '            continue',
    '        setattr(mod, k, v)',
    '    sys.modules[name] = mod',
    '',
    `_register_module("sl_font", ${JSON.stringify(fontSource)})`,
    `_register_module("sl_text", ${JSON.stringify(textSource)})`,
    `_register_module("picographics", ${JSON.stringify(picographicsSource)})`,
    `_register_module("board_engine", ${JSON.stringify(engineSource)})`,
    '',
    bridgeSource.trimEnd(),
    '',
    'from js import Object',
    'from pyscript import window',
    'from pyscript.ffi import create_proxy',
    '',
    '_api = Object.new()',
    '_api.result = None',
    '',
    'def _set_frame_input_json(json):',
    '    set_frame_input_json(json)',
    '',
    'def _draw_board_commands_json(frame_input_json):',
    '    _api.result = draw_board_commands_json(frame_input_json)',
    '',
    'def _advance_and_draw_current_frame_json(delta_seconds):',
    '    _api.result = advance_and_draw_current_frame_json(delta_seconds)',
    '',
    '_api.setFrameInputJson = create_proxy(_set_frame_input_json)',
    '_api.drawBoardCommandsJson = create_proxy(_draw_board_commands_json)',
    '_api.advanceAndDrawCurrentFrameJson = create_proxy(_advance_and_draw_current_frame_json)',
    `window.${apiProperty} = _api`,
    '',
  ].join('\n');

  const script = document.createElement('script');
  script.type = 'mpy';
  script.setAttribute('target', `#${targetId}`);
  script.textContent = bootstrap;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('PyScript bootstrap timed out.'));
    }, 8000);

    const check = () => {
      const api = (window as unknown as Record<string, unknown>)[apiProperty];

      if (api) {
        clearTimeout(timeout);
        resolve();
        return true;
      }

      return false;
    };

    script.addEventListener(
      'mpy:done',
      () => {
        if (!check()) {
          clearTimeout(timeout);
          resolve();
        }
      },
      { once: true },
    );

    script.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('PyScript bootstrap failed.'));
      },
      { once: true },
    );

    document.body.appendChild(script);

    // Poll in case mpy:done never fires
    const poll = () => {
      if (check()) return;
      setTimeout(poll, 0);
    };
    poll();
  });

  const api = (window.__slpanelPicographicsApi = (
    window as unknown as Record<string, unknown>
  )[apiProperty] as Window['__slpanelPicographicsApi']);

  if (!api) {
    throw new Error('Picographics API not registered after bootstrap.');
  }

  const graphics = createCanvasPicographics(context);
  let cachedFrameInputJson: string | null = null;
  let lastFrameInputJson: string | null = null;
  let lastCommandsJson: string | null = null;

  const executeCommand = (operation: string, invoke: () => void): string => {
    api.result = null;
    invoke();

    if (typeof api.result !== 'string') {
      throw new Error(
        `PyScript bridge did not return a string result for ${operation}.`,
      );
    }

    return api.result;
  };

  const replayCommands = (commandsJson: string) => {
    const commands = JSON.parse(commandsJson) as Array<
      [string, ...Array<string | number>]
    >;

    for (const [op, ...args] of commands) {
      switch (op) {
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
  };

  const setFrameInput = (json: string) => {
    if (json !== cachedFrameInputJson) {
      cachedFrameInputJson = json;
      api.setFrameInputJson(json);
    }
  };

  const board: PicographicsBoard = {
    setFrameInput,

    drawFrame: async (_canvas, frameInputJson) => {
      // Skip the Python round-trip when nothing changed: replaying the
      // previous frame's commands is a no-op visually but keeps the
      // canvas content (browser clears are explicit).
      if (frameInputJson === lastFrameInputJson && lastCommandsJson) {
        replayCommands(lastCommandsJson);
        return;
      }

      setFrameInput(frameInputJson);

      const commandsJson = executeCommand('drawBoardCommandsJson', () => {
        api.drawBoardCommandsJson(frameInputJson);
      });

      lastFrameInputJson = frameInputJson;
      lastCommandsJson = commandsJson;
      replayCommands(commandsJson);
    },

    advanceFrame: async (_canvas, frameInputJson, deltaSeconds) => {
      setFrameInput(frameInputJson);

      const commandsJson = executeCommand(
        'advanceAndDrawCurrentFrameJson',
        () => {
          api.advanceAndDrawCurrentFrameJson(deltaSeconds);
        },
      );

      lastFrameInputJson = frameInputJson;
      lastCommandsJson = commandsJson;
      replayCommands(commandsJson);
    },

    dispose: () => {
      script.remove();
      target.remove();
      delete window.__slpanelPicographicsApi;
      delete (window as unknown as Record<string, unknown>)[apiProperty];
    },
  };

  return board;
}
