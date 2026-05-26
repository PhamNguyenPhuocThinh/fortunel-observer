import type { OpenAPIHono } from '@hono/zod-openapi'
import type { AppBindings } from '../lib/context'

export function registerOpenApiRoute(app: OpenAPIHono<AppBindings>): void {
  app.doc31('/openapi.json', (c) => ({
    openapi: '3.1.0',
    info: {
      title: 'Fortunel Observer API',
      version: '0.1.0',
      description:
        'Agent-first headless API. RFC 7807 problem details; `{ data, meta, errors }` envelope; cursor pagination.',
      license: { name: 'GPL-3.0-only', identifier: 'GPL-3.0-only' },
    },
    servers: [
      { url: new URL(c.req.url).origin, description: 'Current host' },
      { url: 'https://api.fortunel.dev', description: 'Production' },
      { url: 'https://staging.api.fortunel.dev', description: 'Staging' },
    ],
    tags: [
      { name: 'health', description: 'Service health probes' },
      { name: 'docs', description: 'OpenAPI document + Scalar UI' },
    ],
  }))

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerApiKey', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'API Key (fo_<id>_<secret>)',
    description: 'API key minted via POST /v1/api-keys (Phase 5).',
  })
}
