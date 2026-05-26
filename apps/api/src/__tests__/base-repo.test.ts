import { describe, expect, it } from 'vitest'
import { clampLimit, finalizePage, parseCursor } from '../repositories/base-repo'
import { encodeCursor } from '../lib/cursor'

describe('base-repo', () => {
  describe('clampLimit', () => {
    it('defaults to 20 when missing or invalid', () => {
      expect(clampLimit(undefined)).toBe(20)
      expect(clampLimit(NaN)).toBe(20)
      expect(clampLimit(0)).toBe(20)
    })
    it('clamps to [1, 100]', () => {
      expect(clampLimit(5)).toBe(5)
      expect(clampLimit(1000)).toBe(100)
      expect(clampLimit(-5)).toBe(1)
    })
  })

  describe('finalizePage', () => {
    const mk = (i: number) => ({ id: `row-${i}`, createdAt: new Date(2026, 0, i + 1) })

    it('returns all rows + null cursor when under-fetched', () => {
      const page = finalizePage([mk(0), mk(1)], 5)
      expect(page.rows).toHaveLength(2)
      expect(page.has_more).toBe(false)
      expect(page.nextCursor).toBeNull()
    })

    it('strips the overflow row and mints a cursor from the last visible', () => {
      const rows = [mk(0), mk(1), mk(2)]
      const page = finalizePage(rows, 2)
      expect(page.rows).toHaveLength(2)
      expect(page.has_more).toBe(true)
      expect(page.nextCursor).not.toBeNull()
      const decoded = parseCursor(page.nextCursor)
      expect(decoded?.id).toBe('row-1')
    })
  })

  describe('parseCursor', () => {
    it('round-trips with encodeCursor', () => {
      const c = encodeCursor({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' })
      expect(parseCursor(c)).toEqual({ id: 'a', created_at: '2026-01-01T00:00:00.000Z' })
    })
    it('returns null for missing or malformed', () => {
      expect(parseCursor(undefined)).toBeNull()
      expect(parseCursor('xxx')).toBeNull()
    })
  })
})
