export const PICOGRAPHICS_PYTHON_SOURCE_URL = '/python/slpanel_picographics.py';
export const PICOGRAPHICS_MODULE_SOURCE_URL = '/python/picographics.py';
export const SLPANEL_INSTRUMENTATION_SOURCE_URL =
  '/python/slpanel_instrumentation.py';

export async function loadPicographicsPythonSource(
  fetcher: typeof fetch = fetch,
) {
  return loadPythonSource(PICOGRAPHICS_PYTHON_SOURCE_URL, fetcher);
}

export async function loadPicographicsModuleSource(
  fetcher: typeof fetch = fetch,
) {
  return loadPythonSource(PICOGRAPHICS_MODULE_SOURCE_URL, fetcher);
}

export async function loadSlpanelInstrumentationSource(
  fetcher: typeof fetch = fetch,
) {
  return loadPythonSource(SLPANEL_INSTRUMENTATION_SOURCE_URL, fetcher);
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
