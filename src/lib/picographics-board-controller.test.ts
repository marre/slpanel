import { describe, expect, it, vi } from 'vitest';

import { localPicographicsBoardController } from '@/lib/picographics-board-controller';

describe('localPicographicsBoardController', () => {
  it('creates a scrolling marquee state for later departures', () => {
    const state = localPicographicsBoardController.createMarqueeState({
      departures: [
        createDeparture('17', 'Hagsatra', '1 min'),
        createDeparture('18', 'Farsta strand', '4 min'),
        createDeparture('19', 'Skarpnack', '7 min'),
      ],
      tone: 'live',
      headline: 'Live departures',
      detail: 'Board is running',
    });

    expect(state.activeContent.text).toContain('18 Farsta strand 4 min');
    expect(state.marqueeOffset).toBe(128);
  });

  it('advances the marquee and resets it after the content scrolls away', async () => {
    const graphics = createGraphics(24);
    const initialState = {
      activeContent: {
        text: 'Later departures',
        interruptible: false,
      },
      pendingContent: {
        text: 'Later departures',
        interruptible: false,
      },
      marqueeOffset: 5,
    };

    const nextState =
      await localPicographicsBoardController.advanceMarqueeState(
        graphics,
        initialState,
        {
          departures: [createDeparture('17', 'Hagsatra', '1 min')],
          tone: 'live',
          headline: 'Live departures',
          detail: 'Board is running',
        },
        10,
      );

    expect(nextState.marqueeOffset).toBe(128);
    expect(nextState.activeContent.text).toBe('No later departures');
  });

  it('draws the lead departure and marquee through the Picographics surface', () => {
    const graphics = createGraphics(18);
    const marqueeState = localPicographicsBoardController.createMarqueeState({
      departures: [
        createDeparture('17', 'Hagsatra', '1 min'),
        createDeparture('18', 'Farsta strand', '4 min'),
      ],
      tone: 'live',
      headline: 'Live departures',
      detail: 'Board is running',
    });

    localPicographicsBoardController.drawBoard(
      graphics,
      {
        departures: [
          createDeparture('17', 'Hagsatra', '1 min'),
          createDeparture('18', 'Farsta strand', '4 min'),
        ],
        tone: 'live',
        headline: 'Live departures',
        detail: 'Board is running',
      },
      marqueeState,
    );

    expect(graphics.clear).toHaveBeenCalledTimes(1);
    expect(graphics.text).toHaveBeenCalledWith('17', 2, 4);
    expect(graphics.text).toHaveBeenCalledWith('1 min', expect.any(Number), 4);
    expect(graphics.update).toHaveBeenCalledTimes(1);
  });
});

function createDeparture(
  lineNumber: string,
  destination: string,
  displayTime: string,
) {
  return {
    line_number: lineNumber,
    destination,
    display_time: displayTime,
    minutes_until_departure: 1,
    scheduled_at: '2026-05-29T12:00:00Z',
    expected_at: '2026-05-29T12:01:00Z',
    transport_mode: 'METRO',
    platform: '2',
    state: 'EXPECTED' as const,
  };
}

function createGraphics(measurement: number) {
  return {
    create_pen: vi.fn(),
    set_pen: vi.fn(),
    clear: vi.fn(),
    pixel: vi.fn(),
    rectangle: vi.fn(),
    text: vi.fn(),
    measure_text: vi.fn(() => measurement),
    update: vi.fn(),
  };
}
