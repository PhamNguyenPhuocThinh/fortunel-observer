import { describe, expect, it } from 'vitest'
import { readSession, writeSession, invalidateSession } from '../auth/session-cache'

class FakeKV {
  store = new Map<string, { value: string; expiresAt?: number }>()
  async get(key: string): Promise<string | null> {
    const v = this.store.get(key)
    if (!v) return null
    if (v.expiresAt && v.expiresAt <= Date.now()) {
      this.store.delete(key)
      return null
    }
    return v.value
  }
  async put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: opts?.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : undefined,
    })
  }
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
}

describe('session cache', () => {
  it('round-trips a valid session', async () => {
    const kv = new FakeKV() as unknown as KVNamespace
    const expiresAt = new Date(Date.now() + 3600_000).toISOString()
    await writeSession(kv, 'sess-1', { userId: 'u1', expiresAt })
    const got = await readSession(kv, 'sess-1')
    expect(got?.userId).toBe('u1')
    expect(got?.expiresAt).toBe(expiresAt)
  })

  it('returns null for an expired session even if KV still holds it', async () => {
    const fake = new FakeKV()
    // Force-store an entry whose JSON says expired, regardless of KV TTL.
    fake.store.set('sess:sess-old', {
      value: JSON.stringify({ userId: 'u1', expiresAt: new Date(Date.now() - 1000).toISOString() }),
    })
    const got = await readSession(fake as unknown as KVNamespace, 'sess-old')
    expect(got).toBeNull()
  })

  it('returns null for malformed JSON', async () => {
    const fake = new FakeKV()
    fake.store.set('sess:garbage', { value: '{not json' })
    const got = await readSession(fake as unknown as KVNamespace, 'garbage')
    expect(got).toBeNull()
  })

  it('invalidate removes the entry', async () => {
    const kv = new FakeKV() as unknown as KVNamespace
    await writeSession(kv, 'sess-x', {
      userId: 'u1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })
    await invalidateSession(kv, 'sess-x')
    expect(await readSession(kv, 'sess-x')).toBeNull()
  })

  it('all ops are no-ops when KV binding is absent', async () => {
    await writeSession(undefined, 's', {
      userId: 'u',
      expiresAt: new Date().toISOString(),
    })
    expect(await readSession(undefined, 's')).toBeNull()
    await invalidateSession(undefined, 's')
  })

  it('caps TTL at 60s even when DB session lives longer', async () => {
    const fake = new FakeKV()
    const farFuture = new Date(Date.now() + 86_400_000).toISOString()
    await writeSession(fake as unknown as KVNamespace, 'sess-long', {
      userId: 'u1',
      expiresAt: farFuture,
    })
    const entry = fake.store.get('sess:sess-long')
    expect(entry).toBeDefined()
    const ttlMs = (entry!.expiresAt ?? 0) - Date.now()
    expect(ttlMs).toBeLessThanOrEqual(60_000)
    expect(ttlMs).toBeGreaterThan(55_000)
  })
})
