import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { AppBindings } from '../lib/context'
import { parseEnv } from '../lib/env'

const healthResponseSchema = z
  .object({
    data: z.object({
      ok: z.literal(true),
      commit: z.string(),
      env: z.enum(['development', 'staging', 'production']),
      timestamp: z.string(),
    }),
    meta: z.null(),
    errors: z.null(),
  })
  .openapi('HealthEnvelope')

const route = createRoute({
  method: 'get',
  path: '/healthz',
  tags: ['health'],
  summary: 'Liveness probe',
  responses: {
    200: {
      content: { 'application/json': { schema: healthResponseSchema } },
      description: 'Service is up',
    },
  },
})

export function registerHealthRoute(app: OpenAPIHono<AppBindings>): void {
  app.openapi(route, (c) => {
    const env = parseEnv(c.env as unknown as Record<string, unknown>)
    return c.json(
      {
        data: {
          ok: true as const,
          commit: env.COMMIT_SHA,
          env: env.NODE_ENV,
          timestamp: new Date().toISOString(),
        },
        meta: null,
        errors: null,
      },
      200,
    )
  })
}
