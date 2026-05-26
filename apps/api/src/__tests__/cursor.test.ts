import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from '../lib/cursor'

describe('cursor', () => {
  it('round-trips a payload', () => {
    const payload = { id: 'abc', created_at: '2026-05-26T10:00:00.000Z' }
    const encoded = encodeCursor(payload)
    expect(decodeCursor(encoded)).toEqual(payload)
  })

  it('produces base64url (no +, /, =)', () => {
    // Force a payload with characters that yield + / = in plain base64.
    const enc = encodeCursor({ id: '????????????????', created_at: '2026-05-26T10:00:00.000Z' })
    expect(enc).not.toMatch(/[+/=]/)
  })

  it('rejects undefined / empty', () => {
    expect(decodeCursor(undefined)).toBeNull()
    expect(decodeCursor(null)).toBeNull()
    expect(decodeCursor('')).toBeNull()
  })

  it('rejects garbage base64', () => {
    expect(decodeCursor('not-real-cursor-$$$')).toBeNull()
  })

  it('rejects payload missing id', () => {
    const bad = btoa(JSON.stringify({ created_at: '2026-05-26T10:00:00.000Z' }))
    expect(decodeCursor(bad)).toBeNull()
  })

  it('rejects payload with malformed created_at', () => {
    const bad = btoa(JSON.stringify({ id: 'x', created_at: 'not-a-date' }))
    expect(decodeCursor(bad)).toBeNull()
  })
})
