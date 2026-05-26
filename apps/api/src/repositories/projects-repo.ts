/**
 * Projects repository.
 *
 * Owns all DB access for the `projects` table. Every query is scoped by
 * `owner_id = ctx.ownerId` — cross-owner reads/writes are impossible by
 * construction. Route handlers never call Drizzle directly.
 *
 * Slug uniqueness is enforced at the `(owner_id, slug)` unique index; a
 * 23505 violation is re-thrown as `RepoConflictError('slug')` so the route
 * layer can translate to a 409 problem+json.
 */

import { and, desc, eq } from 'drizzle-orm'
import { projects } from '@fortunel/db'
import type { Project as ProjectRow } from '@fortunel/db'
import type { Project, ProjectCreate, ProjectUpdate } from '@fortunel/shared-types'
import {
  clampLimit,
  finalizePage,
  isUniqueViolation,
  keysetWhere,
  parseCursor,
  RepoConflictError,
  type KeysetPage,
  type ListOpts,
  type RepoCtx,
} from './base-repo'

export function serializeProject(row: ProjectRow): Project {
  return {
    id: row.id,
    owner_id: row.ownerId,
    slug: row.slug,
    title: row.title,
    description: row.description,
    tech: row.tech,
    links: row.links,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listProjects(
  ctx: RepoCtx,
  opts: ListOpts = {},
): Promise<KeysetPage<Project>> {
  const limit = clampLimit(opts.limit)
  const cursor = parseCursor(opts.cursor)
  const where = keysetWhere({
    ownerCol: projects.ownerId,
    ownerId: ctx.ownerId,
    createdCol: projects.createdAt,
    idCol: projects.id,
    cursor,
  })
  const rows = await ctx.db
    .select()
    .from(projects)
    .where(where)
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(limit + 1)
  const page = finalizePage(rows, limit)
  return {
    rows: page.rows.map(serializeProject),
    nextCursor: page.nextCursor,
    has_more: page.has_more,
  }
}

export async function getProject(ctx: RepoCtx, id: string): Promise<Project | null> {
  const rows = await ctx.db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ctx.ownerId)))
    .limit(1)
  const row = rows[0]
  return row ? serializeProject(row) : null
}

export async function createProject(ctx: RepoCtx, input: ProjectCreate): Promise<Project> {
  try {
    const rows = await ctx.db
      .insert(projects)
      .values({
        ownerId: ctx.ownerId,
        slug: input.slug,
        title: input.title,
        description: input.description ?? null,
        tech: input.tech ?? [],
        links: input.links ?? {},
        publishedAt: input.published_at ? new Date(input.published_at) : null,
      })
      .returning()
    return serializeProject(rows[0]!)
  } catch (err) {
    if (isUniqueViolation(err)) throw new RepoConflictError('slug')
    throw err
  }
}

export async function updateProject(
  ctx: RepoCtx,
  id: string,
  patch: ProjectUpdate,
): Promise<Project | null> {
  const values: Partial<typeof projects.$inferInsert> = {}
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.title !== undefined) values.title = patch.title
  if (patch.description !== undefined) values.description = patch.description ?? null
  if (patch.tech !== undefined) values.tech = patch.tech
  if (patch.links !== undefined) values.links = patch.links
  if (patch.published_at !== undefined) {
    values.publishedAt = patch.published_at ? new Date(patch.published_at) : null
  }
  if (Object.keys(values).length === 0) {
    return getProject(ctx, id)
  }
  try {
    const rows = await ctx.db
      .update(projects)
      .set(values)
      .where(and(eq(projects.id, id), eq(projects.ownerId, ctx.ownerId)))
      .returning()
    const row = rows[0]
    return row ? serializeProject(row) : null
  } catch (err) {
    if (isUniqueViolation(err)) throw new RepoConflictError('slug')
    throw err
  }
}

export async function deleteProject(ctx: RepoCtx, id: string): Promise<boolean> {
  const rows = await ctx.db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.ownerId, ctx.ownerId)))
    .returning({ id: projects.id })
  return rows.length > 0
}
