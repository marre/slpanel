import { describe, expect, it } from 'vitest'

import {
  createFullDisplayId,
  generateDisplayId,
  mapDisplayRow,
} from '../functions/_lib/displays'

describe('display helpers', () => {
  it('generates a 12-character alphanumeric display id', () => {
    const displayId = generateDisplayId(() => 0.1)
    expect(displayId).toHaveLength(12)
    expect(displayId).toMatch(/^[A-Za-z0-9]{12}$/)
  })

  it('combines owner and display ids into the resource id', () => {
    expect(createFullDisplayId('Ab12Cd34', 'Xy98Lm56Qr12')).toBe('Ab12Cd34-Xy98Lm56Qr12')
  })

  it('maps database rows to API payloads', () => {
    expect(
      mapDisplayRow({
        id: 'Ab12Cd34-Xy98Lm56Qr12',
        owner_id: 'Ab12Cd34',
        display_id: 'Xy98Lm56Qr12',
        name: 'Kitchen',
        site_id: '9180',
        site_name: 'T-Centralen',
        refresh_interval: 45,
        created_at: '2026-05-16T12:00:00Z',
        updated_at: '2026-05-16T12:01:00Z',
      }),
    ).toEqual({
      id: 'Ab12Cd34-Xy98Lm56Qr12',
      owner_id: 'Ab12Cd34',
      display_id: 'Xy98Lm56Qr12',
      name: 'Kitchen',
      site_id: '9180',
      site_name: 'T-Centralen',
      refresh_interval: 45,
      created_at: '2026-05-16T12:00:00Z',
      updated_at: '2026-05-16T12:01:00Z',
    })
  })
})
