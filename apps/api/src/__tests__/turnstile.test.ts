import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { verifyTurnstile } from '../lib/turnstile'

describe('verifyTurnstile', () => {
  const originalFetch = globalThis.fetch
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('bypasses when secret is unset (enforced=false, ok=true)', async () => {
    const result = await verifyTurnstile({ secret: undefined, token: 'whatever' })
    expect(result).toEqual({ enforced: false, ok: true })
  })

  it('rejects missing token when enforcement is on', async () => {
    const result = await verifyTurnstile({ secret: 's', token: null })
    expect(result).toEqual({ enforced: true, ok: false, error: 'missing-token' })
  })

  it('returns ok when siteverify says success', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    ) as never
    const result = await verifyTurnstile({ secret: 's', token: 't' })
    expect(result).toEqual({ enforced: true, ok: true })
  })

  it('surfaces siteverify error-codes', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
      }),
    ) as never
    const result = await verifyTurnstile({ secret: 's', token: 't' })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('invalid-input-response')
  })

  it('treats unreachable siteverify as failure (no fail-open)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('boom')
    }) as never
    const result = await verifyTurnstile({ secret: 's', token: 't' })
    expect(result).toEqual({ enforced: true, ok: false, error: 'siteverify-unreachable' })
  })
})
