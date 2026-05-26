/**
 * API-keys repository — owner-scoped reads + revoke.
 *
 * Mint lives in `auth/api-key.ts` (it must return the plaintext exactly
 * once); list/get/revoke for the management surface live here so the route
 * layer never touches Drizzle directly.
 */

import { and, desc, eq, isNull } from 'drizzle-orm'
import { apiKeys } from '@fortunel/db'
import type { ApiKey as ApiKeyRow } from '@fortunel/db'
import type { ApiKey } from '@fortunel/shared-types'
import {
  clampLimit,
  finalizePage,
  keysetWhere,
  parseCursor,
  type KeysetPage,
  type ListOpts,
  type RepoCtx,
} from './base-repo'
import { parseScopes } from '../auth/scopes'
import type { MintResult } from '../auth/api-key'

export function serializeApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    owner_id: row.ownerId,
    name: row.name,
    key_prefix: row.keyPrefix,
    scopes: parseScopes(row.scopes),
    last_used_at: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expires_at: row.expiresAt ? row.expiresAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    revoked_at: row.revokedAt ? row.revokedAt.toISOString() : null,
  }
}

/**
 * Serialize a fresh MintResult without a second DB read. At mint time
 * last_used_at and revoked_at are always null by construction.
 */
export function serializeMintResult(m: MintResult): ApiKey {
  return {
    id: m.id,
    owner_id: m.ownerId,
    name: m.name,
    key_prefix: m.keyPrefix,
    scopes: parseScopes(m.scopes),
    last_used_at: null,
    expires_at: m.expiresAt ? m.expiresAt.toISOString() : null,
    created_at: m.createdAt.toISOString(),
    revoked_at: null,
  }
}

export async function listApiKeys(
  ctx: RepoCtx,
  opts: ListOpts = {},
): Promise<KeysetPage<ApiKey>> {
  const limit = clampLimit(opts.limit)
  const cursor = parseCursor(opts.cursor)
  const where = keysetWhere({
    ownerCol: apiKeys.ownerId,
    ownerId: ctx.ownerId,
    createdCol: apiKeys.createdAt,
    idCol: apiKeys.id,
    cursor,
  })
  const rows = await ctx.db
    .select()
    .from(apiKeys)
    .where(where)
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
    .limit(limit + 1)
  const page = finalizePage(rows, limit)
  return {
    rows: page.rows.map(serializeApiKey),
    nextCursor: page.nextCursor,
    has_more: page.has_more,
  }
}

export async function getApiKey(ctx: RepoCtx, id: string): Promise<ApiKey | null> {
  const rows = await ctx.db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.ownerId, ctx.ownerId)))
    .limit(1)
  const row = rows[0]
  return row ? serializeApiKey(row) : null
}

/**
 * Revoke is owner-scoped and idempotent on already-revoked keys.
 * Returns true if THIS call moved revoked_at from null → now.
 */
export async function revokeOwnedApiKey(ctx: RepoCtx, id: string): Promise<boolean> {
  const updated = await ctx.db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.ownerId, ctx.ownerId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })
  return updated.length > 0
}
