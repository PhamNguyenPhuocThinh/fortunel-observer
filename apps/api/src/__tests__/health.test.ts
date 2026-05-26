import { describe, expect, it } from 'vitest'
import { buildApp } from '../index'

const baseEnv = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'error',
  CORS_ALLOWED_ORIGINS: 'http://localhost:4321',
  COMMIT_SHA: 'test-sha',
}

describe('GET /healthz', () => {
  it('returns 200 with envelope payload', async () => {
    const app = buildApp()
    const res = await app.request('/healthz', { method: 'GET' }, baseEnv)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { ok: true; commit: string; env: string; timestamp: string }
      meta: null
      errors: null
    }
    expect(body.data.ok).toBe(true)
    expect(body.data.commit).toBe('test-sha')
    expect(body.data.env).toBe('development')
    expect(typeof body.data.timestamp).toBe('string')
    expect(body.meta).toBeNull()
    expect(body.errors).toBeNull()
  })

  it('propagates X-Request-Id header', async () => {
    const app = buildApp()
    const incoming = '550e8400-e29b-41d4-a716-446655440000'
    const res = await app.request(
      '/healthz',
      { method: 'GET', headers: { 'X-Request-Id': incoming } },
      baseEnv,
    )
    expect(res.headers.get('X-Request-Id')).toBe(incoming)
  })

  it('generates a request id when none supplied', async () => {
    const app = buildApp()
    const res = await app.request('/healthz', { method: 'GET' }, baseEnv)
    const id = res.headers.get('X-Request-Id')
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('unknown routes return RFC 7807 problem+json', async () => {
    const app = buildApp()
    const res = await app.request('/does-not-exist', { method: 'GET' }, baseEnv)
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toContain('application/problem+json')
    const body = (await res.json()) as {
      data: null
      errors: Array<{ type: string; status: number; instance: string }>
    }
    expect(body.data).toBeNull()
    expect(body.errors[0]?.status).toBe(404)
    expect(body.errors[0]?.type).toMatch(/^https:\/\/api\.fortunel\.dev\/errors\//)
  })
})
