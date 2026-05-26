/**
 * Shared repository primitives.
 *
 * Repos own all DB access and bake `owner_id` filtering into every query.
 * Route handlers never call Drizzle directly — this is enforced by the
 * `no-drizzle-in-routes` structural test.
 *
 * `keysetPage` returns the standard `{ rows, nextCursor, has_more }` shape:
 * fetch limit+1, drop the extra, encode a cursor from the last visible row.
 */

import { and, eq, lt, or } from 'drizzle-orm'
import type { AnyColumn, SQL } from 'drizzle-orm'
import type { Database } from '@fortunel/db'
import { decodeCursor, encodeCursor, type CursorPayload } from '../lib/cursor'

export interface RepoCtx {
  db: Database
  ownerId: string
}

export interface ListOpts {
  cursor?: string | null
  limit?: number
}

export interface KeysetPage<T> {
  rows: T[]
  nextCursor: string | null
  has_more: boolean
}

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100

export function clampLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT)
}

/**
 * Build the keyset WHERE fragment for `owner = ? AND (created_at, id) < cursor`.
 * Returns the owner-only predicate when no cursor is supplied.
 */
export function keysetWhere(args: {
  ownerCol: AnyColumn
  ownerId: string
  createdCol: AnyColumn
  idCol: AnyColumn
  cursor: CursorPayload | null
}): SQL {
  const ownerOnly = eq(args.ownerCol, args.ownerId)
  if (!args.cursor) return ownerOnly
  const cursorDate = new Date(args.cursor.created_at)
  const predicate = or(
    lt(args.createdCol, cursorDate),
    and(eq(args.createdCol, cursorDate), lt(args.idCol, args.cursor.id)),
  )!
  return and(ownerOnly, predicate)!
}

export function parseCursor(raw: string | undefined | null): CursorPayload | null {
  return decodeCursor(raw)
}

/** Thrown by repos when an insert/update violates a unique constraint. */
export class RepoConflictError extends Error {
  constructor(public readonly field: string) {
    super(`conflict on ${field}`)
    this.name = 'RepoConflictError'
  }
}

/** Postgres unique-violation SQLSTATE. */
const PG_UNIQUE_VIOLATION = '23505'

export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  if (code === PG_UNIQUE_VIOLATION) return true
  // neon-http surfaces driver-side errors with cause.
  const cause = (err as { cause?: unknown }).cause
  if (cause && typeof cause === 'object' && (cause as { code?: unknown }).code === PG_UNIQUE_VIOLATION) {
    return true
  }
  return false
}

/**
 * Slice the over-fetched window into `{rows, nextCursor, has_more}`.
 * The caller already SELECTed `limit + 1`; we drop the extra and use the
 * last visible row's `(id, created_at)` to mint the next cursor.
 */
export function finalizePage<T extends { id: string; createdAt: Date | string }>(
  fetched: T[],
  limit: number,
): KeysetPage<T> {
  const has_more = fetched.length > limit
  const rows = has_more ? fetched.slice(0, limit) : fetched
  const last = rows[rows.length - 1]
  const nextCursor =
    has_more && last
      ? encodeCursor({
          id: last.id,
          created_at:
            last.createdAt instanceof Date ? last.createdAt.toISOString() : last.createdAt,
        })
      : null
  return { rows, nextCursor, has_more }
}
