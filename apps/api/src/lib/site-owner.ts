/**
 * Single-tenant V1 helper: resolve "the site owner" — the user whose mailbox
 * the public contact form should drop into. We pick the oldest user row by
 * `created_at` (Better Auth issues a single owner during bootstrap).
 *
 * The result is cached per Worker isolate. This is safe because:
 * - V1 is single-tenant; the owner does not change at runtime.
 * - When V2 introduces multi-tenant signups we'll replace the cache with a
 *   per-host lookup; that's a deliberate refactor, not a regression.
 *
 * Returns `null` if no user exists yet (fresh DB before first sign-up). The
 * route layer translates this to a 503 so the form cannot silently swallow
 * messages.
 *
 * Caveat (V1 limitation): the cache has no TTL or invalidation hook. If the
 * bootstrap owner is ever deleted at runtime (no admin endpoint exposes this
 * today), subsequent contact submits will FK-violate on owner_id and 500.
 * Deletion of the bootstrap user is explicitly unsupported in V1.
 */

import { asc } from 'drizzle-orm'
import { users } from '@fortunel/db'
import type { Database } from '@fortunel/db'

let cached: string | null = null
let lookupInFlight: Promise<string | null> | null = null

export async function resolveSiteOwnerId(db: Database): Promise<string | null> {
  if (cached) return cached
  if (lookupInFlight) return lookupInFlight
  lookupInFlight = (async () => {
    const rows = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1)
    const id = rows[0]?.id ?? null
    if (id) cached = id
    return id
  })()
  try {
    return await lookupInFlight
  } finally {
    lookupInFlight = null
  }
}

/** Test-only: clear the isolate-level cache between cases. */
export function __resetSiteOwnerCache(): void {
  cached = null
  lookupInFlight = null
}
