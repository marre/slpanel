export const PICOGRAPHICS_PYTHON_SOURCE_URL = '/python/slpanel_picographics.py';

export async function loadPicographicsPythonSource(
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher(PICOGRAPHICS_PYTHON_SOURCE_URL, {
    headers: {
      accept: 'text/plain',
    },
  });

  if (!response.ok) {
    throw new Error('Could not load the Picographics Python source.');
  }

  return response.text();
}
