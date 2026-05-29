import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  writable: true,
  value: vi.fn(() => {
    return {
      fillRect: vi.fn(),
      fillStyle: '#000000',
    } as unknown as CanvasRenderingContext2D;
  }),
});
