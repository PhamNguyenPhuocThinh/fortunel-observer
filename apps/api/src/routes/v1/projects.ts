/**
 * /v1/projects — CRUD scoped by `owner_id = c.var.user.id`.
 *
 * Scopes:
 *   GET    /v1/projects          projects:read
 *   POST   /v1/projects          projects:write
 *   GET    /v1/projects/:id      projects:read
 *   PATCH  /v1/projects/:id      projects:write
 *   DELETE /v1/projects/:id      projects:write
 *
 * Cursor-only list (no `?fields=`, no `?sort=` — deferred to V2 per the
 * Phase 6 plan revision).
 */

import { createRoute, z } from '@hono/zod-openapi'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import {
  paginationQuerySchema,
  projectCreateSchema,
  projectSchema,
  projectUpdateSchema,
  uuidSchema,
} from '@fortunel/shared-types'
import type { AppBindings } from '../../lib/context'
import { requireScope } from '../../auth/scopes'
import { okEnvelope, pageEnvelope, repoCtx, rethrowConflict } from '../../lib/route-helpers'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from '../../repositories/projects-repo'

const projectEnvelope = z
  .object({ data: projectSchema, meta: z.null(), errors: z.null() })
  .openapi('ProjectEnvelope')

const projectListEnvelope = z
  .object({
    data: z.array(projectSchema),
    meta: z.object({ cursor: z.string().nullable(), has_more: z.boolean() }),
    errors: z.null(),
  })
  .openapi('ProjectListEnvelope')

const idParam = z.object({ id: uuidSchema })

const listRoute = createRoute({
  method: 'get',
  path: '/v1/projects',
  tags: ['projects'],
  summary: 'List projects (owner-scoped, keyset cursor)',
  request: { query: paginationQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: projectListEnvelope } }, description: 'OK' },
  },
})

const getRoute = createRoute({
  method: 'get',
  path: '/v1/projects/{id}',
  tags: ['projects'],
  summary: 'Get a project by id',
  request: { params: idParam },
  responses: {
    200: { content: { 'application/json': { schema: projectEnvelope } }, description: 'OK' },
    404: { description: 'Not found' },
  },
})

const createRouteSpec = createRoute({
  method: 'post',
  path: '/v1/projects',
  tags: ['projects'],
  summary: 'Create a project',
  request: {
    body: { content: { 'application/json': { schema: projectCreateSchema } }, required: true },
  },
  responses: {
    201: { content: { 'application/json': { schema: projectEnvelope } }, description: 'Created' },
    409: { description: 'Slug conflict' },
  },
})

const updateRoute = createRoute({
  method: 'patch',
  path: '/v1/projects/{id}',
  tags: ['projects'],
  summary: 'Update a project',
  request: {
    params: idParam,
    body: { content: { 'application/json': { schema: projectUpdateSchema } }, required: true },
  },
  responses: {
    200: { content: { 'application/json': { schema: projectEnvelope } }, description: 'OK' },
    404: { description: 'Not found' },
    409: { description: 'Slug conflict' },
  },
})

const deleteRoute = createRoute({
  method: 'delete',
  path: '/v1/projects/{id}',
  tags: ['projects'],
  summary: 'Delete a project',
  request: { params: idParam },
  responses: {
    204: { description: 'Deleted' },
    404: { description: 'Not found' },
  },
})

export function registerProjectRoutes(app: OpenAPIHono<AppBindings>): void {
  app.openapi(listRoute, async (c) => {
    requireScope(c, 'projects:read')
    const { cursor, limit } = c.req.valid('query')
    const page = await listProjects(repoCtx(c), { cursor, limit })
    return c.json(pageEnvelope(page), 200)
  })

  app.openapi(getRoute, async (c) => {
    requireScope(c, 'projects:read')
    const { id } = c.req.valid('param')
    const row = await getProject(repoCtx(c), id)
    if (!row) throw new HTTPException(404, { message: 'Project not found' })
    return c.json(okEnvelope(row), 200)
  })

  app.openapi(createRouteSpec, async (c) => {
    requireScope(c, 'projects:write')
    const input = c.req.valid('json')
    try {
      const row = await createProject(repoCtx(c), input)
      return c.json(okEnvelope(row), 201)
    } catch (err) {
      rethrowConflict(err)
    }
  })

  app.openapi(updateRoute, async (c) => {
    requireScope(c, 'projects:write')
    const { id } = c.req.valid('param')
    const patch = c.req.valid('json')
    try {
      const row = await updateProject(repoCtx(c), id, patch)
      if (!row) throw new HTTPException(404, { message: 'Project not found' })
      return c.json(okEnvelope(row), 200)
    } catch (err) {
      if (err instanceof HTTPException) throw err
      rethrowConflict(err)
    }
  })

  app.openapi(deleteRoute, async (c) => {
    requireScope(c, 'projects:write')
    const { id } = c.req.valid('param')
    const ok = await deleteProject(repoCtx(c), id)
    if (!ok) throw new HTTPException(404, { message: 'Project not found' })
    return c.body(null, 204)
  })
}
