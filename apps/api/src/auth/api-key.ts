/**
 * API key mint / verify / revoke.
 *
 * Plaintext format: `fo_<key_prefix>_<secret>` shown ONCE at mint time.
 * Storage:
 *   - `key_prefix` (indexed) — short opaque id for O(1) lookup
 *   - `hashed_key` — scrypt(secret, salt) hex; salt embedded as `scrypt:<n>:<saltHex>:<hashHex>`
 *
 * scrypt cost is low (N=2^14) because API key secrets are 32-byte random — high
 * entropy already, no need for password-grade work factor. Verify <50ms target.
 */

import { scrypt } from '@noble/hashes/scrypt.js'
import { randomBytes } from '@noble/hashes/utils.js'
import { eq, and, isNull } from 'drizzle-orm'
import { apiKeys, type ApiKey } from '@fortunel/db'
import type { Database } from '@fortunel/db'

const PREFIX = 'fo_'
const KEY_PREFIX_LEN = 12
const SECRET_BYTES = 32
const SCRYPT_N = 1 << 14
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_DK_LEN = 32

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

function hashSecret(secret: string, salt: Uint8Array): string {
  const dk = scrypt(secret, salt, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, dkLen: SCRYPT_DK_LEN })
  return `scrypt:${SCRYPT_N}:${bytesToHex(salt)}:${bytesToHex(dk)}`
}

function verifyHash(secret: string, stored: string): boolean {
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false
  const n = Number(parts[1])
  if (!Number.isInteger(n) || n <= 0 || (n & (n - 1)) !== 0) return false
  try {
    const salt = hexToBytes(parts[2] ?? '')
    const expected = hexToBytes(parts[3] ?? '')
    const dk = scrypt(secret, salt, { N: n, r: SCRYPT_R, p: SCRYPT_P, dkLen: SCRYPT_DK_LEN })
    return timingSafeEqual(dk, expected)
  } catch {
    return false
  }
}

export interface MintInput {
  ownerId: string
  name: string
  scopes: string[]
  expiresAt?: Date | null
}

export interface MintResult {
  id: string
  plaintext: string
  keyPrefix: string
  ownerId: string
  name: string
  scopes: string[]
  expiresAt: Date | null
  createdAt: Date
}

export async function mintApiKey(db: Database, input: MintInput): Promise<MintResult> {
  const keyPrefix = bytesToBase64Url(randomBytes(9)).slice(0, KEY_PREFIX_LEN)
  const secret = bytesToBase64Url(randomBytes(SECRET_BYTES))
  const plaintext = `${PREFIX}${keyPrefix}_${secret}`
  const hashed = hashSecret(secret, randomBytes(16))

  const [row] = await db
    .insert(apiKeys)
    .values({
      ownerId: input.ownerId,
      name: input.name,
      scopes: input.scopes,
      keyPrefix,
      hashedKey: hashed,
      expiresAt: input.expiresAt ?? null,
    })
    .returning()

  if (!row) throw new Error('failed to insert api key')

  return {
    id: row.id,
    plaintext,
    keyPrefix: row.keyPrefix,
    ownerId: row.ownerId,
    name: row.name,
    scopes: row.scopes,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }
}

export interface VerifyResult {
  apiKey: ApiKey
}

export async function verifyApiKey(db: Database, plaintext: string): Promise<VerifyResult | null> {
  if (!plaintext.startsWith(PREFIX)) return null
  const rest = plaintext.slice(PREFIX.length)
  const sep = rest.indexOf('_')
  if (sep <= 0) return null
  const keyPrefix = rest.slice(0, sep)
  const secret = rest.slice(sep + 1)
  if (!secret) return null

  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyPrefix, keyPrefix), isNull(apiKeys.revokedAt)))
    .limit(5)

  const now = Date.now()
  for (const row of rows) {
    if (row.expiresAt && row.expiresAt.getTime() <= now) continue
    if (verifyHash(secret, row.hashedKey)) {
      return { apiKey: row }
    }
  }
  return null
}

export async function revokeApiKey(db: Database, id: string): Promise<boolean> {
  const updated = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id })
  return updated.length > 0
}

export async function touchLastUsed(db: Database, id: string): Promise<void> {
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id))
}

// Exported only for unit tests — avoids spinning up a DB to verify the crypto path.
export const __testing = { hashSecret, verifyHash, PREFIX, KEY_PREFIX_LEN }
