import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { AppBindings } from '../lib/context'
import { errorHandler } from '../middleware/error-envelope'
import { requestId } from '../middleware/request-id'
import { hasScope, parseScopes, requireScope, WILDCARD } from '../auth/scopes'

const env = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'error',
  CORS_ALLOWED_ORIGINS: '',
  COMMIT_SHA: 'test',
  RATE_LIMIT_PER_MIN: '100',
}

describe('hasScope', () => {
  it('matches exact grants', () => {
    expect(hasScope(['posts:read'], 'posts:read')).toBe(true)
    expect(hasScope(['posts:read'], 'posts:write')).toBe(false)
  })

  it('wildcard *:* grants everything', () => {
    expect(hasScope([WILDCARD], 'posts:write')).toBe(true)
    expect(hasScope([WILDCARD], 'projects:read')).toBe(true)
  })

  it('returns false for empty grants', () => {
    expect(hasScope([], 'posts:read')).toBe(false)
  })
})

describe('parseScopes', () => {
  it('drops invalid entries silently', () => {
    expect(parseScopes(['posts:read', 'garbage', 'projects:write'])).toEqual([
      'posts:read',
      'projects:write',
    ])
  })
  it('returns [] for null/undefined', () => {
    expect(parseScopes(null)).toEqual([])
    expect(parseScopes(undefined)).toEqual([])
  })
})

describe('requireScope (in a route)', () => {
  function makeApp(grantedScopes: string[]) {
    const app = new Hono<AppBindings>()
    app.use('*', requestId())
    app.use('*', async (c, next) => {
      c.set('user', { id: 'user-1', scopes: grantedScopes, method: 'api-key' })
      return next()
    })
    app.get('/needs-write', (c) => {
      requireScope(c, 'posts:write')
      return c.json({ ok: true })
    })
    app.onError(errorHandler)
    return app
  }

  it('200 when granted', async () => {
    const res = await app200(['posts:write'])
    expect(res.status).toBe(200)
  })

  it('200 when wildcard granted', async () => {
    const res = await app200([WILDCARD])
    expect(res.status).toBe(200)
  })

  it('403 problem+json when missing', async () => {
    const app = makeApp(['posts:read'])
    const res = await app.request('/needs-write', { method: 'GET' }, env)
    expect(res.status).toBe(403)
    expect(res.headers.get('Content-Type')).toContain('application/problem+json')
    const body = (await res.json()) as { errors: Array<{ status: number; type: string }> }
    expect(body.errors[0]?.status).toBe(403)
    expect(body.errors[0]?.type).toContain('/auth/forbidden')
  })

  async function app200(scopes: string[]): Promise<Response> {
    const app = makeApp(scopes)
    return app.request('/needs-write', { method: 'GET' }, env)
  }

  it('401 when user var is absent', async () => {
    const app = new Hono<AppBindings>()
    app.use('*', requestId())
    app.get('/x', (c) => {
      requireScope(c, 'posts:read')
      return c.json({ ok: true })
    })
    app.onError(errorHandler)
    const res = await app.request('/x', { method: 'GET' }, env)
    expect(res.status).toBe(401)
  })
})
