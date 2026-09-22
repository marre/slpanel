import { copyFile, mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const source = resolve('public/wasm/slpanel_preview.wasm');
const destination = resolve('dist/client/wasm/slpanel_preview.wasm');
const sourceDirectory = dirname(source);
const destinationDirectory = dirname(destination);
const sourceName = basename(source);

await mkdir(sourceDirectory, { recursive: true });
await mkdir(destinationDirectory, { recursive: true });

async function syncWasm() {
  try {
    await copyFile(source, destination);
    console.log(`[wasm] copied ${sourceName} to dist/client/wasm`);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      console.warn(`[wasm] waiting for ${source}`);
      return;
    }

    console.error('[wasm] failed to copy the renderer', error);
  }
}

await syncWasm();

let timer;
const watcher = watch(sourceDirectory, (_event, changedName) => {
  if (changedName !== sourceName) return;

  clearTimeout(timer);
  timer = setTimeout(() => {
    void syncWasm();
  }, 100);
});

function close() {
  clearTimeout(timer);
  watcher.close();
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
