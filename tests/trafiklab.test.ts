import { describe, expect, it } from 'vitest'

import { buildDeparturesUrl, buildStopSearchUrl } from '../functions/_lib/trafiklab'

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
})
