import { describe, expect, it } from 'vitest'

import {
  createFullDisplayId,
  createDisplay,
  type D1DatabaseLike,
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

  it('creates the owner row before inserting a display', async () => {
    const operations: Array<{ query: string; values: unknown[] }> = []
    const insertedDisplayId = 'Ab12Cd34-AaAaAaAaAaAa'

    const db: D1DatabaseLike = {
      prepare(query: string) {
        let boundValues: unknown[] = []
        const statement = {
          bind(...values: unknown[]) {
            boundValues = values
            return statement
          },
          async run() {
            operations.push({ query, values: boundValues })
            return { success: true }
          },
          async all<T>() {
            operations.push({ query, values: boundValues })
            return { results: [] as T[] }
          },
          async first<T>() {
            operations.push({ query, values: boundValues })

            if (query.includes('SELECT id, owner_id, display_id')) {
              return {
                id: insertedDisplayId,
                owner_id: 'Ab12Cd34',
                display_id: 'AaAaAaAaAaAa',
                name: 'Kitchen',
                site_id: '9180',
                site_name: 'T-Centralen',
                refresh_interval: 30,
                created_at: '2026-05-16T12:00:00Z',
                updated_at: '2026-05-16T12:00:00Z',
              } as T
            }

            return null
          },
        }

        return statement
      },
    }

    const created = await createDisplay(db, {
      owner_id: 'Ab12Cd34',
      name: 'Kitchen',
      site_id: '9180',
      site_name: 'T-Centralen',
      refresh_interval: 30,
    })

    expect(operations[0]).toEqual({
      query: 'INSERT OR IGNORE INTO owners (id) VALUES (?)',
      values: ['Ab12Cd34'],
    })
    expect(operations[1]?.query).toContain('INSERT INTO displays')
    expect(created.id).toBe(insertedDisplayId)
  })
})
