import { describe, expect, it } from 'vitest'
import { parseEnv } from '../lib/env'

describe('parseEnv', () => {
  it('accepts development without DATABASE_URL', () => {
    const env = parseEnv({ NODE_ENV: 'development' })
    expect(env.NODE_ENV).toBe('development')
    expect(env.DATABASE_URL).toBeUndefined()
  })

  it('throws in staging when DATABASE_URL missing', () => {
    expect(() => parseEnv({ NODE_ENV: 'staging' })).toThrow(/DATABASE_URL is required/)
  })

  it('throws in production when DATABASE_URL missing', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL is required/)
  })

  it('accepts production when DATABASE_URL is set', () => {
    const env = parseEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })
    expect(env.DATABASE_URL).toBe('postgres://x')
  })
})
