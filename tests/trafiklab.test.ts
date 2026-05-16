import { describe, expect, it } from 'vitest'

import {
  buildDeparturesUrl,
  buildStopSearchUrl,
  normalizeDeparturesResponse,
  normalizeStopSearchResponse,
} from '../functions/_lib/trafiklab'

describe('Trafiklab URL helpers', () => {
  it('builds the stop-search URL with expected query params', () => {
    const url = buildStopSearchUrl('T-Centralen')

    expect(url.toString()).toBe(
      'https://transport.integration.sl.se/v1/sites?expand=true&q=T-Centralen',
    )
  })

  it('builds the departures URL for a site id', () => {
    const url = buildDeparturesUrl('9180')
    expect(url.toString()).toBe('https://transport.integration.sl.se/v1/sites/9180/departures')
  })

  it('normalizes stop-search responses into the SLPanel contract', () => {
    expect(
      normalizeStopSearchResponse('T-Centralen', {
        results: [
          {
            id: 9180,
            name: 'T-Centralen',
            type: 'STATION',
            stop_area: {
              name: 'T-Centralen',
            },
          },
        ],
      }),
    ).toEqual({
      query: 'T-Centralen',
      results: [
        {
          site_id: '9180',
          name: 'T-Centralen',
          type: 'STATION',
          stop_area_name: 'T-Centralen',
        },
      ],
    })
  })

  it('normalizes departures into service-specific display data', () => {
    expect(
      normalizeDeparturesResponse(
        '9180',
        {
          departures: [
            {
              destination: 'Skarpnäck',
              expected: '2026-05-16T12:05:00Z',
              scheduled: '2026-05-16T12:04:00Z',
              state: 'EXPECTED',
              line: {
                designation: '17',
                transport_mode: 'METRO',
              },
              stop_point: {
                designation: '2',
              },
            },
          ],
        },
        new Date('2026-05-16T12:00:00Z'),
      ),
    ).toEqual({
      site_id: '9180',
      departures: [
        {
          line_number: '17',
          destination: 'Skarpnäck',
          display_time: '5 min',
          minutes_until_departure: 5,
          scheduled_at: '2026-05-16T12:04:00Z',
          expected_at: '2026-05-16T12:05:00Z',
          transport_mode: 'METRO',
          platform: '2',
          state: 'EXPECTED',
        },
      ],
    })
  })
})
