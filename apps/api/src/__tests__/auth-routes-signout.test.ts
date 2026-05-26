/**
 * Sign-out must invalidate the KV session cache so a replayed cookie cannot
 * authenticate against the 60s-cached entry after Better Auth wipes the DB row.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { AppBindings } from '../lib/context'

const handlerMock = vi.fn()
vi.mock('../auth/config', () => ({
  getAuth: vi.fn(() => ({
    db: {},
    auth: { handler: handlerMock },
  })),
}))

import { registerAuthRoutes } from '../routes/auth'

class FakeKV {
  store = new Map<string, string>()
  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }
  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}

function makeApp(kv: FakeKV) {
  const app = new Hono<AppBindings>()
  registerAuthRoutes(app)
  return (path: string, init: RequestInit = {}) =>
    app.request(path, init, { SESSION_CACHE: kv as unknown as KVNamespace })
}

beforeEach(() => {
  handlerMock.mockReset()
})

describe('POST /auth/sign-out', () => {
  it('invalidates the cached session after BA succeeds', async () => {
    const kv = new FakeKV()
    kv.store.set('sess:abc123', JSON.stringify({ userId: 'u1', expiresAt: '2099-01-01' }))
    handlerMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const res = await makeApp(kv)('/auth/sign-out', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=abc123.signature' },
    })

    expect(res.status).toBe(200)
    expect(kv.store.has('sess:abc123')).toBe(false)
  })

  it('does not invalidate when BA returns a failure', async () => {
    const kv = new FakeKV()
    kv.store.set('sess:abc123', JSON.stringify({ userId: 'u1', expiresAt: '2099-01-01' }))
    handlerMock.mockResolvedValueOnce(new Response('{}', { status: 401 }))

    await makeApp(kv)('/auth/sign-out', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=abc123.signature' },
    })

    expect(kv.store.has('sess:abc123')).toBe(true)
  })

  it('leaves KV alone for non-sign-out auth routes', async () => {
    const kv = new FakeKV()
    kv.store.set('sess:abc123', JSON.stringify({ userId: 'u1', expiresAt: '2099-01-01' }))
    handlerMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    await makeApp(kv)('/auth/sign-in', {
      method: 'POST',
      headers: { cookie: 'better-auth.session_token=abc123.signature' },
    })

    expect(kv.store.has('sess:abc123')).toBe(true)
  })
})
