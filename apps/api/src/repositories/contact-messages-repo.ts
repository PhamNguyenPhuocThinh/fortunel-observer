/**
 * Contact-messages repository.
 *
 * Public callers POST a message → we stamp the site owner (resolved by the
 * route layer via the site-owner lookup) and capture ip/user_agent.
 * Admin GET/markRead are owner-scoped like every other repo.
 *
 * Marking-as-read is an idempotent update with `read_at = now()`; we expose
 * `markRead` rather than a generic update because that's the only mutation
 * the API surface needs.
 */

import { and, desc, eq } from 'drizzle-orm'
import { contactMessages } from '@fortunel/db'
import type { ContactMessage as ContactMessageRow } from '@fortunel/db'
import type {
  ContactMessage,
  ContactMessageCreate,
} from '@fortunel/shared-types'
import {
  clampLimit,
  finalizePage,
  keysetWhere,
  parseCursor,
  type KeysetPage,
  type ListOpts,
  type RepoCtx,
} from './base-repo'

export interface IngestMeta {
  ip?: string | null
  userAgent?: string | null
}

export function serializeContactMessage(row: ContactMessageRow): ContactMessage {
  return {
    id: row.id,
    owner_id: row.ownerId,
    from_name: row.fromName,
    from_email: row.fromEmail,
    subject: row.subject,
    message: row.message,
    ip: row.ip,
    user_agent: row.userAgent,
    read_at: row.readAt ? row.readAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
  }
}

export async function listContactMessages(
  ctx: RepoCtx,
  opts: ListOpts = {},
): Promise<KeysetPage<ContactMessage>> {
  const limit = clampLimit(opts.limit)
  const cursor = parseCursor(opts.cursor)
  const where = keysetWhere({
    ownerCol: contactMessages.ownerId,
    ownerId: ctx.ownerId,
    createdCol: contactMessages.createdAt,
    idCol: contactMessages.id,
    cursor,
  })
  const rows = await ctx.db
    .select()
    .from(contactMessages)
    .where(where)
    .orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
    .limit(limit + 1)
  const page = finalizePage(rows, limit)
  return {
    rows: page.rows.map(serializeContactMessage),
    nextCursor: page.nextCursor,
    has_more: page.has_more,
  }
}

export async function getContactMessage(
  ctx: RepoCtx,
  id: string,
): Promise<ContactMessage | null> {
  const rows = await ctx.db
    .select()
    .from(contactMessages)
    .where(and(eq(contactMessages.id, id), eq(contactMessages.ownerId, ctx.ownerId)))
    .limit(1)
  const row = rows[0]
  return row ? serializeContactMessage(row) : null
}

/**
 * Insert a public contact-form submission. The owner is the site owner
 * (resolved outside this repo) — there's no per-user contact form in V1.
 */
export async function createContactMessage(
  ctx: RepoCtx,
  input: ContactMessageCreate,
  meta: IngestMeta = {},
): Promise<ContactMessage> {
  const rows = await ctx.db
    .insert(contactMessages)
    .values({
      ownerId: ctx.ownerId,
      fromName: input.from_name,
      fromEmail: input.from_email,
      subject: input.subject ?? null,
      message: input.message,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    })
    .returning()
  return serializeContactMessage(rows[0]!)
}

export async function markContactMessageRead(
  ctx: RepoCtx,
  id: string,
): Promise<ContactMessage | null> {
  const rows = await ctx.db
    .update(contactMessages)
    .set({ readAt: new Date() })
    .where(and(eq(contactMessages.id, id), eq(contactMessages.ownerId, ctx.ownerId)))
    .returning()
  const row = rows[0]
  return row ? serializeContactMessage(row) : null
}
