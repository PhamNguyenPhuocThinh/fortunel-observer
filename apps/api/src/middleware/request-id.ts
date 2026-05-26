import type { MiddlewareHandler } from 'hono'
import type { AppBindings } from '../lib/context'
import { createLogger } from '../lib/logger'
import { parseEnv } from '../lib/env'

const HEADER = 'X-Request-Id'
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const requestId = (): MiddlewareHandler<AppBindings> => async (c, next) => {
  const incoming = c.req.header(HEADER)
  const id = incoming && UUID_V4_RE.test(incoming) ? incoming : crypto.randomUUID()
  c.set('requestId', id)

  const env = parseEnv(c.env as unknown as Record<string, unknown>)
  const logger = createLogger({
    level: env.LOG_LEVEL,
    base: { request_id: id, method: c.req.method, path: c.req.path },
  })
  c.set('logger', logger)

  c.header(HEADER, id)
  await next()
}
