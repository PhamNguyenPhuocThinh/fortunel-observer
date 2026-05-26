/**
 * Mounts Better Auth at /auth/*.
 *
 * BA exposes its own router (sign-up, sign-in, OAuth callbacks, session); we
 * delegate raw Request → BA handler and return its Response. No envelope
 * wrapping here — BA controls these endpoints' response shape.
 *
 * Sign-out is intercepted: BA wipes the cookie + DB row, but our KV cache
 * entry (auth/session-cache.ts) would otherwise survive up to 60s and let a
 * replayed cookie authenticate as the signed-out user. We capture the session
 * id BEFORE delegating (BA strips the cookie on its way out) and invalidate
 * the KV entry after BA returns success.
 */

import type { Hono } from 'hono'
import type { AppBindings } from '../lib/context'
import { getAuth } from '../auth/config'
import { invalidateSession } from '../auth/session-cache'

const SESSION_COOKIE = 'better-auth.session_token='

function extractSessionId(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null
  const cookie = cookieHeader
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(SESSION_COOKIE))
  if (!cookie) return null
  const raw = cookie.slice(SESSION_COOKIE.length)
  try {
    const id = decodeURIComponent(raw).split('.')[0] ?? ''
    return id || null
  } catch {
    return null
  }
}

export function registerAuthRoutes(app: Hono<AppBindings>): void {
  app.all('/auth/*', async (c) => {
    const { auth } = getAuth(c.env as unknown as Record<string, unknown>)

    const pathname = new URL(c.req.url).pathname
    const isSignOut = c.req.method === 'POST' && pathname.endsWith('/sign-out')
    const sessionId = isSignOut
      ? extractSessionId(c.req.header('cookie') ?? c.req.header('Cookie'))
      : null

    const response = await auth.handler(c.req.raw)

    if (isSignOut && sessionId && response.ok) {
      const kv = (c.env as { SESSION_CACHE?: KVNamespace }).SESSION_CACHE
      await invalidateSession(kv, sessionId)
    }
    return response
  })
}
