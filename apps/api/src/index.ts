import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppBindings } from './lib/context'
import { requestId } from './middleware/request-id'
import { corsMiddleware } from './middleware/cors'
import { rateLimit } from './middleware/rate-limit'
import { errorHandler, notFoundHandler } from './middleware/error-envelope'
import { authMiddleware } from './auth/middleware'
import { registerHealthRoute } from './routes/health'
import { registerOpenApiRoute } from './routes/openapi'
import { registerDocsRoute } from './routes/docs'
import { registerAuthRoutes } from './routes/auth'
import { registerProjectRoutes } from './routes/v1/projects'
import { registerPostRoutes } from './routes/v1/posts'
import { registerContactRoutes } from './routes/v1/contact'
import { registerApiKeyRoutes } from './routes/v1/api-keys'

export function buildApp(): OpenAPIHono<AppBindings> {
  const app = new OpenAPIHono<AppBindings>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            data: null,
            meta: null,
            errors: [
              {
                type: 'https://api.fortunel.dev/errors/request/validation',
                title: 'Validation failed',
                status: 422,
                detail: result.error.message,
                instance: c.req.path,
                request_id: c.get('requestId') ?? 'unknown',
              },
            ],
          },
          422,
          { 'Content-Type': 'application/problem+json' },
        )
      }
      return
    },
  })

  app.use('*', requestId())
  app.use('*', corsMiddleware())
  app.use('/v1/*', rateLimit())

  // Public contact submit is the only /v1 endpoint that doesn't require auth.
  // Skip the auth middleware for POST /v1/contact so anonymous visitors can
  // submit the form; everything else still goes through dual-auth.
  // Tolerate a trailing slash so `/v1/contact/` doesn't accidentally 401.
  const auth = authMiddleware()
  app.use('/v1/*', async (c, next) => {
    if (c.req.method === 'POST') {
      const p = c.req.path
      if (p === '/v1/contact' || p === '/v1/contact/') return next()
    }
    return auth(c, next)
  })

  registerAuthRoutes(app)
  registerHealthRoute(app)
  registerOpenApiRoute(app)
  registerDocsRoute(app)
  registerProjectRoutes(app)
  registerPostRoutes(app)
  registerContactRoutes(app)
  registerApiKeyRoutes(app)

  app.onError(errorHandler)
  app.notFound(notFoundHandler)

  return app
}

const app = buildApp()
export default app
