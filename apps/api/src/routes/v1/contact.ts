/**
 * /v1/contact — public submit (unauthenticated) + admin read.
 *
 * Public POST defenses:
 *   - IP-keyed rate limit (5 / hour) applied at this route only.
 *   - Cloudflare Turnstile when `TURNSTILE_SECRET_KEY` is set (toggle-ready).
 *   - Body validation via the shared Zod schema.
 *
 * The "owner" of inbound messages is the single site owner (V1 is
 * single-tenant). Resolved via `resolveSiteOwnerId` and cached per isolate.
 *
 * Admin endpoints (`GET /v1/contact`, `GET /v1/contact/:id`, mark-read) require
 * `contact:read` / `contact:write` scopes and run behind the global auth
 * middleware (mounted on `/v1/*`).
 */

import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import {
  contactMessageCreateSchema,
  contactMessageSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@fortunel/shared-types'
import type { AppBindings } from '../../lib/context'
import { parseEnv } from '../../lib/env'
import { requireScope } from '../../auth/scopes'
import { clientIp, getDb, okEnvelope, pageEnvelope, repoCtx } from '../../lib/route-helpers'
import { rateLimit } from '../../middleware/rate-limit'
import { resolveSiteOwnerId } from '../../lib/site-owner'
import { verifyTurnstile } from '../../lib/turnstile'
import {
  createContactMessage,
  getContactMessage,
  listContactMessages,
  markContactMessageRead,
} from '../../repositories/contact-messages-repo'

const contactEnvelope = z
  .object({ data: contactMessageSchema, meta: z.null(), errors: z.null() })
  .openapi('ContactMessageEnvelope')

const contactListEnvelope = z
  .object({
    data: z.array(contactMessageSchema),
    meta: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }),
    errors: z.null(),
  })
  .openapi('ContactMessageListEnvelope')

const publicCreateSchema = contactMessageCreateSchema
  .extend({ turnstile_token: z.string().optional() })
  .openapi('ContactMessageCreateBody')

const idParam = z.object({ id: uuidSchema })

const createRouteSpec = createRoute({
  method: 'post',
  path: '/v1/contact',
  tags: ['contact'],
  summary: 'Public contact-form submission',
  security: [],
  request: {
    body: { content: { 'application/json': { schema: publicCreateSchema } }, required: true },
  },
  responses: {
    201: { content: { 'application/json': { schema: contactEnvelope } }, description: 'Accepted' },
    403: { description: 'Turnstile verification failed' },
    429: { description: 'Too many submissions from this IP' },
    503: { description: 'Site owner not yet provisioned' },
  },
})

const listRoute = createRoute({
  method: 'get',
  path: '/v1/contact',
  tags: ['contact'],
  summary: 'List contact messages (owner-scoped)',
  request: { query: paginationQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: contactListEnvelope } }, description: 'OK' },
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/v1/contact/{id}',
  tags: ['contact'],
  summary: 'Get a contact message by id',
  request: { params: idParam },
  responses: {
    200: { content: { 'application/json': { schema: contactEnvelope } }, description: 'OK' },
    404: { description: 'Not found' },
  },
})

const markReadRoute = createRoute({
  method: 'post',
  path: '/v1/contact/{id}/read',
  tags: ['contact'],
  summary: 'Mark a contact message as read',
  request: { params: idParam },
  responses: {
    200: { content: { 'application/json': { schema: contactEnvelope } }, description: 'OK' },
    404: { description: 'Not found' },
  },
})

export function registerContactRoutes(app: OpenAPIHono<AppBindings>): void {
  // IP-keyed 5/hour cap on the public POST. Mounted via a wildcard prefix so
  // it runs *before* the per-route handler — the route definition itself does
  // not accept middleware in @hono/zod-openapi 0.16.
  // Explicit path guard: defensively scope to exactly POST /v1/contact[/]
  // so a future Hono prefix-matching change can't accidentally rate-limit
  // admin endpoints like POST /v1/contact/{id}/read.
  app.use(
    '/v1/contact',
    async (c, next) => {
      if (c.req.method !== 'POST') return next()
      const p = c.req.path
      if (p !== '/v1/contact' && p !== '/v1/contact/') return next()
      const ipLimiter = rateLimit({
        limit: 5,
        windowMs: 60 * 60 * 1000,
        prefix: 'rl-contact',
        keyFn: (ctx) => {
          const ip = clientIp(ctx)
          return ip ? `ip:${ip}` : null
        },
      })
      return ipLimiter(c, next)
    },
  )

  app.openapi(createRouteSpec, async (c) => {
    const env = parseEnv(c.env as unknown as Record<string, unknown>)
    const body = c.req.valid('json')

    const ts = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET_KEY,
      token: body.turnstile_token ?? null,
      remoteIp: clientIp(c),
    })
    if (!ts.ok) {
      throw new HTTPException(403, {
        message: `Turnstile verification failed: ${ts.error ?? 'unknown'}`,
      })
    }

    const db = getDb(c)
    const ownerId = await resolveSiteOwnerId(db)
    if (!ownerId) {
      throw new HTTPException(503, { message: 'Site owner not yet provisioned' })
    }

    const row = await createContactMessage(
      { db, ownerId },
      {
        from_name: body.from_name,
        from_email: body.from_email,
        subject: body.subject ?? null,
        message: body.message,
      },
      { ip: clientIp(c), userAgent: c.req.header('User-Agent') ?? null },
    )
    return c.json(okEnvelope(row), 201)
  })

  app.openapi(listRoute, async (c) => {
    requireScope(c, 'contact:read')
    const { cursor, limit } = c.req.valid('query')
    const page = await listContactMessages(repoCtx(c), { cursor, limit })
    return c.json(pageEnvelope(page), 200)
  })

  app.openapi(getRoute, async (c) => {
    requireScope(c, 'contact:read')
    const { id } = c.req.valid('param')
    const row = await getContactMessage(repoCtx(c), id)
    if (!row) throw new HTTPException(404, { message: 'Contact message not found' })
    return c.json(okEnvelope(row), 200)
  })

  app.openapi(markReadRoute, async (c) => {
    requireScope(c, 'contact:write')
    const { id } = c.req.valid('param')
    const row = await markContactMessageRead(repoCtx(c), id)
    if (!row) throw new HTTPException(404, { message: 'Contact message not found' })
    return c.json(okEnvelope(row), 200)
  })
}
