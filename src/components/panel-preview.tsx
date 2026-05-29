import { useEffect, useRef } from 'react';

import {
  measureText,
  renderText,
  renderTextLine,
} from '@/font/sl-font-renderer';

const PANEL_WIDTH = 128;
const PANEL_HEIGHT = 32;

export function PanelPreview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    context.fillStyle = '#030303';
    context.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);

    const line = '17';
    const destination = 'Hagsätra';
    const eta = '1 min';
    const etaWidth = measureText(eta, { scale: 1 });

    renderText(context, line, 2, 3, { scale: 1, color: '#ff9c21' });
    renderText(context, destination, 18, 3, { scale: 1, color: '#ffb347' });
    renderText(context, eta, PANEL_WIDTH - etaWidth - 2, 3, {
      scale: 1,
      color: '#ffd9a1',
    });

    renderTextLine(
      context,
      '17 Hagsätra 5 min     18 Farsta strand 7 min     19 Skarpnäck 12 min',
      2,
      19,
      PANEL_WIDTH - 4,
      { scale: 1, color: '#ff9c21' },
    );
  }, []);

  return (
    <div className="inline-flex rounded-[2rem] border border-[var(--panel-border)] bg-[var(--panel-chassis)] p-4 shadow-[inset_0_0_0_1px_rgba(255,188,85,0.08),0_22px_48px_rgba(0,0,0,0.42)]">
      <div className="rounded-[1.25rem] border border-black/60 bg-black p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]">
        <canvas
          ref={canvasRef}
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          className="h-32 w-[32rem] max-w-full rounded-[0.4rem] bg-black [image-rendering:pixelated]"
        />
      </div>
    </div>
  );
}
