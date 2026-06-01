import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadPyScriptCoreModuleMock = vi.hoisted(() => vi.fn());
const loadPicographicsBridgeSourceMock = vi.hoisted(() => vi.fn());
const loadPicographicsModuleSourceMock = vi.hoisted(() => vi.fn());
const loadBoardEngineSourceMock = vi.hoisted(() => vi.fn());
const loadRuntimeInstrumentationSourceMock = vi.hoisted(() => vi.fn());
const whenDefinedMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/pyscript-loader', () => ({
  loadPyScriptCoreModule: loadPyScriptCoreModuleMock,
}));

vi.mock('@/lib/picographics-python-source', () => ({
  loadBoardEngineSource: loadBoardEngineSourceMock,
  loadPicographicsBridgeSource: loadPicographicsBridgeSourceMock,
  loadPicographicsModuleSource: loadPicographicsModuleSourceMock,
  loadRuntimeInstrumentationSource: loadRuntimeInstrumentationSourceMock,
}));

import { createPyScriptPicographicsRuntime } from '@/lib/pyscript-picographics-runtime';

type DynamicWindow = Window & Record<string, unknown>;

describe('createPyScriptPicographicsRuntime', () => {
  beforeEach(() => {
    whenDefinedMock.mockResolvedValue({});
    loadPyScriptCoreModuleMock.mockResolvedValue({
      whenDefined: whenDefinedMock,
    });
    loadPicographicsBridgeSourceMock.mockResolvedValue(
      'def draw_board():\n    pass\n',
    );
    loadPicographicsModuleSourceMock.mockResolvedValue(
      'class PicoGraphics:\n    pass\n',
    );
    loadBoardEngineSourceMock.mockResolvedValue(
      'class BoardEngine:\n    pass\n',
    );
    loadRuntimeInstrumentationSourceMock.mockResolvedValue(
      'def debug_log(event, payload=None):\n    pass\n',
    );
    delete window.__slpanelPicographicsBridgeSource;
  });

  afterEach(() => {
    loadPyScriptCoreModuleMock.mockReset();
    loadPicographicsBridgeSourceMock.mockReset();
    loadPicographicsModuleSourceMock.mockReset();
    loadBoardEngineSourceMock.mockReset();
    loadRuntimeInstrumentationSourceMock.mockReset();
    whenDefinedMock.mockReset();
    delete window.__slpanelPicographicsBridgeSource;
  });

  it('loads PyScript, executes the shared Python source, and returns a Python-backed controller session', async () => {
    const runtime = createPyScriptPicographicsRuntime({
      document,
      fetcher: fetch,
    });
    const context = createContext();

    const sessionPromise = runtime.initialize(context);

    const script = await waitForRuntimeScript();

    expect(script).not.toBeNull();

    const apiProperty = script?.textContent?.match(
      /window\.(__(?:slpanelPicographicsPythonApi_[A-Za-z0-9]+))\s*=\s*_slpanel_api/,
    )?.[1];

    expect(apiProperty).toBeTruthy();

    const drawBoardCommandsJson = vi.fn().mockImplementation(function (this: {
      result?: unknown;
    }) {
      this.result = JSON.stringify([
        ['set_pen', '#020202'],
        ['clear'],
        ['update'],
      ]);
      return asThenableJson('ignored');
    });

    Object.assign(window, {
      [apiProperty ?? '']: {
        advanceAndDrawCurrentFrameJson: vi
          .fn()
          .mockImplementation(function (this: { result?: unknown }) {
            this.result = JSON.stringify({
              marquee_state: {
                active_content: {
                  text: 'Loading departures',
                  interruptible: true,
                },
                pending_content: {
                  text: 'Loading departures',
                  interruptible: true,
                },
                marquee_offset: 120,
              },
              commands: [['set_pen', '#020202'], ['clear'], ['update']],
            });
            return asThenableJson('ignored');
          }),
        advanceAndDrawFrameJson: vi.fn().mockImplementation(function (this: {
          result?: unknown;
        }) {
          this.result = JSON.stringify({
            marquee_state: {
              active_content: {
                text: 'Loading departures',
                interruptible: true,
              },
              pending_content: {
                text: 'Loading departures',
                interruptible: true,
              },
              marquee_offset: 120,
            },
            commands: [['set_pen', '#020202'], ['clear'], ['update']],
          });
          return asThenableJson('ignored');
        }),
        setFrameInputJson: vi.fn(),
        setMeasurementsJson: vi.fn(),
        drawBoardCommandsJson,
      },
    });

    script?.dispatchEvent(new Event('mpy:done'));

    const session = await sessionPromise;

    expect(loadPyScriptCoreModuleMock).toHaveBeenCalledWith(document);
    expect(whenDefinedMock).toHaveBeenCalledWith('mpy');
    expect(loadPicographicsModuleSourceMock).toHaveBeenCalledWith(fetch);
    expect(loadRuntimeInstrumentationSourceMock).toHaveBeenCalledWith(fetch);
    expect(loadBoardEngineSourceMock).toHaveBeenCalledWith(fetch);
    expect(loadPicographicsBridgeSourceMock).toHaveBeenCalledWith(fetch);
    expect(script).toHaveAttribute('type', 'mpy');
    expect(script).toHaveAttribute(
      'target',
      expect.stringMatching(/^#slpanel-pyscript-target-/),
    );
    expect(script?.textContent).toContain(
      'def _slpanel_register_module(module_name, module_source):',
    );
    expect(script?.textContent).toContain(
      '_slpanel_register_module("picographics", _slpanel_picographics_module_source)',
    );
    expect(script?.textContent).toContain(
      '_slpanel_register_module(',
    );
    expect(script?.textContent).toContain(
      '_slpanel_register_module("board_engine", _slpanel_board_engine_module_source)',
    );
    expect(script?.textContent?.indexOf(
      '_slpanel_register_module("picographics", _slpanel_picographics_module_source)',
    )).toBeLessThan(
      script?.textContent?.indexOf(
        '_slpanel_register_module("board_engine", _slpanel_board_engine_module_source)',
      ) ?? 0,
    );
    expect(script?.textContent).toContain(
      '"runtime_instrumentation",',
    );
    expect(script?.textContent).toContain(
      '_slpanel_runtime_instrumentation_module_source',
    );
    expect(script?.textContent).not.toContain('types.ModuleType("picographics")');
    expect(window.__slpanelPicographicsBridgeSource).toContain('draw_board');
    await session.controller.drawBoard(
      session.graphics,
      {
        departures: [],
        tone: 'loading',
        headline: 'Loading departures',
        detail: 'Board is starting',
      },
      session.controller.createMarqueeState({
        departures: [],
        tone: 'loading',
        headline: 'Loading departures',
        detail: 'Board is starting',
      }),
    );

    expect(drawBoardCommandsJson).toHaveBeenCalled();
    expect(typeof session.graphics.set_pen).toBe('function');

    await session.dispose?.();

    expect(
      (window as unknown as DynamicWindow)[apiProperty ?? ''],
    ).toBeUndefined();
    expect(
      document.querySelector('[data-slpanel-pyscript-target="true"]'),
    ).toBeNull();
    expect(
      document.querySelector('script[data-slpanel-pyscript-runtime="true"]'),
    ).toBeNull();
  });

  it('resolves bootstrap when the Python API is registered without an mpy:done event', async () => {
    const runtime = createPyScriptPicographicsRuntime({
      document,
      fetcher: fetch,
    });
    const context = createContext();

    const sessionPromise = runtime.initialize(context);

    const script = await waitForRuntimeScript();
    const apiProperty = script?.textContent?.match(
      /window\.(__(?:slpanelPicographicsPythonApi_[A-Za-z0-9]+))\s*=\s*_slpanel_api/,
    )?.[1];

    Object.assign(window, {
      [apiProperty ?? '']: {
        result: JSON.stringify({
          active_content: {
            text: 'Loading departures',
            interruptible: true,
          },
          pending_content: {
            text: 'Loading departures',
            interruptible: true,
          },
          marquee_offset: 128,
        }),
        setFrameInputJson: vi.fn(),
        setMeasurementsJson: vi.fn(),
        advanceAndDrawCurrentFrameJson: vi.fn(function (this: {
          result?: unknown;
        }) {
          this.result = JSON.stringify({
            marquee_state: {
              active_content: {
                text: 'Loading departures',
                interruptible: true,
              },
              pending_content: {
                text: 'Loading departures',
                interruptible: true,
              },
              marquee_offset: 120,
            },
            commands: [['set_pen', '#020202'], ['clear'], ['update']],
          });
        }),
        advanceAndDrawFrameJson: vi.fn(function (this: { result?: unknown }) {
          this.result = JSON.stringify({
            marquee_state: {
              active_content: {
                text: 'Loading departures',
                interruptible: true,
              },
              pending_content: {
                text: 'Loading departures',
                interruptible: true,
              },
              marquee_offset: 120,
            },
            commands: [['set_pen', '#020202'], ['clear'], ['update']],
          });
        }),
        drawBoardCommandsJson: vi.fn(function (this: { result?: unknown }) {
          this.result = JSON.stringify([
            ['set_pen', '#020202'],
            ['clear'],
            ['update'],
          ]);
        }),
      },
    });

    const session = await sessionPromise;

    expect(session).toBeTruthy();
    expect(script).toHaveAttribute(
      'target',
      expect.stringMatching(/^#slpanel-pyscript-target-/),
    );
    expect(window.__slpanelPicographicsBridgeSource).toContain('draw_board');
  });
});

async function flushMicrotasks() {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

async function waitForRuntimeScript(timeoutMs = 250) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const script = document.querySelector<HTMLScriptElement>(
      'script[data-slpanel-pyscript-runtime="true"]',
    );

    if (script) {
      return script;
    }

    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return document.querySelector<HTMLScriptElement>(
    'script[data-slpanel-pyscript-runtime="true"]',
  );
}

function createContext() {
  const canvas = document.createElement('canvas');

  return {
    canvas,
    fillStyle: '#000000',
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function asThenableJson(value: unknown) {
  return {
    then() {
      throw new Error('bridge result should be stringified before awaiting');
    },
    toString() {
      return JSON.stringify(value);
    },
  };
}
