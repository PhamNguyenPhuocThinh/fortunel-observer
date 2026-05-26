import { cors as honoCors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import type { AppBindings } from '../lib/context'
import { corsOrigins, parseEnv } from '../lib/env'

export const corsMiddleware = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  const env = parseEnv(c.env as unknown as Record<string, unknown>)
  const allowed = corsOrigins(env)
  const handler = honoCors({
    origin: (origin) => {
      if (!origin) return ''
      return allowed.includes(origin) ? origin : ''
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposeHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 600,
  })
  return handler(c, next)
}
