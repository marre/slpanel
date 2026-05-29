import {
  parseDeparturesQuery,
  parseDisplayCreateInput,
  parseDisplayUpdateInput,
  parseStopsSearchQuery,
  validateDisplayResourceId,
  validateOwnerId,
} from './validation';

describe('validation helpers', () => {
  it('accepts valid ids and rejects invalid ones', () => {
    expect(validateOwnerId('aB3xZ9kQ')).toBe('aB3xZ9kQ');
    expect(validateDisplayResourceId('aB3xZ9kQ-fG7mNpQr2wLt')).toBe(
      'aB3xZ9kQ-fG7mNpQr2wLt',
    );

    expect(() => validateOwnerId('short')).toThrow(/8 alphanumeric/);
    expect(() => validateDisplayResourceId('invalid')).toThrow(/<owner-id>/);
  });

  it('normalizes create payloads and uppercases transport modes', () => {
    expect(
      parseDisplayCreateInput({
        owner_id: 'aB3xZ9kQ',
        name: 'Platform 1',
        line_numbers: ['17', '17', '18'],
        directions: ['Hagsätra'],
        modes: ['metro', 'metro', 'tram'],
      }),
    ).toEqual({
      owner_id: 'aB3xZ9kQ',
      name: 'Platform 1',
      site_id: null,
      site_name: null,
      refresh_interval: 30,
      line_numbers: ['17', '18'],
      directions: ['Hagsätra'],
      modes: ['METRO', 'TRAM'],
    });
  });

  it('parses partial updates and departures query filters', () => {
    expect(
      parseDisplayUpdateInput({
        refresh_interval: 45,
        line_numbers: ['19'],
        site_id: null,
      }),
    ).toEqual({
      refresh_interval: 45,
      line_numbers: ['19'],
      site_id: null,
    });

    expect(
      parseDeparturesQuery(
        '1011',
        new URLSearchParams({
          line: '17,18',
          direction: 'Hagsätra',
          mode: 'metro',
          forecast: '45',
        }),
      ),
    ).toEqual({
      site_id: '1011',
      lines: ['17', '18'],
      directions: ['Hagsätra'],
      modes: ['METRO'],
      forecast: 45,
    });
  });

  it('enforces minimum stop search query length', () => {
    expect(parseStopsSearchQuery('Slussen')).toBe('Slussen');
    expect(() => parseStopsSearchQuery('S')).toThrow(/at least 2 characters/);
  });
});
