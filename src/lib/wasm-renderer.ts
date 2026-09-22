import {
  DIODE_SCALE,
  getToneColors,
  LOGICAL_PANEL_HEIGHT,
  LOGICAL_PANEL_WIDTH,
  type BoardTone,
} from '@/components/display-board-shared';

const WASM_URL = '/wasm/slpanel_preview.wasm';
const FRAME_LENGTH = LOGICAL_PANEL_WIDTH * LOGICAL_PANEL_HEIGHT;

interface RendererExports {
  memory: WebAssembly.Memory;
  slpanel_alloc: (length: number) => number;
  slpanel_dealloc: (pointer: number, length: number) => void;
  slpanel_renderer_new: () => number;
  slpanel_renderer_free: (handle: number) => void;
  slpanel_renderer_set_input: (
    handle: number,
    pointer: number,
    length: number,
  ) => number;
  slpanel_renderer_draw: (handle: number, elapsedSeconds: number) => number;
  slpanel_renderer_frame_ptr: (handle: number) => number;
  slpanel_renderer_frame_len: (handle: number) => number;
}

export interface WasmBoard {
  drawFrame(canvas: HTMLCanvasElement, frameInputJson: string): Promise<void>;
  advanceFrame(
    canvas: HTMLCanvasElement,
    frameInputJson: string,
    deltaSeconds: number,
  ): Promise<void>;
  dispose(): void;
}

export async function createWasmBoard(
  _context: CanvasRenderingContext2D,
  options: { fetch?: typeof fetch; url?: string } = {},
): Promise<WasmBoard> {
  const fetcher = options.fetch ?? fetch;
  const response = await fetcher(options.url ?? WASM_URL, {
    headers: { accept: 'application/wasm' },
  });

  if (!response.ok) {
    throw new Error(`Could not load ${options.url ?? WASM_URL}.`);
  }

  const bytes = await response.arrayBuffer();
  if (!isWebAssemblyBinary(bytes)) {
    throw new Error(
      `WASM asset ${options.url ?? WASM_URL} did not return a WebAssembly binary ` +
        `(HTTP ${response.status}, content-type ${response.headers.get('content-type') ?? 'unknown'}).`,
    );
  }

  let instance: WebAssembly.Instance;
  try {
    const instantiated = (await WebAssembly.instantiate(
      bytes,
      {},
    )) as unknown as {
      instance: WebAssembly.Instance;
    };
    instance = instantiated.instance;
  } catch (error) {
    throw new Error('Could not instantiate the SLPanel WebAssembly renderer.', {
      cause: error,
    });
  }
  const exports = instance.exports as unknown as RendererExports;
  validateExports(exports);

  const handle = exports.slpanel_renderer_new();
  let disposed = false;
  let cachedInputJson: string | null = null;

  const setInput = (json: string) => {
    if (json === cachedInputJson) return;

    const encoded = new TextEncoder().encode(json);
    const pointer = exports.slpanel_alloc(encoded.length);

    try {
      new Uint8Array(exports.memory.buffer, pointer, encoded.length).set(
        encoded,
      );
      const result = exports.slpanel_renderer_set_input(
        handle,
        pointer,
        encoded.length,
      );

      if (result !== 0) {
        throw new Error(`WASM renderer rejected frame input (${result}).`);
      }
      cachedInputJson = json;
    } finally {
      exports.slpanel_dealloc(pointer, encoded.length);
    }
  };

  const draw = (
    canvas: HTMLCanvasElement,
    frameInputJson: string,
    elapsedSeconds: number,
  ) => {
    if (disposed) return;

    setInput(frameInputJson);
    const result = exports.slpanel_renderer_draw(handle, elapsedSeconds);

    if (result !== 0) {
      throw new Error(`WASM renderer failed to draw (${result}).`);
    }

    const pointer = exports.slpanel_renderer_frame_ptr(handle);
    const length = exports.slpanel_renderer_frame_len(handle);

    if (!pointer || length !== FRAME_LENGTH) {
      throw new Error('WASM renderer returned an invalid frame.');
    }

    const pixels = new Uint8Array(exports.memory.buffer, pointer, length);
    paintFrame(canvas, pixels, frameInputJson);
  };

  return {
    async drawFrame(canvas, frameInputJson) {
      draw(canvas, frameInputJson, 0);
    },

    async advanceFrame(canvas, frameInputJson, deltaSeconds) {
      draw(canvas, frameInputJson, Math.max(0, deltaSeconds));
    },

    dispose() {
      if (!disposed) {
        exports.slpanel_renderer_free(handle);
        disposed = true;
      }
    },
  };
}

function isWebAssemblyBinary(bytes: ArrayBuffer) {
  const magic = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 4));
  return (
    magic.length === 4 &&
    magic[0] === 0x00 &&
    magic[1] === 0x61 &&
    magic[2] === 0x73 &&
    magic[3] === 0x6d
  );
}

function validateExports(exports: RendererExports) {
  const required = [
    'memory',
    'slpanel_alloc',
    'slpanel_dealloc',
    'slpanel_renderer_new',
    'slpanel_renderer_free',
    'slpanel_renderer_set_input',
    'slpanel_renderer_draw',
    'slpanel_renderer_frame_ptr',
    'slpanel_renderer_frame_len',
  ] as const;

  for (const name of required) {
    if (!(name in exports)) {
      throw new Error(`WASM renderer is missing export ${name}.`);
    }
  }
}

function paintFrame(
  canvas: HTMLCanvasElement,
  pixels: Uint8Array,
  frameInputJson: string,
) {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create a 2D canvas context.');
  }

  const input = JSON.parse(frameInputJson) as { tone?: BoardTone };
  const scaleX = canvas.width / LOGICAL_PANEL_WIDTH;
  const scaleY = canvas.height / LOGICAL_PANEL_HEIGHT;
  const color = getToneColors(input.tone ?? 'loading').primary;

  context.fillStyle = '#020202';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;

  for (let y = 0; y < LOGICAL_PANEL_HEIGHT; y += 1) {
    for (let x = 0; x < LOGICAL_PANEL_WIDTH; x += 1) {
      if (pixels[y * LOGICAL_PANEL_WIDTH + x] === 0) continue;

      const left = Math.round(x * scaleX);
      const top = Math.round(y * scaleY);
      const width = Math.max(1, Math.round(scaleX));
      const height = Math.max(1, Math.round(scaleY));

      context.beginPath();
      context.arc(
        left + width / 2,
        top + height / 2,
        Math.max(0.5, Math.min(width, height) * 0.42),
        0,
        Math.PI * 2,
      );
      context.fill();
    }
  }
}

export { DIODE_SCALE };
