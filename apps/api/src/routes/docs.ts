import { Scalar } from '@scalar/hono-api-reference'
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { AppBindings } from '../lib/context'

export function registerDocsRoute(app: OpenAPIHono<AppBindings>): void {
  app.get(
    '/docs',
    Scalar({
      url: '/openapi.json',
      pageTitle: 'Fortunel Observer API',
      theme: 'purple',
      darkMode: true,
      defaultOpenAllTags: true,
    }),
  )
}
