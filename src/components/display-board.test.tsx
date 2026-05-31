import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DepartureRecord } from '@/api/types';

const { measureTextMock, renderTextMock, renderTextLineMock } = vi.hoisted(
  () => ({
    measureTextMock: vi.fn((text: string) => Math.max(text.length * 6, 1)),
    renderTextMock: vi.fn(),
    renderTextLineMock: vi.fn(),
  }),
);

vi.mock('@/font/sl-font-renderer', () => ({
  measureText: measureTextMock,
  renderText: renderTextMock,
  renderTextLine: renderTextLineMock,
}));

import { DisplayBoard } from '@/components/display-board';

describe('DisplayBoard', () => {
  let animationFrameCallback: FrameRequestCallback | null = null;
  let nextAnimationFrameId = 1;

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      fillStyle: '#000000',
    } as unknown as CanvasRenderingContext2D);

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrameCallback = callback;
        const id = nextAnimationFrameId;
        nextAnimationFrameId += 1;
        return id;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    animationFrameCallback = null;
    nextAnimationFrameId = 1;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    measureTextMock.mockClear();
    renderTextMock.mockClear();
    renderTextLineMock.mockClear();
  });

  it('keeps the marquee moving when live departures refresh', () => {
    const initialDepartures: DepartureRecord[] = [
      createDeparture('17', 'Hagsatra', '1 min', 1),
      createDeparture('18', 'Farsta strand', '4 min', 4),
      createDeparture('19', 'Skarpnack', '7 min', 7),
    ];
    const refreshedDepartures: DepartureRecord[] = [
      createDeparture('17', 'Hagsatra', 'Now', 0),
      createDeparture('18', 'Farsta strand', '3 min', 3),
      createDeparture('19', 'Skarpnack', '6 min', 6),
    ];

    const { rerender } = render(
      <DisplayBoard
        displayName="Southbound platform"
        siteName="Slussen"
        departures={initialDepartures}
        tone="live"
        headline="Live departures"
        detail="Board is running"
      />,
    );

    renderTextMock.mockClear();
    animationFrameCallback?.(1_000);

    const marqueeTextBeforeRefresh = readPrimaryMarqueeText();

    expect(marqueeTextBeforeRefresh).toContain('18 Farsta strand 4 min');
    expect(marqueeTextBeforeRefresh).not.toContain('Stop Slussen');
    expect(marqueeTextBeforeRefresh).not.toContain('Refresh 30');
    expect(readRowTwoTexts()).toHaveLength(1);

    renderTextMock.mockClear();
    animationFrameCallback?.(2_000);

    const marqueeXBeforeRefresh = readPrimaryMarqueeX();

    expect(marqueeXBeforeRefresh).toBeLessThan(128);

    renderTextMock.mockClear();

    rerender(
      <DisplayBoard
        displayName="Southbound platform"
        siteName="Slussen"
        departures={refreshedDepartures}
        tone="live"
        headline="Live departures"
        detail="Board is running"
      />,
    );

    renderTextMock.mockClear();
    animationFrameCallback?.(3_000);

    const marqueeXAfterRefresh = readPrimaryMarqueeX();

    expect(marqueeXAfterRefresh).toBeLessThan(marqueeXBeforeRefresh);
  });

  it('lets the full departure set scroll out before restarting', () => {
    const liveDepartures: DepartureRecord[] = [
      createDeparture('17', 'Hagsatra', '1 min', 1),
      createDeparture('18', 'Farsta strand', '4 min', 4),
      createDeparture('19', 'Skarpnack', '7 min', 7),
    ];
    const expectedMarqueeText = '18 Farsta strand 4 min     19 Skarpnack 7 min';

    render(
      <DisplayBoard
        displayName="Southbound platform"
        siteName="Slussen"
        departures={liveDepartures}
        tone="live"
        headline="Live departures"
        detail="Board is running"
      />,
    );

    renderTextMock.mockClear();
    animationFrameCallback?.(1_000);

    expect(readRowTwoTexts()).toEqual([expectedMarqueeText]);

    const restartTimestamp =
      1_000 +
      Math.ceil(
        ((128 + Number(measureTextMock(expectedMarqueeText))) / 18) * 1_000,
      );

    renderTextMock.mockClear();
    animationFrameCallback?.(restartTimestamp);

    expect(readRowTwoTexts()).toEqual([expectedMarqueeText]);
    expect(readPrimaryMarqueeX()).toBe(128);
  });

  it('switches from empty-state text to live departures on the next frame', () => {
    const liveDepartures: DepartureRecord[] = [
      createDeparture('17', 'Hagsatra', '1 min', 1),
      createDeparture('18', 'Farsta strand', '4 min', 4),
      createDeparture('19', 'Skarpnack', '7 min', 7),
    ];

    const { rerender } = render(
      <DisplayBoard
        displayName="Southbound platform"
        siteName="Slussen"
        departures={[]}
        tone="empty"
        headline="No departures right now"
        detail="The board is live, but nothing matched the current stop and filters."
      />,
    );

    renderTextMock.mockClear();
    animationFrameCallback?.(1_000);

    expect(readPrimaryMarqueeText()).toContain('No departures right now');

    rerender(
      <DisplayBoard
        displayName="Southbound platform"
        siteName="Slussen"
        departures={liveDepartures}
        tone="live"
        headline="Live departures"
        detail="The board is running"
      />,
    );

    renderTextMock.mockClear();
    animationFrameCallback?.(2_000);

    expect(readPrimaryMarqueeText()).toContain('18 Farsta strand 4 min');
    expect(readPrimaryMarqueeText()).not.toContain('No departures right now');
  });
});

function createDeparture(
  lineNumber: string,
  destination: string,
  displayTime: string,
  minutesUntilDeparture: number,
): DepartureRecord {
  return {
    line_number: lineNumber,
    destination,
    display_time: displayTime,
    minutes_until_departure: minutesUntilDeparture,
    scheduled_at: '2026-05-29T12:00:00Z',
    expected_at: '2026-05-29T12:00:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED',
  };
}

function readPrimaryMarqueeX() {
  const rowTwoCalls = renderTextMock.mock.calls.filter(
    (call) => call[3] === 19,
  );
  const primaryMarqueeCall = rowTwoCalls[0];

  if (!primaryMarqueeCall) {
    throw new Error('Expected the board to render the marquee row.');
  }

  return primaryMarqueeCall[2] as number;
}

function readPrimaryMarqueeText() {
  const rowTwoCalls = readRowTwoCalls();
  const primaryMarqueeCall = rowTwoCalls[0];

  if (!primaryMarqueeCall) {
    throw new Error('Expected the board to render the marquee row.');
  }

  return primaryMarqueeCall[1] as string;
}

function readRowTwoTexts() {
  return readRowTwoCalls().map((call) => call[1] as string);
}

function readRowTwoCalls() {
  return renderTextMock.mock.calls.filter((call) => call[3] === 19);
}
