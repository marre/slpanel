import { afterEach, describe, expect, it } from 'vitest';

import {
  loadPyScriptCoreModule,
  loadPyScriptAssets,
  PYSCRIPT_CORE_CSS_URL,
  PYSCRIPT_CORE_JS_URL,
  resetPyScriptAssetLoaderForTests,
} from '@/lib/pyscript-loader';

describe('loadPyScriptAssets', () => {
  afterEach(() => {
    resetPyScriptAssetLoaderForTests();
    document.head.innerHTML = '';
  });

  it('injects the hosted PyScript assets once and resolves on script load', async () => {
    const firstPromise = loadPyScriptAssets(document);
    const secondPromise = loadPyScriptAssets(document);

    expect(secondPromise).toBe(firstPromise);

    const stylesheet = document.querySelector(
      'link[data-slpanel-pyscript-core]',
    );
    const script = document.querySelector('script[data-slpanel-pyscript-core]');

    expect(stylesheet).toHaveAttribute('href', PYSCRIPT_CORE_CSS_URL);
    expect(script).toHaveAttribute('src', PYSCRIPT_CORE_JS_URL);

    script?.dispatchEvent(new Event('load'));

    await expect(firstPromise).resolves.toBeUndefined();
    expect(
      document.querySelectorAll('link[data-slpanel-pyscript-core]'),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll('script[data-slpanel-pyscript-core]'),
    ).toHaveLength(1);
  });

  it('rejects when the hosted runtime script fails to load', async () => {
    const promise = loadPyScriptAssets(document);
    const script = document.querySelector('script[data-slpanel-pyscript-core]');

    script?.dispatchEvent(new Event('error'));

    await expect(promise).rejects.toThrow(
      /could not load the pyscript runtime/i,
    );
  });

  it('loads the PyScript core module once after the assets are ready', async () => {
    const importer = vi
      .fn<
        () => Promise<{
          whenDefined: () => Promise<object>;
          donkey: () => Promise<{
            execute: () => Promise<void>;
            evaluate: () => Promise<void>;
          }>;
        }>
      >()
      .mockResolvedValue({
        whenDefined: async () => ({}),
        donkey: async () => ({
          execute: async () => undefined,
          evaluate: async () => undefined,
        }),
      });

    const firstPromise = loadPyScriptCoreModule(document, importer);
    const secondPromise = loadPyScriptCoreModule(document, importer);
    const script = document.querySelector('script[data-slpanel-pyscript-core]');

    expect(secondPromise).toBe(firstPromise);

    script?.dispatchEvent(new Event('load'));

    await expect(firstPromise).resolves.toMatchObject({
      donkey: expect.any(Function),
    });
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
