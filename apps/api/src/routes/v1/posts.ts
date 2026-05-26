/**
 * /v1/posts — owner-scoped CRUD mirroring projects.
 *
 * Scope vocabulary: `posts:read` for GETs, `posts:write` for mutations.
 */

import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import {
  paginationQuerySchema,
  postCreateSchema,
  postSchema,
  postUpdateSchema,
  uuidSchema,
} from '@fortunel/shared-types'
import type { AppBindings } from '../../lib/context'
import { requireScope } from '../../auth/scopes'
import { okEnvelope, pageEnvelope, repoCtx, rethrowConflict } from '../../lib/route-helpers'
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  updatePost,
} from '../../repositories/posts-repo'

const postEnvelope = z
  .object({ data: postSchema, meta: z.null(), errors: z.null() })
  .openapi('PostEnvelope')

const postListEnvelope = z
  .object({
    data: z.array(postSchema),
    meta: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }),
    errors: z.null(),
  })
  .openapi('PostListEnvelope')

const idParam = z.object({ id: uuidSchema })

const listRoute = createRoute({
  method: 'get',
  path: '/v1/posts',
  tags: ['posts'],
  summary: 'List posts (owner-scoped, keyset cursor)',
  request: { query: paginationQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: postListEnvelope } }, description: 'OK' },
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/v1/posts/{id}',
  tags: ['posts'],
  summary: 'Get a post by id',
  request: { params: idParam },
  responses: {
    200: { content: { 'application/json': { schema: postEnvelope } }, description: 'OK' },
    404: { description: 'Not found' },
  },
})

const createRouteSpec = createRoute({
  method: 'post',
  path: '/v1/posts',
  tags: ['posts'],
  summary: 'Create a post',
  request: {
    body: { content: { 'application/json': { schema: postCreateSchema } }, required: true },
  },
  responses: {
    201: { content: { 'application/json': { schema: postEnvelope } }, description: 'Created' },
    409: { description: 'Slug conflict' },
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/posts/{id}',
  tags: ['posts'],
  summary: 'Update a post',
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: postUpdateSchema } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: postEnvelope } }, description: 'OK' },
    404: { description: 'Not found' },
    409: { description: 'Slug conflict' },
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/posts/{id}',
  tags: ['posts'],
  summary: 'Delete a post',
  request: { params: idParam },
  responses: {
    204: { description: 'Deleted' },
    404: { description: 'Not found' },
  },
})

export function registerPostRoutes(app: OpenAPIHono<AppBindings>): void {
  app.openapi(listRoute, async (c) => {
    requireScope(c, 'posts:read')
    const { cursor, limit } = c.req.valid('query')
    const page = await listPosts(repoCtx(c), { cursor, limit })
    return c.json(pageEnvelope(page), 200)
  })

  app.openapi(getRoute, async (c) => {
    requireScope(c, 'posts:read')
    const { id } = c.req.valid('param')
    const row = await getPost(repoCtx(c), id)
    if (!row) throw new HTTPException(404, { message: 'Post not found' })
    return c.json(okEnvelope(row), 200)
  })

  app.openapi(createRouteSpec, async (c) => {
    requireScope(c, 'posts:write')
    const input = c.req.valid('json')
    try {
      const row = await createPost(repoCtx(c), input)
      return c.json(okEnvelope(row), 201)
    } catch (err) {
      rethrowConflict(err)
    }
  })

  app.openapi(updateRoute, async (c) => {
    requireScope(c, 'posts:write')
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    try {
      const row = await updatePost(repoCtx(c), id, patch)
      if (!row) throw new HTTPException(404, { message: 'Post not found' })
      return c.json(okEnvelope(row), 200)
    } catch (err) {
      if (err instanceof HTTPException) throw err
      rethrowConflict(err)
    }
  })

  app.openapi(deleteRoute, async (c) => {
    requireScope(c, 'posts:write')
    const { id } = c.req.valid('param')
    const ok = await deletePost(repoCtx(c), id)
    if (!ok) throw new HTTPException(404, { message: 'Post not found' })
    return c.body(null, 204)
  })
}
