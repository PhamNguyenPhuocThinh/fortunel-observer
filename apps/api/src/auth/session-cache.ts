/**
 * Write-through KV cache for Better Auth sessions.
 *
 * Better Auth's built-in `cookieCache` is disabled because issue #4203 keeps
 * expired cookies live. Without this cache, every protected request would round
 * trip to Postgres for session lookup — unacceptable on the edge.
 *
 * Stored shape: `{ userId, expiresAt }` keyed by session id.
 * TTL: 60s (short enough that rotation/revocation is observed quickly).
 */

const TTL_SECONDS = 60

export interface CachedSession {
  userId: string
  /** ISO 8601 timestamp of when the underlying DB session expires. */
  expiresAt: string
}

function key(sessionId: string): string {
  return `sess:${sessionId}`
}

export async function readSession(
  kv: KVNamespace | undefined,
  sessionId: string,
): Promise<CachedSession | null> {
  if (!kv) return null
  const raw = await kv.get(key(sessionId))
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as CachedSession
    if (!parsed.userId || !parsed.expiresAt) return null
    if (Date.parse(parsed.expiresAt) <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export async function writeSession(
  kv: KVNamespace | undefined,
  sessionId: string,
  value: CachedSession,
): Promise<void> {
  if (!kv) return
  const dbTtlSec = Math.max(1, Math.floor((Date.parse(value.expiresAt) - Date.now()) / 1000))
  const ttl = Math.min(TTL_SECONDS, dbTtlSec)
  await kv.put(key(sessionId), JSON.stringify(value), { expirationTtl: ttl })
}

export async function invalidateSession(
  kv: KVNamespace | undefined,
  sessionId: string,
): Promise<void> {
  if (!kv) return
  await kv.delete(key(sessionId))
}
