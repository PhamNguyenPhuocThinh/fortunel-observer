/**
 * /v1/api-keys — mint / list / get / revoke, all owner-scoped.
 *
 * Mint returns the plaintext token ONCE in the response envelope's `data`
 * (under `plaintext`). Subsequent reads never expose it — we only persist a
 * scrypt hash + the short `key_prefix` for lookup.
 *
 * Scope vocabulary doesn't carve out api-key management; we rely on
 * `*:*` (session users) so an API key can't escalate by minting more keys
 * unless it already has `*:*`.
 */

import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import {
  apiKeyCreateSchema,
  apiKeyMintedSchema,
  apiKeySchema,
  paginationQuerySchema,
  uuidSchema,
} from '@fortunel/shared-types'
import type { AppBindings } from '../../lib/context'
import { requireScope } from '../../auth/scopes'
import { mintApiKey } from '../../auth/api-key'
import { getDb, okEnvelope, pageEnvelope, repoCtx } from '../../lib/route-helpers'
import {
  getApiKey,
  listApiKeys,
  revokeOwnedApiKey,
  serializeApiKey,
  serializeMintResult,
} from '../../repositories/api-keys-repo'

const apiKeyEnvelope = z
  .object({ data: apiKeySchema, meta: z.null(), errors: z.null() })
  .openapi('ApiKeyEnvelope')

const apiKeyMintedEnvelope = z
  .object({ data: apiKeyMintedSchema, meta: z.null(), errors: z.null() })
  .openapi('ApiKeyMintedEnvelope')

const apiKeyListEnvelope = z
  .object({
    data: z.array(apiKeySchema),
    meta: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }),
    errors: z.null(),
  })
  .openapi('ApiKeyListEnvelope')

const idParam = z.object({ id: uuidSchema })

const listRoute = createRoute({
  method: 'get',
  path: '/v1/api-keys',
  tags: ['api-keys'],
  summary: 'List API keys (owner-scoped)',
  request: { query: paginationQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: apiKeyListEnvelope } }, description: 'OK' },
  },
})

const getRouteSpec = createRoute({
  method: 'get',
  path: '/v1/api-keys/{id}',
  tags: ['api-keys'],
  summary: 'Get an API key by id',
  request: { params: idParam },
  responses: {
    200: { content: { 'application/json': { schema: apiKeyEnvelope } }, description: 'OK' },
    404: { description: 'Not found' },
  },
})

const mintRoute = createRoute({
  method: 'post',
  path: '/v1/api-keys',
  tags: ['api-keys'],
  summary: 'Mint a new API key (plaintext shown once)',
  request: {
    body: { content: { 'application/json': { schema: apiKeyCreateSchema } }, required: true },
  },
  responses: {
    201: { content: { 'application/json': { schema: apiKeyMintedEnvelope } }, description: 'Created' },
  },
})

const revokeRoute = createRoute({
  method: 'delete',
  path: '/v1/api-keys/{id}',
  tags: ['api-keys'],
  summary: 'Revoke an API key',
  request: { params: idParam },
  responses: {
    204: { description: 'Revoked' },
    404: { description: 'Not found or already revoked' },
  },
})

export function registerApiKeyRoutes(app: OpenAPIHono<AppBindings>): void {
  app.openapi(listRoute, async (c) => {
    requireScope(c, '*:*')
    const { cursor, limit } = c.req.valid('query')
    const page = await listApiKeys(repoCtx(c), { cursor, limit })
    return c.json(pageEnvelope(page), 200)
  })

  app.openapi(getRouteSpec, async (c) => {
    requireScope(c, '*:*')
    const { id } = c.req.valid('param')
    const row = await getApiKey(repoCtx(c), id)
    if (!row) throw new HTTPException(404, { message: 'API key not found' })
    return c.json(okEnvelope(row), 200)
  })

  app.openapi(mintRoute, async (c) => {
    requireScope(c, '*:*')
    const user = c.get('user')
    if (!user) throw new HTTPException(401, { message: 'Unauthorized' })
    const input = c.req.valid('json')
    const db = getDb(c)
    const minted = await mintApiKey(db, {
      ownerId: user.id,
      name: input.name,
      scopes: input.scopes,
      expiresAt: input.expires_at ? new Date(input.expires_at) : null,
    })
    // mintApiKey already returns the persisted fields; skip a second roundtrip.
    // last_used_at and revoked_at are always null at mint time by construction.
    const row = serializeMintResult(minted)
    const body = okEnvelope({ ...row, plaintext: minted.plaintext })
    return c.json(body, 201)
  })

  app.openapi(revokeRoute, async (c) => {
    requireScope(c, '*:*')
    const { id } = c.req.valid('param')
    const ok = await revokeOwnedApiKey(repoCtx(c), id)
    if (!ok) throw new HTTPException(404, { message: 'API key not found or already revoked' })
    return c.body(null, 204)
  })
}

// Re-export for any consumer that wants the same camelCase→snake_case mapping.
export { serializeApiKey }
