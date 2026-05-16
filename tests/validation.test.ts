import { describe, expect, it } from 'vitest'

import {
  isValidDisplayResourceId,
  isValidOwnerId,
  parseCreateDisplayInput,
  parseUpdateDisplayInput,
} from '../functions/_lib/validation'

describe('validation helpers', () => {
  it('accepts valid owner identifiers', () => {
    expect(isValidOwnerId('Ab12Cd34')).toBe(true)
    expect(isValidOwnerId('short')).toBe(false)
  })

  it('normalizes create payloads and applies defaults', () => {
    expect(
      parseCreateDisplayInput({
        owner_id: 'Ab12Cd34',
        name: ' Central board ',
        site_id: ' 9180 ',
        site_name: ' T-Centralen ',
      }),
    ).toEqual({
      owner_id: 'Ab12Cd34',
      name: 'Central board',
      site_id: '9180',
      site_name: 'T-Centralen',
      refresh_interval: 30,
    })
  })

  it('supports partial updates', () => {
    expect(
      parseUpdateDisplayInput({
        name: ' Updated ',
        site_id: null,
        refresh_interval: 60,
      }),
    ).toEqual({
      name: 'Updated',
      site_id: null,
      refresh_interval: 60,
    })
  })

  it('validates display resource identifiers', () => {
    expect(isValidDisplayResourceId('Ab12Cd34-Xy98Lm56Qr12')).toBe(true)
    expect(isValidDisplayResourceId('bad-id')).toBe(false)
  })
})
