/**
 * Exercises the middleware's dispatch contract without booting Better Auth or
 * a real DB. We stub `auth/config` and `auth/api-key` via vi.mock so each test
 * controls what verifyApiKey/getAuth return.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { AppBindings } from '../lib/context'
import { errorHandler } from '../middleware/error-envelope'
import { requestId } from '../middleware/request-id'

vi.mock('../auth/api-key', () => ({
  verifyApiKey: vi.fn(),
  touchLastUsed: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../auth/config', () => ({
  getAuth: vi.fn(() => ({
    db: {},
    auth: {
      api: {
        getSession: vi.fn().mockResolvedValue(null),
      },
    },
  })),
}))

import { authMiddleware } from '../auth/middleware'
import { verifyApiKey } from '../auth/api-key'
import { getAuth } from '../auth/config'

const env = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'error',
  CORS_ALLOWED_ORIGINS: '',
  COMMIT_SHA: 'test',
  RATE_LIMIT_PER_MIN: '100',
  DATABASE_URL: 'postgres://stub',
}

function makeApp() {
  const app = new Hono<AppBindings>()
  app.use('*', requestId())
  app.use('/v1/*', authMiddleware())
  app.get('/v1/me', (c) => {
    const user = c.get('user')
    return c.json({ id: user?.id, scopes: user?.scopes, method: user?.method })
  })
  app.onError(errorHandler)
  return app
}

beforeEach(() => {
  vi.mocked(verifyApiKey).mockReset()
  vi.mocked(getAuth).mockReturnValue({
    db: {} as never,
    auth: {
      api: { getSession: vi.fn().mockResolvedValue(null) },
    } as never,
  })
})

describe('authMiddleware', () => {
  it('401 problem+json when no credentials present', async () => {
    const app = makeApp()
    const res = await app.request('/v1/me', { method: 'GET' }, env)
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toContain('application/problem+json')
  })

  it('resolves Bearer token via api-key.verify and exposes scopes', async () => {
    vi.mocked(verifyApiKey).mockResolvedValueOnce({
      apiKey: {
        id: 'key-1',
        ownerId: 'owner-1',
        name: 'test',
        hashedKey: 'x',
        keyPrefix: 'p',
        scopes: ['posts:read', 'projects:write'],
        lastUsedAt: null,
        expiresAt: null,
        createdAt: new Date(),
        revokedAt: null,
      },
    })
    const app = makeApp()
    const res = await app.request(
      '/v1/me',
      { method: 'GET', headers: { Authorization: 'Bearer fo_aaaaaaaaaaaa_secret' } },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; scopes: string[]; method: string }
    expect(body.id).toBe('owner-1')
    expect(body.scopes).toEqual(['posts:read', 'projects:write'])
    expect(body.method).toBe('api-key')
  })

  it('401 when Bearer token does not verify', async () => {
    vi.mocked(verifyApiKey).mockResolvedValueOnce(null)
    const app = makeApp()
    const res = await app.request(
      '/v1/me',
      { method: 'GET', headers: { Authorization: 'Bearer fo_badbadbadbad_nope' } },
      env,
    )
    expect(res.status).toBe(401)
  })

  it('resolves session via Better Auth and grants *:*', async () => {
    vi.mocked(getAuth).mockReturnValue({
      db: {} as never,
      auth: {
        api: {
          getSession: vi.fn().mockResolvedValue({
            user: { id: 'user-99' },
            session: { id: 'sess-1', expiresAt: new Date(Date.now() + 3600_000) },
          }),
        },
      } as never,
    })
    const app = makeApp()
    const res = await app.request(
      '/v1/me',
      { method: 'GET', headers: { cookie: 'better-auth.session_token=raw.value' } },
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; scopes: string[]; method: string }
    expect(body.id).toBe('user-99')
    expect(body.scopes).toEqual(['*:*'])
    expect(body.method).toBe('session')
  })
})
