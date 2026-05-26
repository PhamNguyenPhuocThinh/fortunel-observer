import { describe, expect, it } from 'vitest'
import { __testing } from '../auth/api-key'
import { randomBytes } from '@noble/hashes/utils.js'

const { hashSecret, verifyHash, PREFIX, KEY_PREFIX_LEN } = __testing

describe('api-key crypto', () => {
  it('hashSecret produces a parseable scrypt:<n>:<salt>:<hash> stored form', () => {
    const salt = randomBytes(16)
    const stored = hashSecret('hello-world', salt)
    const parts = stored.split(':')
    expect(parts.length).toBe(4)
    expect(parts[0]).toBe('scrypt')
    expect(Number(parts[1])).toBeGreaterThan(0)
    expect(parts[2]?.length).toBe(32) // 16 bytes hex
    expect(parts[3]?.length).toBe(64) // 32-byte dk hex
  })

  it('verifyHash succeeds for the same secret', () => {
    const salt = randomBytes(16)
    const stored = hashSecret('correct-horse-battery-staple', salt)
    expect(verifyHash('correct-horse-battery-staple', stored)).toBe(true)
  })

  it('verifyHash fails for a different secret', () => {
    const salt = randomBytes(16)
    const stored = hashSecret('correct-horse-battery-staple', salt)
    expect(verifyHash('wrong-secret', stored)).toBe(false)
  })

  it('verifyHash rejects malformed stored values', () => {
    expect(verifyHash('any', 'garbage')).toBe(false)
    expect(verifyHash('any', 'sha256:1:aa:bb')).toBe(false)
    expect(verifyHash('any', 'scrypt:not-a-number:aa:bb')).toBe(false)
  })

  it('PREFIX and KEY_PREFIX_LEN constants are stable', () => {
    expect(PREFIX).toBe('fo_')
    expect(KEY_PREFIX_LEN).toBe(12)
  })
})
