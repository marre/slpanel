import { createCanvasPicographics } from '@/lib/picographics-canvas';
import {
  loadBoardEngineSource,
  loadPicographicsBridgeSource,
  loadPicographicsModuleSource,
  loadRuntimeInstrumentationSource,
} from '@/lib/picographics-python-source';
import {
  createPyScriptPicographicsController,
  type PyScriptPicographicsBridge,
} from '@/lib/pyscript-picographics-controller';
import {
  logPicographicsError,
  logPicographicsInfo,
} from '@/lib/picographics-debug';
import { startPicographicsProfile } from '@/lib/picographics-profiler';
import type { PicographicsRuntime } from '@/lib/picographics-runtime';
import { loadPyScriptCoreModule } from '@/lib/pyscript-loader';

const PYTHON_API_PROPERTY_PREFIX = '__slpanelPicographicsPythonApi_';
const PYTHON_BOOTSTRAP_POLL_INTERVAL_MS = 0;
const PYTHON_BOOTSTRAP_TIMEOUT_MS = 5000;
const PYTHON_INTERPRETER_READY_TIMEOUT_MS = 1500;

declare global {
  interface Window {
    __slpanelPicographicsBridgeSource?: string;
  }
}

interface MainThreadPicographicsApi {
  result?: unknown;
  setFrameInputJson: (frameInputJson: string) => void;
  setMeasurementsJson: (measurementsJson: string) => void;
  advanceAndDrawCurrentFrameJson: (deltaSeconds: number) => void;
  advanceAndDrawFrameJson: (
    frameInputJson: string,
    deltaSeconds: number,
    measurementsJson: string,
  ) => void;
  drawBoardCommandsJson: (
    frameInputJson: string,
    measurementsJson: string,
  ) => void;
}

type DynamicWindow = Window & Record<string, unknown>;

export function createPyScriptPicographicsRuntime(options?: {
  document?: Document;
  fetcher?: typeof fetch;
}): PicographicsRuntime {
  return {
    id: 'pyscript-bootstrap',
    label: 'PyScript bootstrap',
    async initialize(context) {
      logRuntime('initialize:start', {
        hasCanvas: Boolean(context.canvas),
      });

      const doc =
        options?.document ??
        context.canvas.ownerDocument ??
        globalThis.document;

      if (!doc) {
        throw new Error(
          'Could not resolve a document for the PyScript runtime.',
        );
      }

      const coreModule = await loadPyScriptCoreModule(doc);
      const win = doc.defaultView;
      const runtimeWindow = win as unknown as DynamicWindow;

      if (!win) {
        throw new Error('Could not resolve a window for the PyScript runtime.');
      }

      if (!coreModule.whenDefined) {
        throw new Error('PyScript MicroPython runtime API is not available.');
      }

      logRuntime('initialize:whenDefined', { interpreter: 'mpy' });
      await waitForMicroPythonInterpreter(win, coreModule.whenDefined);

      const fetcher = options?.fetcher ?? fetch;
      const [
        picographicsModuleSource,
        instrumentationModuleSource,
        engineModuleSource,
        bridgeSource,
      ] = await Promise.all([
        loadPicographicsModuleSource(fetcher),
        loadRuntimeInstrumentationSource(fetcher),
        loadBoardEngineSource(fetcher),
        loadPicographicsBridgeSource(fetcher),
      ]);
      logRuntime('initialize:source-loaded', {
        picographicsModuleSourceLength: picographicsModuleSource.length,
        instrumentationModuleSourceLength: instrumentationModuleSource.length,
        engineModuleSourceLength: engineModuleSource.length,
        bridgeSourceLength: bridgeSource.length,
      });
      const runtimeTarget = ensureHiddenRuntimeTarget(doc);
      const apiProperty = `${PYTHON_API_PROPERTY_PREFIX}${Math.random().toString(36).slice(2, 10)}`;
      const bootstrapScript = createMainThreadMicroPythonScript(
        doc,
        runtimeTarget.id,
        buildPythonBootstrapSource({
          bridgeSource,
          picographicsModuleSource,
          instrumentationModuleSource,
          engineModuleSource,
          apiProperty,
        }),
      );
      let api: MainThreadPicographicsApi;

      try {
        logRuntime('initialize:bootstrap-script-created', {
          apiProperty,
          target: bootstrapScript.getAttribute('target'),
        });
        await runMainThreadMicroPythonScript(
          bootstrapScript,
          runtimeTarget,
          win,
          apiProperty,
        );
        api = resolveMainThreadPicographicsApi(win, apiProperty, runtimeTarget);
      } catch (error) {
        logRuntimeError('initialize:bootstrap-failed', error);
        bootstrapScript.remove();
        runtimeTarget.remove();
        delete runtimeWindow[apiProperty];
        throw error;
      }

      runtimeWindow.__slpanelPicographicsBridgeSource = bridgeSource;

      logRuntime('initialize:ready', {
        apiProperty,
      });

      return {
        graphics: createCanvasPicographics(context),
        controller: createPyScriptPicographicsController(
          createMainThreadPyScriptBridge(api),
        ),
        dispose() {
          logRuntime('dispose', { apiProperty });
          bootstrapScript.remove();
          runtimeTarget.remove();
          delete runtimeWindow[apiProperty];
        },
      };
    },
  };
}

export const pyScriptPicographicsRuntime = createPyScriptPicographicsRuntime();

function createMainThreadPyScriptBridge(
  api: MainThreadPicographicsApi,
): PyScriptPicographicsBridge {
  return {
    setFrameInputJson(frameInputJson) {
      invokeBridgeVoid(api, 'setFrameInputJson', () => {
        api.setFrameInputJson(frameInputJson);
      });
    },
    setMeasurementsJson(measurementsJson) {
      invokeBridgeVoid(api, 'setMeasurementsJson', () => {
        api.setMeasurementsJson(measurementsJson);
      });
    },
    advanceAndDrawCurrentFrameJson(deltaSeconds) {
      return readBridgeJsonResult(api, 'advanceAndDrawCurrentFrameJson', () => {
        api.advanceAndDrawCurrentFrameJson(deltaSeconds);
      });
    },
    advanceAndDrawFrameJson(frameInputJson, deltaSeconds, measurementsJson) {
      return readBridgeJsonResult(api, 'advanceAndDrawFrameJson', () => {
        api.advanceAndDrawFrameJson(
          frameInputJson,
          deltaSeconds,
          measurementsJson,
        );
      });
    },
    drawBoardCommandsJson(frameInputJson, measurementsJson) {
      return readBridgeJsonResult(api, 'drawBoardCommandsJson', () => {
        api.drawBoardCommandsJson(frameInputJson, measurementsJson);
      });
    },
  };
}

function readBridgeJsonResult(
  api: MainThreadPicographicsApi,
  operation: string,
  invoke: () => void,
) {
  const stopBridgeProfile = startPicographicsProfile(
    `runtime.bridge.${operation}`,
  );
  logRuntime(`bridge:${operation}:request`, {});
  api.result = null;

  try {
    invoke();

    if (typeof api.result !== 'string') {
      throw new Error('PyScript bridge did not produce a JSON string result.');
    }

    logRuntime(`bridge:${operation}:response`, {
      resultPreview: summarizeText(api.result, 120),
    });

    return api.result;
  } finally {
    stopBridgeProfile();
  }
}

function invokeBridgeVoid(
  api: MainThreadPicographicsApi,
  operation: string,
  invoke: () => void,
) {
  const stopBridgeProfile = startPicographicsProfile(
    `runtime.bridge.${operation}`,
  );

  try {
    invoke();
  } finally {
    stopBridgeProfile();
  }
}

function createMainThreadMicroPythonScript(
  doc: Document,
  targetId: string,
  source: string,
) {
  const script = doc.createElement('script');

  script.type = 'mpy';
  script.dataset.slpanelPyscriptRuntime = 'true';
  script.setAttribute('target', `#${targetId}`);
  script.textContent = source;

  return script;
}

async function runMainThreadMicroPythonScript(
  script: HTMLScriptElement,
  target: HTMLElement,
  win: Window,
  apiProperty: string,
) {
  const runtimeWindow = win as DynamicWindow;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let pollTimeoutId = 0;
    let bootstrapTimeoutId = 0;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      script.removeEventListener('mpy:done', handleDone);
      script.removeEventListener('error', handleError);
      win.clearTimeout(pollTimeoutId);
      win.clearTimeout(bootstrapTimeoutId);
      callback();
    };

    const checkReady = () => {
      if (runtimeWindow[apiProperty]) {
        logRuntime('bootstrap:api-registered', { apiProperty });
        finish(resolve);
        return;
      }

      pollTimeoutId = win.setTimeout(
        checkReady,
        PYTHON_BOOTSTRAP_POLL_INTERVAL_MS,
      );
    };

    const handleDone = () => {
      logRuntime('bootstrap:mpy-done', { apiProperty });
      finish(resolve);
    };
    const handleError = () => {
      logRuntime('bootstrap:error-event', { apiProperty });
      finish(() => {
        reject(
          new Error('Could not execute the PyScript MicroPython bootstrap.'),
        );
      });
    };

    const handleTimeout = () => {
      logRuntime('bootstrap:timeout', { apiProperty });
      finish(() => {
        reject(
          new Error(
            'Timed out while waiting for the PyScript MicroPython bootstrap.',
          ),
        );
      });
    };

    script.addEventListener('mpy:done', handleDone, { once: true });
    script.addEventListener('error', handleError, { once: true });
    logRuntime('bootstrap:append-script', {
      apiProperty,
      target: script.getAttribute('target'),
    });
    target.ownerDocument.body.appendChild(script);
    bootstrapTimeoutId = win.setTimeout(
      handleTimeout,
      PYTHON_BOOTSTRAP_TIMEOUT_MS,
    );
    checkReady();
  });
}

function resolveMainThreadPicographicsApi(
  win: Window,
  apiProperty: string,
  target: HTMLElement,
) {
  const api = (win as DynamicWindow)[apiProperty] as
    | MainThreadPicographicsApi
    | undefined;

  if (!api) {
    const message = target.textContent?.trim();

    throw new Error(
      message || 'Could not initialize the PyScript MicroPython bridge.',
    );
  }

  return api;
}

function buildPythonBootstrapSource(options: {
  bridgeSource: string;
  picographicsModuleSource: string;
  instrumentationModuleSource: string;
  engineModuleSource: string;
  apiProperty: string;
}) {
  const {
    bridgeSource,
    picographicsModuleSource,
    instrumentationModuleSource,
    engineModuleSource,
    apiProperty,
  } = options;

  return [
    'import sys',
    '',
    'def _slpanel_register_module(module_name, module_source):',
    '    class _SlpanelModuleShim:',
    '        pass',
    '',
    '    _namespace = {"__name__": module_name}',
    '    exec(module_source, _namespace)',
    '',
    '    _module = _SlpanelModuleShim()',
    '    _module.__name__ = module_name',
    '    for _name, _value in _namespace.items():',
    '        if _name == "__name__":',
    '            continue',
    '        setattr(_module, _name, _value)',
    '',
    '    sys.modules[module_name] = _module',
    '',
    `_slpanel_picographics_module_source = ${JSON.stringify(picographicsModuleSource)}`,
    `_slpanel_runtime_instrumentation_module_source = ${JSON.stringify(instrumentationModuleSource)}`,
    `_slpanel_board_engine_module_source = ${JSON.stringify(engineModuleSource)}`,
    '',
    '_slpanel_register_module(',
    '    "runtime_instrumentation",',
    '    _slpanel_runtime_instrumentation_module_source,',
    ')',
    '_slpanel_register_module("picographics", _slpanel_picographics_module_source)',
    '_slpanel_register_module("board_engine", _slpanel_board_engine_module_source)',
    '',
    bridgeSource.trimEnd(),
    '',
    'from js import Object',
    'from pyscript import window',
    'from pyscript.ffi import create_proxy',
    '',
    '_slpanel_api = Object.new()',
    '_slpanel_api.result = None',
    '',
    'def _slpanel_set_frame_input_json(frame_input_json):',
    '    set_frame_input_json(frame_input_json)',
    '',
    'def _slpanel_set_measurements_json(measurements_json="{}"):',
    '    set_measurements_json(measurements_json)',
    '',
    'def _slpanel_advance_and_draw_current_frame_json(delta_seconds):',
    '    _slpanel_api.result = advance_and_draw_current_frame_json(delta_seconds)',
    '',
    'def _slpanel_advance_and_draw_frame_json(',
    '    frame_input_json,',
    '    delta_seconds,',
    '    measurements_json="{}",',
    '):',
    '    _slpanel_api.result = advance_and_draw_frame_json(',
    '        frame_input_json,',
    '        delta_seconds,',
    '        measurements_json,',
    '    )',
    '',
    'def _slpanel_draw_board_commands_json(',
    '    frame_input_json,',
    '    measurements_json="{}",',
    '):',
    '    _slpanel_api.result = draw_board_commands_json(',
    '        frame_input_json,',
    '        measurements_json,',
    '    )',
    '',
    '_slpanel_api.setFrameInputJson = create_proxy(_slpanel_set_frame_input_json)',
    '_slpanel_api.setMeasurementsJson = create_proxy(_slpanel_set_measurements_json)',
    '_slpanel_api.advanceAndDrawCurrentFrameJson = create_proxy(_slpanel_advance_and_draw_current_frame_json)',
    '_slpanel_api.advanceAndDrawFrameJson = create_proxy(_slpanel_advance_and_draw_frame_json)',
    '_slpanel_api.drawBoardCommandsJson = create_proxy(_slpanel_draw_board_commands_json)',
    `window.${apiProperty} = _slpanel_api`,
    '',
  ].join('\n');
}

function ensureHiddenRuntimeTarget(doc: Document) {
  const target = doc.createElement('div');

  target.id = `slpanel-pyscript-target-${Math.random().toString(36).slice(2, 10)}`;
  target.dataset.slpanelPyscriptTarget = 'true';
  target.setAttribute('aria-hidden', 'true');
  target.style.position = 'fixed';
  target.style.left = '-9999px';
  target.style.top = '0';
  target.style.width = '1px';
  target.style.height = '1px';
  target.style.overflow = 'hidden';
  target.style.opacity = '0';
  target.style.pointerEvents = 'none';

  const parent = doc.body ?? doc.documentElement;
  parent.appendChild(target);

  return target;
}

async function waitForMicroPythonInterpreter(
  win: Window,
  whenDefined: ((type: string) => Promise<object>) | undefined,
) {
  const readinessChecks: Array<Promise<unknown>> = [];

  if (whenDefined) {
    readinessChecks.push(
      whenDefined('mpy').then(() => {
        logRuntime('initialize:whenDefined-resolved', { interpreter: 'mpy' });
      }),
    );
  }

  if (win.customElements) {
    readinessChecks.push(
      win.customElements.whenDefined('mpy-script').then(() => {
        logRuntime('initialize:custom-element-ready', {
          element: 'mpy-script',
        });
      }),
    );
  }

  if (readinessChecks.length === 0) {
    return;
  }

  const timeoutResult = new Promise<'timeout'>((resolve) => {
    win.setTimeout(() => {
      resolve('timeout');
    }, PYTHON_INTERPRETER_READY_TIMEOUT_MS);
  });

  const readinessResult = await Promise.race<unknown | 'timeout'>([
    Promise.any(readinessChecks),
    Promise.resolve(timeoutResult),
  ]);

  if (readinessResult === 'timeout') {
    logRuntime('initialize:interpreter-ready-timeout', {
      timeoutMs: PYTHON_INTERPRETER_READY_TIMEOUT_MS,
    });
  }
}

function logRuntime(event: string, payload: Record<string, unknown>) {
  logPicographicsInfo('[slpanel/pyscript-runtime]', event, payload);
}

function logRuntimeError(event: string, error: unknown) {
  logPicographicsError('[slpanel/pyscript-runtime]', event, error);
}

function summarizeText(value: unknown, maxLength = 80) {
  const text = typeof value === 'string' ? value : String(value);

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}
