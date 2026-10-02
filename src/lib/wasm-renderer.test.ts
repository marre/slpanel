import { afterEach, expect, it, vi } from 'vitest';

import { createWasmBoard } from '@/lib/wasm-renderer';

afterEach(() => vi.restoreAllMocks());

it('paints independent RGB565 pixels from the WASM frame', async () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const framePointer = 1024;
  const frame = new DataView(memory.buffer, framePointer, 8192);
  frame.setUint16(0, 31 << 11, true);
  frame.setUint16(2, 63 << 5, true);
  frame.setUint16(4, 31, true);
  frame.setUint16(6, 1 << 5, true);
  frame.setUint16(8, 0xffff, true);
  const exports = {
    memory,
    slpanel_alloc: () => 16,
    slpanel_dealloc: vi.fn(),
    slpanel_renderer_new: () => 1,
    slpanel_renderer_free: vi.fn(),
    slpanel_renderer_set_input: () => 0,
    slpanel_renderer_draw: () => 0,
    slpanel_renderer_frame_ptr: () => framePointer,
    slpanel_renderer_frame_len: () => 8192,
  };
  vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({
    instance: { exports },
  } as unknown as WebAssembly.Instance);

  const canvas = document.createElement('canvas');
  const painted: string[] = [];
  const context = {
    fillStyle: '',
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill(this: CanvasRenderingContext2D) {
      painted.push(String(this.fillStyle));
    },
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  const fetcher = vi.fn().mockResolvedValue(
    new Response(new Uint8Array([0, 97, 115, 109]), {
      headers: { 'content-type': 'application/wasm' },
    }),
  );
  const board = await createWasmBoard(context, { fetch: fetcher });
  await board.drawFrame(canvas, '{}');
  expect(painted).toEqual([
    'rgb(255, 0, 0)',
    'rgb(0, 255, 0)',
    'rgb(0, 0, 255)',
    'rgb(0, 4, 0)',
    'rgb(255, 255, 255)',
  ]);
  board.dispose();
});
