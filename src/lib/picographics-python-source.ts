export const PICOGRAPHICS_BRIDGE_SOURCE_URL = '/python/picographics_bridge.py';
export const PICOGRAPHICS_MODULE_SOURCE_URL = '/python/picographics.py';
export const RUNTIME_INSTRUMENTATION_SOURCE_URL =
  '/python/runtime_instrumentation.py';
export const BOARD_ENGINE_SOURCE_URL = '/python/board_engine.py';

export async function loadPicographicsBridgeSource(
  fetcher: typeof fetch = fetch,
) {
  return loadPythonSource(PICOGRAPHICS_BRIDGE_SOURCE_URL, fetcher);
}

export async function loadPicographicsModuleSource(
  fetcher: typeof fetch = fetch,
) {
  return loadPythonSource(PICOGRAPHICS_MODULE_SOURCE_URL, fetcher);
}

export async function loadRuntimeInstrumentationSource(
  fetcher: typeof fetch = fetch,
) {
  return loadPythonSource(RUNTIME_INSTRUMENTATION_SOURCE_URL, fetcher);
}

export async function loadBoardEngineSource(
  fetcher: typeof fetch = fetch,
) {
  return loadPythonSource(BOARD_ENGINE_SOURCE_URL, fetcher);
}

async function loadPythonSource(url: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(url, {
    headers: {
      accept: 'text/plain',
    },
  });

  if (!response.ok) {
    throw new Error('Could not load the Picographics Python source.');
  }

  return response.text();
}
