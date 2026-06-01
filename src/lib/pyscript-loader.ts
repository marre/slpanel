export const PYSCRIPT_VERSION = '2026.3.1';
export const PYSCRIPT_CORE_CSS_URL = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.css`;
export const PYSCRIPT_CORE_JS_URL = `https://pyscript.net/releases/${PYSCRIPT_VERSION}/core.js`;

export interface PyScriptDonkeyInstance {
  execute: (code: string) => Promise<unknown>;
  evaluate: (code: string) => Promise<unknown>;
  kill?: () => Promise<unknown>;
}

export interface PyScriptCoreModule {
  whenDefined?: (type: string) => Promise<object>;
  donkey?: (options: {
    type: 'mpy';
    terminal?: string;
  }) => Promise<PyScriptDonkeyInstance>;
}

const PYSCRIPT_STYLESHEET_SELECTOR = 'link[data-slpanel-pyscript-core]';
const PYSCRIPT_SCRIPT_SELECTOR = 'script[data-slpanel-pyscript-core]';

let pyScriptAssetPromise: Promise<void> | null = null;
let pyScriptModulePromise: Promise<PyScriptCoreModule> | null = null;

export function loadPyScriptAssets(doc: Document = document) {
  if (pyScriptAssetPromise) {
    return pyScriptAssetPromise;
  }

  ensurePyScriptStylesheet(doc);

  pyScriptAssetPromise = new Promise((resolve, reject) => {
    const existingScript = doc.querySelector<HTMLScriptElement>(
      PYSCRIPT_SCRIPT_SELECTOR,
    );
    const script = existingScript ?? doc.createElement('script');

    script.type = 'module';
    script.src = PYSCRIPT_CORE_JS_URL;
    script.dataset.slpanelPyscriptCore = 'true';

    if (script.dataset.loaded === 'true') {
      resolve();
      return;
    }

    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => {
        pyScriptAssetPromise = null;
        reject(new Error('Could not load the PyScript runtime assets.'));
      },
      { once: true },
    );

    if (!existingScript) {
      doc.head.appendChild(script);
    }
  });

  return pyScriptAssetPromise;
}

export function resetPyScriptAssetLoaderForTests() {
  pyScriptAssetPromise = null;
  pyScriptModulePromise = null;
}

export function loadPyScriptCoreModule(
  doc: Document = document,
  importer: () => Promise<PyScriptCoreModule> = importPyScriptCoreModule,
) {
  if (pyScriptModulePromise) {
    return pyScriptModulePromise;
  }

  pyScriptModulePromise = (async () => {
    await loadPyScriptAssets(doc);
    return importer();
  })().catch((error) => {
    pyScriptModulePromise = null;
    throw error;
  });

  return pyScriptModulePromise;
}

function ensurePyScriptStylesheet(doc: Document) {
  const existingStylesheet = doc.querySelector<HTMLLinkElement>(
    PYSCRIPT_STYLESHEET_SELECTOR,
  );

  if (existingStylesheet) {
    return existingStylesheet;
  }

  const stylesheet = doc.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = PYSCRIPT_CORE_CSS_URL;
  stylesheet.dataset.slpanelPyscriptCore = 'true';
  doc.head.appendChild(stylesheet);

  return stylesheet;
}

async function importPyScriptCoreModule() {
  return import(/* @vite-ignore */ PYSCRIPT_CORE_JS_URL);
}
