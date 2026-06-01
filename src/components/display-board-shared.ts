import type { DepartureRecord } from '@/api/types';
import type { RenderOptions } from '@/font/sl-font-renderer';

export const LOGICAL_PANEL_WIDTH = 128;
export const LOGICAL_PANEL_HEIGHT = 32;
export const DIODE_SCALE = 4;
export const PANEL_WIDTH = scaleBoardUnit(LOGICAL_PANEL_WIDTH);
export const PANEL_HEIGHT = scaleBoardUnit(LOGICAL_PANEL_HEIGHT);

export type BoardTone = 'live' | 'loading' | 'empty' | 'error';

export interface DisplayBoardProps {
  displayName: string;
  siteName: string | null;
  departures: DepartureRecord[];
  tone: BoardTone;
  headline: string;
  detail: string;
}

export interface MarqueeContent {
  text: string;
  interruptible: boolean;
}

export interface BoardGeometry {
  rowYs: readonly [number, number];
  panelPadding: number;
  leadDepartureGap: number;
  marqueeSpeed: number;
}

export type BoardFontOptions = Pick<
  RenderOptions,
  'font' | 'gap' | 'pixelShape' | 'scale'
>;

export const CLASSIC_BOARD_FONT_OPTIONS: BoardFontOptions = {
  gap: 1,
  pixelShape: 'circle',
  scale: DIODE_SCALE,
};

export function createBoardGeometry(unitScale = 1): BoardGeometry {
  return {
    rowYs: [
      scaleBoardUnit(4, unitScale),
      scaleBoardUnit(18, unitScale),
    ] as const,
    panelPadding: scaleBoardUnit(2, unitScale),
    leadDepartureGap: scaleBoardUnit(5, unitScale),
    marqueeSpeed: scaleBoardUnit(18, unitScale),
  };
}

export function buildMarqueeContent(input: {
  departures: DepartureRecord[];
  tone: BoardTone;
  headline: string;
  detail: string;
}): MarqueeContent {
  if (input.tone === 'live' && input.departures.length > 0) {
    const followingDepartures = input.departures
      .slice(1, 4)
      .map((departure) => formatCompactDeparture(departure));

    return {
      text: followingDepartures.join('     ') || 'No later departures',
      interruptible: false,
    };
  }

  return {
    text: [input.headline ?? '', input.detail].filter(Boolean).join('     '),
    interruptible: true,
  };
}

export function shouldSwapMarqueeImmediately(
  activeContent: MarqueeContent,
  pendingContent: MarqueeContent,
) {
  return (
    activeContent.interruptible && activeContent.text !== pendingContent.text
  );
}

export function buildAccessibleSummary(input: {
  departures: DepartureRecord[];
  headline: string;
  detail: string;
  tone: BoardTone;
  siteName: string | null;
}) {
  if (input.tone === 'live' && input.departures.length > 0) {
    const nextDeparture = input.departures[0];

    return [
      input.siteName ? `Stop ${input.siteName}.` : '',
      `Next departure: line ${nextDeparture.line_number} to ${nextDeparture.destination}, ${nextDeparture.display_time}.`,
      input.departures.length > 1
        ? `Later departures include ${input.departures
            .slice(1, 4)
            .map(
              (departure) =>
                `line ${departure.line_number} to ${departure.destination} in ${departure.display_time}`,
            )
            .join(', ')}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [input.headline, input.detail].filter(Boolean).join(' ');
}

export function formatCompactDeparture(departure: DepartureRecord) {
  return `${departure.line_number} ${departure.destination} ${departure.display_time}`.trim();
}

export function getToneColors(tone: BoardTone) {
  switch (tone) {
    case 'error':
      return {
        primary: '#ffd7a0',
        secondary: '#ffbf6b',
      };
    case 'loading':
      return {
        primary: '#ffbe64',
        secondary: '#ff9b29',
      };
    case 'empty':
      return {
        primary: '#ffc978',
        secondary: '#ffae43',
      };
    default:
      return {
        primary: '#ffb347',
        secondary: '#ff9625',
      };
  }
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function buildBoardKey(displayName: string, siteName: string | null) {
  return `${displayName}::${siteName ?? ''}`;
}

export function scaleBoardUnit(value: number, unitScale = DIODE_SCALE) {
  return value * unitScale;
}
