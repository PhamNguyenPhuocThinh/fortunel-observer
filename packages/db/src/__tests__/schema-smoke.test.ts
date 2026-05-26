import { describe, expect, it } from 'vitest'
import * as schema from '../schema'

describe('schema module', () => {
  it('exports every table', () => {
    const expected = [
      'users',
      'apiKeys',
      'sessions',
      'accounts',
      'projects',
      'posts',
      'contactMessages',
    ] as const

    for (const name of expected) {
      expect(schema, `missing export: ${name}`).toHaveProperty(name)
    }
  })

  it('every non-auth table carries owner_id', () => {
    const ownerScoped = ['apiKeys', 'projects', 'posts', 'contactMessages'] as const
    for (const name of ownerScoped) {
      const table = schema[name] as unknown as Record<string, unknown>
      expect(table, `${name} missing ownerId column`).toHaveProperty('ownerId')
    }
  })
})
