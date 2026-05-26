/**
 * Posts repository — same contract as projects-repo.
 *
 * Every query bakes in `owner_id = ctx.ownerId`. Slug uniqueness is enforced
 * by the `(owner_id, slug)` unique index; 23505 → RepoConflictError('slug').
 */

import { and, desc, eq } from 'drizzle-orm'
import { posts } from '@fortunel/db'
import type { Post as PostRow } from '@fortunel/db'
import type { Post, PostCreate, PostUpdate } from '@fortunel/shared-types'
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

export function serializePost(row: PostRow): Post {
  return {
    id: row.id,
    owner_id: row.ownerId,
    slug: row.slug,
    title: row.title,
    body_md: row.bodyMd,
    excerpt: row.excerpt,
    tags: row.tags,
    published_at: row.publishedAt ? row.publishedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listPosts(
  ctx: RepoCtx,
  opts: ListOpts = {},
): Promise<KeysetPage<Post>> {
  const limit = clampLimit(opts.limit)
  const cursor = parseCursor(opts.cursor)
  const where = keysetWhere({
    ownerCol: posts.ownerId,
    ownerId: ctx.ownerId,
    createdCol: posts.createdAt,
    idCol: posts.id,
    cursor,
  })
  const rows = await ctx.db
    .select()
    .from(posts)
    .where(where)
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit + 1)
  const page = finalizePage(rows, limit)
  return {
    rows: page.rows.map(serializePost),
    nextCursor: page.nextCursor,
    has_more: page.has_more,
  }
}

export async function getPost(ctx: RepoCtx, id: string): Promise<Post | null> {
  const rows = await ctx.db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), eq(posts.ownerId, ctx.ownerId)))
    .limit(1)
  const row = rows[0]
  return row ? serializePost(row) : null
}

export async function createPost(ctx: RepoCtx, input: PostCreate): Promise<Post> {
  try {
    const rows = await ctx.db
      .insert(posts)
      .values({
        ownerId: ctx.ownerId,
        slug: input.slug,
        title: input.title,
        bodyMd: input.body_md,
        excerpt: input.excerpt ?? null,
        tags: input.tags ?? [],
        publishedAt: input.published_at ? new Date(input.published_at) : null,
      })
      .returning()
    return serializePost(rows[0]!)
  } catch (err) {
    if (isUniqueViolation(err)) throw new RepoConflictError('slug')
    throw err
  }
}

export async function updatePost(
  ctx: RepoCtx,
  id: string,
  patch: PostUpdate,
): Promise<Post | null> {
  const values: Partial<typeof posts.$inferInsert> = {}
  if (patch.slug !== undefined) values.slug = patch.slug
  if (patch.title !== undefined) values.title = patch.title
  if (patch.body_md !== undefined) values.bodyMd = patch.body_md
  if (patch.excerpt !== undefined) values.excerpt = patch.excerpt ?? null
  if (patch.tags !== undefined) values.tags = patch.tags
  if (patch.published_at !== undefined) {
    values.publishedAt = patch.published_at ? new Date(patch.published_at) : null
  }
  if (Object.keys(values).length === 0) {
    return getPost(ctx, id)
  }
  try {
    const rows = await ctx.db
      .update(posts)
      .set(values)
      .where(and(eq(posts.id, id), eq(posts.ownerId, ctx.ownerId)))
      .returning()
    const row = rows[0]
    return row ? serializePost(row) : null
  } catch (err) {
    if (isUniqueViolation(err)) throw new RepoConflictError('slug')
    throw err
  }
}

export async function deletePost(ctx: RepoCtx, id: string): Promise<boolean> {
  const rows = await ctx.db
    .delete(posts)
    .where(and(eq(posts.id, id), eq(posts.ownerId, ctx.ownerId)))
    .returning({ id: posts.id })
  return rows.length > 0
}
