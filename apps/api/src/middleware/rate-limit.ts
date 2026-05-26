import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppBindings } from '../lib/context'
import { parseEnv } from '../lib/env'

const WINDOW_MS = 60_000

interface Bucket {
  count: number
  window_start: number
}

export interface RateLimitOptions {
  limit?: number
  keyFn?: (
    c: Parameters<MiddlewareHandler<AppBindings>>[0],
  ) => string | null | Promise<string | null>
}

async function sha256Hex16(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const view = new Uint8Array(digest)
  let hex = ''
  for (let i = 0; i < 8; i++) {
    const byte = view[i] ?? 0
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

async function defaultKey(c: Parameters<MiddlewareHandler<AppBindings>>[0]): Promise<string | null> {
  const auth = c.req.header('Authorization')
  if (auth?.startsWith('Bearer ')) {
    const hashed = await sha256Hex16(auth.slice(7))
    return `key:${hashed}`
  }
  const ip =
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'anon'
  return `ip:${ip}`
}

export const rateLimit = (opts: RateLimitOptions = {}): MiddlewareHandler<AppBindings> => async (c, next) => {
  const env = parseEnv(c.env as unknown as Record<string, unknown>)
  const limit = opts.limit ?? env.RATE_LIMIT_PER_MIN
  const kv = (c.env as unknown as { RATE_LIMIT?: KVNamespace }).RATE_LIMIT

  if (!kv) {
    return next()
  }

  const keyRaw = await (opts.keyFn ?? defaultKey)(c)
  if (!keyRaw) return next()
  const key = `rl:${keyRaw}`

  const now = Date.now()
  const raw = await kv.get(key)
  let bucket: Bucket
  if (raw) {
    try {
      bucket = JSON.parse(raw) as Bucket
    } catch {
      bucket = { count: 0, window_start: now }
    }
    if (now - bucket.window_start >= WINDOW_MS) {
      bucket = { count: 0, window_start: now }
    }
  } else {
    bucket = { count: 0, window_start: now }
  }

  bucket.count += 1
  const remaining = Math.max(0, limit - bucket.count)
  const resetMs = bucket.window_start + WINDOW_MS - now
  const retryAfterSec = Math.max(1, Math.ceil(resetMs / 1000))

  await kv.put(key, JSON.stringify(bucket), { expirationTtl: 120 })

  c.header('X-RateLimit-Limit', String(limit))
  c.header('X-RateLimit-Remaining', String(remaining))
  c.header('X-RateLimit-Reset', String(Math.ceil((bucket.window_start + WINDOW_MS) / 1000)))

  if (bucket.count > limit) {
    throw new HTTPException(429, {
      message: 'Too Many Requests',
      res: new Response(null, {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil((bucket.window_start + WINDOW_MS) / 1000)),
        },
      }),
    })
  }

  await next()
}
