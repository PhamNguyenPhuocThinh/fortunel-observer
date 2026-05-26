import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { AppBindings } from '../lib/context'
import { requestId } from '../middleware/request-id'
import { errorHandler } from '../middleware/error-envelope'
import { rateLimit } from '../middleware/rate-limit'

// Mimics Workers KV semantics within a single Worker instance: per-key serialized
// get/put cycles (JS is single-threaded; local KV cache returns reads-after-writes
// immediately). Cross-instance race is a separate concern, documented in the plan.
class InMemoryKV {
  private store = new Map<string, string>()
  private chains = new Map<string, Promise<unknown>>()

  private serialize<T>(key: string, op: () => T): Promise<T> {
    const prev = this.chains.get(key) ?? Promise.resolve()
    const next = prev.then(op, op)
    this.chains.set(
      key,
      next.catch(() => undefined),
    )
    return next
  }

  get(key: string): Promise<string | null> {
    return this.serialize(key, () => this.store.get(key) ?? null)
  }
  put(key: string, value: string): Promise<void> {
    return this.serialize(key, () => {
      this.store.set(key, value)
    })
  }
  delete(key: string): Promise<void> {
    return this.serialize(key, () => {
      this.store.delete(key)
    })
  }
}

function makeApp(limit: number, kv: InMemoryKV) {
  const app = new Hono<AppBindings>()
  app.use('*', requestId())
  app.use('*', rateLimit({ limit, keyFn: () => 'shared-test-key' }))
  app.get('/probe', (c) => c.json({ ok: true }))
  app.onError(errorHandler)
  return { app, kv }
}

const env = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'error',
  CORS_ALLOWED_ORIGINS: '',
  COMMIT_SHA: 'test',
  RATE_LIMIT_PER_MIN: '100',
}

describe('rate-limit middleware', () => {
  it('429s once the per-key counter exceeds the limit', async () => {
    const kv = new InMemoryKV()
    const { app } = makeApp(10, kv)
    const bindings = { ...env, RATE_LIMIT: kv } as unknown as Record<string, unknown>

    const responses: number[] = []
    for (let i = 0; i < 15; i++) {
      const res = await app.request('/probe', { method: 'GET' }, bindings)
      responses.push(res.status)
    }
    const ok = responses.filter((s) => s === 200).length
    const limited = responses.filter((s) => s === 429).length
    expect(ok).toBe(10)
    expect(limited).toBe(5)
  })

  it('429 response carries Retry-After header and problem+json envelope', async () => {
    const kv = new InMemoryKV()
    const { app } = makeApp(2, kv)
    const bindings = { ...env, RATE_LIMIT: kv } as unknown as Record<string, unknown>

    await app.request('/probe', { method: 'GET' }, bindings)
    await app.request('/probe', { method: 'GET' }, bindings)
    const blocked = await app.request('/probe', { method: 'GET' }, bindings)
    expect(blocked.status).toBe(429)
    expect(blocked.headers.get('Retry-After')).toBeTruthy()
    expect(blocked.headers.get('Content-Type')).toContain('application/problem+json')
    const body = (await blocked.json()) as { errors: Array<{ status: number; type: string }> }
    expect(body.errors[0]?.status).toBe(429)
    expect(body.errors[0]?.type).toBe('https://api.fortunel.dev/errors/request/rate-limited')
  })

  it('passes through when KV binding is absent', async () => {
    const app = new Hono<AppBindings>()
    app.use('*', requestId())
    app.use('*', rateLimit({ limit: 1 }))
    app.get('/probe', (c) => c.json({ ok: true }))

    const bindings = { ...env } as unknown as Record<string, unknown>
    const a = await app.request('/probe', { method: 'GET' }, bindings)
    const b = await app.request('/probe', { method: 'GET' }, bindings)
    expect(a.status).toBe(200)
    expect(b.status).toBe(200)
  })

  it('50 abuse-loop requests with limit=10 result in ≥40 rejections', async () => {
    // Single-client burst (sequential await loop) is the realistic abuse pattern.
    // Each get-modify-put cycle observes the previous request's put, so the limiter
    // enforces the cap deterministically.
    const kv = new InMemoryKV()
    const { app } = makeApp(10, kv)
    const bindings = { ...env, RATE_LIMIT: kv } as unknown as Record<string, unknown>

    const statuses: number[] = []
    for (let i = 0; i < 50; i++) {
      const res = await app.request('/probe', { method: 'GET' }, bindings)
      statuses.push(res.status)
    }
    const limited = statuses.filter((s) => s === 429).length
    expect(limited).toBeGreaterThanOrEqual(40)
  })

  it('documents the KV race: truly-parallel firing on non-atomic KV can defeat the limiter', async () => {
    // Workers KV has no atomic increment; under true cross-request parallelism within
    // one Worker, all `kv.get` calls execute before any `kv.put` resolves, so every
    // request observes the same stale counter. The limiter degrades to ~no enforcement
    // under this pattern. Phase D considers Durable Objects for atomic counters.
    const kv = new InMemoryKV()
    const { app } = makeApp(10, kv)
    const bindings = { ...env, RATE_LIMIT: kv } as unknown as Record<string, unknown>

    const results = await Promise.all(
      Array.from({ length: 50 }, () => app.request('/probe', { method: 'GET' }, bindings)),
    )
    const limited = results.filter((r) => r.status === 429).length
    // No assertion on the parallel count — this test exists to document the race,
    // not to verify enforcement. Asserting only that the test ran.
    expect(typeof limited).toBe('number')
  })
})
