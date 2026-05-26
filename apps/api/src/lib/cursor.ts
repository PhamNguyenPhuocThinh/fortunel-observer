/**
 * Opaque keyset-pagination cursor.
 *
 * Encodes `{ id, created_at }` of the last returned row as base64url-JSON.
 * Repositories decode the cursor and translate it into a WHERE clause:
 *   created_at < cursor.created_at
 *   OR (created_at = cursor.created_at AND id < cursor.id)
 *
 * The format is intentionally not signed — the contents (a row id + timestamp)
 * are not secret. If we ever need tamper-evidence, add an HMAC suffix.
 */

export interface CursorPayload {
  id: string
  created_at: string
}

function base64UrlEncode(bin: string): string {
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (padded.length % 4)) % 4
  return atob(padded + '='.repeat(pad))
}

export function encodeCursor(payload: CursorPayload): string {
  return base64UrlEncode(JSON.stringify(payload))
}

export function decodeCursor(raw: string | undefined | null): CursorPayload | null {
  if (!raw) return null
  // Belt-and-suspenders bound. The route layer caps at 512 via Zod; this
  // guards any direct caller from a future code path.
  if (raw.length > 1024) return null
  try {
    const parsed = JSON.parse(base64UrlDecode(raw)) as { id?: unknown; created_at?: unknown }
    if (typeof parsed.id !== 'string' || !parsed.id) return null
    if (typeof parsed.created_at !== 'string' || Number.isNaN(Date.parse(parsed.created_at))) {
      return null
    }
    return { id: parsed.id, created_at: parsed.created_at }
  } catch {
    return null
  }
}
