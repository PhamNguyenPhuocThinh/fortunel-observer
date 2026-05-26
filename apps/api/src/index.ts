import { OpenAPIHono } from '@hono/zod-openapi'
import type { AppBindings } from './lib/context'
import { requestId } from './middleware/request-id'
import { corsMiddleware } from './middleware/cors'
import { rateLimit } from './middleware/rate-limit'
import { errorHandler, notFoundHandler } from './middleware/error-envelope'
import { registerHealthRoute } from './routes/health'
import { registerOpenApiRoute } from './routes/openapi'
import { registerDocsRoute } from './routes/docs'

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

  registerHealthRoute(app)
  registerOpenApiRoute(app)
  registerDocsRoute(app)

  app.onError(errorHandler)
  app.notFound(notFoundHandler)

  return app
}

const app = buildApp()
export default app
