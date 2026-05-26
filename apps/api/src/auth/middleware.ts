/**
 * Dual-auth middleware. One of:
 *   - `Authorization: Bearer fo_<prefix>_<secret>` → API key (scoped)
 *   - Better Auth session cookie → user-level access (implicit *:*)
 * Neither → 401 problem+json.
 *
 * Session lookups consult the KV write-through cache before hitting Postgres.
 */

import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppBindings, AuthUser } from '../lib/context'
import { verifyApiKey, touchLastUsed } from './api-key'
import { getAuth } from './config'
import { readSession, writeSession } from './session-cache'
import { parseScopes, WILDCARD } from './scopes'

interface BetterAuthSessionShape {
  user?: { id?: string } | null
  session?: { id?: string; expiresAt?: Date | string } | null
}

async function resolveBearer(
  c: Parameters<MiddlewareHandler<AppBindings>>[0],
  token: string,
): Promise<AuthUser | null> {
  const env = c.env as unknown as Record<string, unknown>
  const { db } = getAuth(env)
  const verified = await verifyApiKey(db, token)
  if (!verified) return null
  // Fire-and-forget last_used touch; failure must not break the request.
  // `c.executionCtx` throws synchronously in non-Worker test contexts; guard.
  try {
    c.executionCtx.waitUntil(touchLastUsed(db, verified.apiKey.id).catch(() => undefined))
  } catch {
    /* no executionCtx (tests / non-Worker host) — skip the background touch */
  }
  return {
    id: verified.apiKey.ownerId,
    scopes: parseScopes(verified.apiKey.scopes),
    method: 'api-key',
    apiKeyId: verified.apiKey.id,
  }
}

async function resolveSession(
  c: Parameters<MiddlewareHandler<AppBindings>>[0],
): Promise<AuthUser | null> {
  const env = c.env as unknown as Record<string, unknown>
  const kv = (env as { SESSION_CACHE?: KVNamespace }).SESSION_CACHE
  const cookieHeader = c.req.header('cookie') ?? c.req.header('Cookie')
  if (!cookieHeader) return null

  // Cookie name follows Better Auth default. Look for the session token cookie
  // to derive the cache key without round-tripping BA on cache hit.
  const sessionCookie = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('better-auth.session_token='))
  if (sessionCookie) {
    const raw = sessionCookie.slice('better-auth.session_token='.length)
    const sessionId = decodeURIComponent(raw).split('.')[0] ?? ''
    if (sessionId) {
      const cached = await readSession(kv, sessionId)
      if (cached) {
        return {
          id: cached.userId,
          scopes: [WILDCARD],
          method: 'session',
        }
      }
    }
  }

  const { auth } = getAuth(env)
  const session = (await auth.api.getSession({ headers: c.req.raw.headers })) as
    | BetterAuthSessionShape
    | null
  if (!session?.user?.id || !session.session?.id) return null

  const expiresAt =
    session.session.expiresAt instanceof Date
      ? session.session.expiresAt.toISOString()
      : (session.session.expiresAt ?? new Date(Date.now() + 60_000).toISOString())

  await writeSession(kv, session.session.id, {
    userId: session.user.id,
    expiresAt,
  })

  return {
    id: session.user.id,
    scopes: [WILDCARD],
    method: 'session',
  }
}

export interface AuthMiddlewareOptions {
  /** When true, an unauthenticated request still calls next() (used for optional auth). */
  optional?: boolean
}

export const authMiddleware =
  (opts: AuthMiddlewareOptions = {}): MiddlewareHandler<AppBindings> =>
  async (c, next) => {
    const authHeader = c.req.header('Authorization') ?? c.req.header('authorization')

    let user: AuthUser | null = null
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim()
      if (token) user = await resolveBearer(c, token)
    } else {
      user = await resolveSession(c)
    }

    if (user) {
      c.set('user', user)
      return next()
    }
    if (opts.optional) return next()
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
