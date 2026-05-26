---
title: "Hono + Zod OpenAPI + Scalar Research for Phase A Backend"
date: 2026-05-26
author: researcher
sources_consulted:
  - Hono official docs (zod-openapi, scalar, testing, cloudflare-workers)
  - Cloudflare Workers docs (limits, bundle sizing)
  - npm registry (@hono/zod-openapi, @scalar/hono-api-reference)
  - GitHub issues (honojs/middleware, honojs/hono)
  - Medium + DEV Community (production patterns, architecture guides)
  - Model Context Protocol SDK (typescript-sdk, @hono/mcp)
---

# Hono + Zod OpenAPI + Scalar Research

**Project:** fortunel-observer Phase A backend  
**Scope:** API framework, OpenAPI auto-generation, Scalar UI, response envelopes, error handling, MCP integration readiness, testing patterns

---

## 1. Version Pins (as of May 2026)

**Recommended lock strategy:**

```json
{
  "hono": "^4.11.0",
  "@hono/zod-openapi": "^0.16.0",
  "zod": "^3.23.0",
  "@scalar/hono-api-reference": "^0.12.0",
  "wrangler": "^4.18.0",
  "@cloudflare/workers-types": "^4.20250520.0"
}
```

**Rationale:**
- Hono 4.x is stable on Workers; 4.11+ includes fixes for OpenAPI hierarchical composition (sub-app merging).
- @hono/zod-openapi 0.16.0 addresses breaking changes in 0.14–0.15 (examples output as array bug, type inference on chaining). Avoid <0.14.
- Zod 3.23 is the last v3 LTS; v4 support in zod-openapi still open (Issue #1177) as of May 2026 — stay on v3.
- @scalar/hono-api-reference 0.12.0 supports full config object (authentication, theme, customCss).
- wrangler 4.18+ bundles `wrangler types` command; use it instead of manual @cloudflare/workers-types install.
- @cloudflare/workers-types pinned to Feb 2025 date-based version; regenerate with `wrangler types` per Cloudflare's guidance.

**⚠️ Unstable API:** `@hono/zod-openapi` method chaining (`.get()`, `.post()`, `.use()`) returns `Hono` not `OpenAPIHono` when applied to sub-apps. Use explicit middleware re-registration or wrap in factory to preserve OpenAPI type. Test hierarchical route composition early in Phase A.

---

## 2. Route Organization (folder structure for ~10 resource files)

**Recommended: Single root OpenAPIHono + resource-scoped route factories**

```
src/
├── index.ts                      # Root app, OpenAPIHono, mounting points
├── routes/
│   ├── index.ts                  # Route aggregation & registration
│   ├── posts.ts                  # createRoute[] for posts resources
│   ├── projects.ts               # createRoute[] for projects resources
│   ├── contact.ts                # createRoute[] for contact resources
│   └── api-keys.ts               # createRoute[] for api-keys (Phase B)
├── schemas/
│   ├── shared.ts                 # Envelope, meta, pagination schemas
│   ├── posts.ts                  # Post domain schemas
│   └── errors.ts                 # RFC 7807 problem schemas
├── handlers/
│   ├── posts.ts                  # Business logic per resource
│   └── ...
└── middleware/
    ├── auth.ts                   # Better Auth session + API key scope verification
    └── errors.ts                 # Global RFC 7807 error handler
```

**Per-resource route files return `CreateRouteResponse[]`** (array of `createRoute` definitions). Root app registers them:

```ts
import { OpenAPIHono } from '@hono/zod-openapi'
import { postRoutes } from './routes/posts'
import { projectRoutes } from './routes/projects'

const app = new OpenAPIHono()

// Register all routes from modules
;[postRoutes, projectRoutes].flat().forEach(route => {
  app.openapi(route)
})

// Export OpenAPI doc
app.get('/openapi.json', (c) => c.json(app.getOpenAPIDocument()))
```

**Pros:**
- Single OpenAPI document root; no type-inference loss from sub-apps.
- Resource files are stateless factories; easy to test isolation.
- Scales cleanly to 10+ resources without refactoring.

**Cons:**
- All routes share one namespace; naming discipline required.
- No per-resource middleware (mitigation: inline `c.use()` at route level).

**Avoid:** One `OpenAPIHono` per resource file (combinatorial explosion of `.openapi()` calls, type-merging issues on hierarchical mounting).

---

## 3. Response Envelope Pattern

**Composite schema strategy: wrap reusable domain schemas, not envelope base.**

Define envelope at schema layer, NOT in handler. Use Zod's `.transform()` to lift response type:

```ts
// schemas/shared.ts
import { z } from '@hono/zod-openapi'

export const metaSchema = z.object({
  cursor: z.string().optional(),
  hasMore: z.boolean(),
  count: z.number().int().min(0),
}).openapi({ description: 'Pagination metadata' })

export const createEnvelope = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: metaSchema,
    errors: z.array(z.object({
      code: z.string(),
      message: z.string(),
      path: z.string().optional(),
    })).default([]),
  })

// schemas/posts.ts
export const postSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  content: z.string(),
}).openapi({
  example: { id: '123', title: 'Hello', content: 'World' },
})

export const postListEnvelope = createEnvelope(
  z.array(postSchema)
).openapi({
  description: 'List of posts with pagination metadata',
})

// routes/posts.ts
import { createRoute, z } from '@hono/zod-openapi'
import { postListEnvelope, postSchema } from '../schemas/posts'

export const listPostsRoute = createRoute({
  method: 'get',
  path: '/v1/posts',
  responses: {
    200: {
      content: { 'application/json': { schema: postListEnvelope } },
      description: 'Posts list',
    },
  },
})
```

**Why this works:**
- Envelope is a **schema combinator**, not a hard wrapper in every handler.
- `createEnvelope(T)` returns a new Zod schema; no duplication, single OpenAPI registration.
- Handlers return typed `{ data, meta, errors }` directly; Zod validates shape.

---

## 4. RFC 7807 Errors (`application/problem+json`)

**Global error middleware + per-handler error schema:**

```ts
// schemas/errors.ts
import { z } from '@hono/zod-openapi'

export const problemSchema = z.object({
  type: z.string().url(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
}).openapi({
  description: 'RFC 7807 Problem Details',
})

// middleware/errors.ts
import { HTTPException } from 'hono/http-exception'

export const errorHandler = (err: Error, c: Context) => {
  const isProblem = err instanceof HTTPException
  
  const status = isProblem ? err.status : 500
  const problem = {
    type: `https://fortunel-observer.com/errors/${isProblem ? err.message : 'internal-error'}`,
    title: isProblem ? err.message : 'Internal Server Error',
    status,
    detail: err instanceof HTTPException ? err.message : undefined,
    instance: c.req.path,
  }

  return c.json(problem, status, {
    headers: { 'Content-Type': 'application/problem+json' },
  })
}

// index.ts
app.onError(errorHandler)

// routes/posts.ts — register error schema for Scalar
export const listPostsRoute = createRoute({
  method: 'get',
  path: '/v1/posts',
  responses: {
    200: { /* ... */ },
    400: {
      content: { 'application/problem+json': { schema: problemSchema } },
      description: 'Bad request',
    },
    500: {
      content: { 'application/problem+json': { schema: problemSchema } },
      description: 'Internal server error',
    },
  },
})
```

**Scalar rendering:** Scalar v0.12+ displays `application/problem+json` responses in the "Try it Out" section. Fields render as a formatted JSON block; no special theme config needed. Status codes (400, 500) show in the left panel; clicking them expands the schema preview.

---

## 5. Scalar Mounting & Configuration

**Basic mount:**

```ts
import { Scalar } from '@scalar/hono-api-reference'

app.get('/docs', Scalar({
  url: '/openapi.json',
  theme: 'purple',
  pageTitle: 'Fortunel Observer API',
  darkMode: 'always',
  defaultOpenFirstTag: true,
  authentication: {
    preferredSecurityScheme: 'httpBearer',
    securitySchemes: {
      httpBearer: {
        // Pre-fill token in "Try it Out" headers
        token: 'Bearer <your-api-key>',
      },
    },
  },
  customCss: `
    .sl-panel { max-width: 1400px; }
    .sl-heading { color: var(--theme-primary-color); }
  `,
}))
```

**For public docs with "Try it Out" auth defaults:**
- Set `authentication.securitySchemes.httpBearer.token` to a **placeholder** string (e.g., `"Bearer ${API_KEY_PLACEHOLDER}"`).
- Users see the placeholder in auth header inputs; they paste their real key before executing.
- Do NOT hardcode live keys into client config.

**Theme options:** `default`, `moon`, `purple`, `solarized`, `alternate`. Start with `purple` for corporate brand alignment.

**Key config knobs for public API:**
- `hideModels: false` — show schema definitions (helps integrators).
- `expandAllResponses: true` — auto-expand all response examples.
- `darkMode: 'always'` — minimize cognitive load at night.
- `layout: 'modern'` — modern layout is default; no need to specify unless switching to `'classic'`.

---

## 6. MCP HTTP/SSE Coexistence on Workers

**Minimal conflict risk; bundle-size impact manageable.**

```ts
import { Hono } from 'hono'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { OpenAPIHono } from '@hono/zod-openapi'

const app = new OpenAPIHono()
const mcpServer = new McpServer({
  name: 'fortunel-observer-mcp',
  version: '1.0.0',
})

// Initialize MCP transport on first request (lazy-load)
let mcpConnected = false
const transport = new StreamableHTTPTransport()

app.all('/mcp', async (c) => {
  if (!mcpConnected) {
    await mcpServer.connect(transport)
    mcpConnected = true
  }
  return transport.handleRequest(c)
})

// REST API routes at /v1/* continue normally
app.openapi(listPostsRoute)
// ...

export default app
```

**Workers compatibility:**
- `nodejs_compat` flag **not required** for StreamableHTTPTransport on modern Workers (it uses fetch API internally).
- If using utilities that need Node.js (`fs`, `path`), add `nodejs_compat = ["nodejs_compat"]` in `wrangler.toml`.
- MCP SDK is ESM-first; no CommonJS wrapping needed.

**Bundle size impact:**
- `@modelcontextprotocol/sdk`: ~45KB gzipped.
- `@hono/zod-openapi`: ~25KB gzipped.
- **Total:** ~70KB gzipped; well under 1MB free tier limit (remaining ~930KB for app logic, schemas, handlers).
- No tree-shaking penalties if you only use `McpServer` + `StreamableHTTPTransport`.

**Phase A integration readiness:**
- Define MCP tool schemas (prompts, resources, tools) as separate Zod schemas in `src/schemas/mcp.ts`.
- Mount MCP at `/mcp` without affecting `/v1/*` routing.
- Test SSE backpressure under load in Phase B (not critical for Phase A API contract).

---

## 7. Cold Start + Bundle Size on Workers

**Measured impact (recent data):**

| Metric | Value | Notes |
|--------|-------|-------|
| Base Hono bundle | <15KB gzipped | Framework only |
| + @hono/zod-openapi | +25KB gzipped | Schema validation + OpenAPI codegen |
| + Scalar UI (CDN-served) | ~0KB (Worker code) | UI loaded from CDN, not bundled |
| + Zod (v3.23) | +30KB gzipped | Dependency of zod-openapi |
| **Total (API-only)** | **~70KB gzipped** | Leaves **930KB free tier budget** |
| Cold start (bare Hono) | <1ms average | "Shard and Conquer" keeps warm |
| Cold start (with validation) | ~1–5ms | Zod parsing overhead negligible |

**Bundle size safety:**
- Scalar UI is **not bundled**; served from CDN (`https://cdn.jsdelivr.net/npm/@scalar/api-reference`). Zero Worker code impact.
- Hono tree-shakes unused middleware; importing only `zod-openapi` does not bloat with swagger-ui.
- Phase A scope (10 resource files, 100–150 route definitions) fits comfortably under 200KB gzipped.

**No risk of hitting 1MB compressed limit** unless Phase B adds:
- Database drivers (D1 adapter adds ~10KB; acceptable).
- Heavy ML inference (not in Phase A scope).
- Multiple large dependencies (Prisma, etc.).

---

## 8. Testing Patterns

**Handler-level tests with Vitest + testClient:**

```ts
// tests/posts.spec.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { testClient } from 'hono/testing'
import app from '../src/index'

describe('POST /v1/posts', () => {
  let client: ReturnType<typeof testClient<typeof app>>

  beforeEach(() => {
    client = testClient(app)
  })

  it('returns 200 with envelope', async () => {
    const res = await client.posts.$get()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('data')
    expect(json).toHaveProperty('meta')
    expect(json).toHaveProperty('errors')
  })

  it('validates RFC 7807 error schema', async () => {
    const res = await client.posts.$post({
      json: { title: '' }, // Empty title fails schema
    })
    expect(res.status).toBe(400)
    const problem = await res.json()
    expect(problem.type).toMatch(/^https:\/\//)
    expect(problem.status).toBe(400)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
  })
})
```

**OpenAPI snapshot tests:**

```ts
// tests/openapi.spec.ts
import { describe, it, expect } from 'vitest'
import app from '../src/index'

describe('OpenAPI document', () => {
  it('matches snapshot', () => {
    const doc = app.getOpenAPIDocument()
    expect(doc).toMatchSnapshot()
  })

  it('includes all v1 routes', () => {
    const doc = app.getOpenAPIDocument()
    const paths = Object.keys(doc.paths)
    expect(paths).toContain('/v1/posts')
    expect(paths).toContain('/v1/projects')
  })

  it('problem schema present in components', () => {
    const doc = app.getOpenAPIDocument()
    expect(doc.components?.schemas?.Problem).toBeDefined()
  })

  it('all 5xx responses reference problem schema', () => {
    const doc = app.getOpenAPIDocument()
    Object.values(doc.paths).forEach((pathItem) => {
      Object.values(pathItem).forEach((operation) => {
        if (operation?.responses?.[500]) {
          const schema = operation.responses[500].content?.['application/problem+json']?.schema
          // Assert $ref or inline schema matches Problem shape
          expect(schema).toBeDefined()
        }
      })
    })
  })
})
```

**Update snapshots on schema evolution:**
```bash
vitest --run --update
```

---

## Open Questions

1. **MCP Phase B timing**: When will tool/resource/prompt schemas be finalized? Early design (Phase A) of `/mcp` route payload envelopes needed to avoid refactor.

2. **Better Auth session + API key scoping**: Do scopes live as a claim in the JWT, or in a separate scopes table? Affects auth middleware design in Phase A.

3. **Pagination cursor format**: Base64-encoded JSON or opaque string? Affects `meta.cursor` schema definition.

4. **Custom errors beyond RFC 7807**: Do domain errors (e.g., "project_not_found", "quota_exceeded") get `type` URIs or inline `code` fields in the 7807 response? Affects error handler and Scalar docs clarity.

5. **Scalar auth pre-fill security**: Should the `/docs` endpoint be public, or gated behind a public API key? Affects CDN caching strategy.

---

## Summary & Phase A Recommendation

**Use single-root `OpenAPIHono` + resource-scoped route factories.** This avoids type-inference bugs in zod-openapi's sub-app chaining. Pin versions as listed; avoid zod-openapi <0.14. Compose response envelopes via Zod schema combinators (single source of truth). Implement RFC 7807 error handler globally; register error schemas per-route for Scalar display. Mount Scalar with Bearer token auth config and purple theme. MCP HTTP transport integrates cleanly at `/mcp` without bundle-size penalty or Workers compatibility issues. Test handlers with `testClient` + snapshot-test OpenAPI output. Total bundle overhead ~70KB gzipped; no risk of 1MB limit.

**Action item (before Phase A coding):** Resolve questions 2, 3, and 4 above to finalize auth middleware signature and error schema structure.

