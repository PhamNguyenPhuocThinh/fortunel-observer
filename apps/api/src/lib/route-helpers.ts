/**
 * Route-layer helpers shared across `/v1/*` resources.
 *
 * `getDb(c)` reuses Better Auth's already-cached Database (one neon-http
 * client per env binding) so we don't double-instantiate.
 *
 * `repoCtx(c)` materializes the per-request `RepoCtx` from `c.var.user`.
 * Throws 401 if no user is present — that should never happen behind
 * `authMiddleware` but the guard keeps the call-site terse and TS-narrow.
 *
 * `okEnvelope` / `pageEnvelope` are tiny constructors so handlers don't
 * spell out the response envelope shape four times per file.
 */

import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import type { Database } from '@fortunel/db'
import type { AppBindings } from './context'
import { getAuth } from '../auth/config'
import { parseEnv } from './env'
import type { KeysetPage, RepoCtx } from '../repositories/base-repo'
import { RepoConflictError } from '../repositories/base-repo'

export function getDb(c: Context<AppBindings>): Database {
  return getAuth(c.env as unknown as Record<string, unknown>).db
}

export function repoCtx(c: Context<AppBindings>): RepoCtx {
  const user = c.get('user')
  if (!user) throw new HTTPException(401, { message: 'Unauthorized' })
  return { db: getDb(c), ownerId: user.id }
}

export interface OkEnvelope<T> {
  data: T
  meta: null
  errors: null
}
export interface PageEnvelope<T> {
  data: T[]
  meta: { cursor: string | null; has_more: boolean }
  errors: null
}

export function okEnvelope<T>(data: T): OkEnvelope<T> {
  return { data, meta: null, errors: null }
}

export function pageEnvelope<T>(page: KeysetPage<T>): PageEnvelope<T> {
  return {
    data: page.rows,
    meta: { cursor: page.nextCursor, has_more: page.has_more },
    errors: null,
  }
}

/** Convert a RepoConflictError into a 409 HTTPException. */
export function rethrowConflict(err: unknown): never {
  if (err instanceof RepoConflictError) {
    throw new HTTPException(409, { message: `conflict on ${err.field}` })
  }
  throw err as Error
}

/**
 * Client IP best-effort. CF-Connecting-IP is always present on real Workers
 * traffic (Cloudflare sets it and strips any client-sent copy), so it's the
 * only trustworthy source in production. X-Forwarded-For is honoured ONLY
 * outside production — useful for test harnesses and local dev, but accepting
 * it in prod would let anyone forge their IP for the rate-limiter and the
 * `contact_messages.ip` audit column.
 */
export function clientIp(c: Context<AppBindings>): string | null {
  const cf = c.req.header('CF-Connecting-IP')
  if (cf) return cf
  const env = parseEnv(c.env as unknown as Record<string, unknown>)
  if (env.NODE_ENV === 'production') return null
  return c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? null
}
