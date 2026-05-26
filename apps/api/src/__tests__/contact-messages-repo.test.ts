import { describe, expect, it, vi } from 'vitest'
import {
  createContactMessage,
  getContactMessage,
  listContactMessages,
  markContactMessageRead,
  serializeContactMessage,
} from '../repositories/contact-messages-repo'
import type { ContactMessage as ContactMessageRow } from '@fortunel/db'

const OWNER = '11111111-1111-1111-1111-111111111111'

function row(over: Partial<ContactMessageRow> = {}): ContactMessageRow {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    ownerId: OWNER,
    fromName: 'Ada',
    fromEmail: 'ada@example.com',
    subject: null,
    message: 'hi',
    ip: null,
    userAgent: null,
    readAt: null,
    createdAt: new Date('2026-05-26T10:00:00.000Z'),
    ...over,
  }
}

interface SelCap {
  whereArg?: unknown
  limitArg?: number
}
interface InsCap {
  valuesArg?: Record<string, unknown>
}
interface UpdCap {
  setArg?: Record<string, unknown>
  whereArg?: unknown
}

function selectChain(result: ContactMessageRow[], cap: SelCap) {
  return {
    from: vi.fn(() => ({
      where: vi.fn((w: unknown) => {
        cap.whereArg = w
        return {
          orderBy: vi.fn(() => ({
            limit: vi.fn((n: number) => {
              cap.limitArg = n
              return Promise.resolve(result)
            }),
          })),
          limit: vi.fn((n: number) => {
            cap.limitArg = n
            return Promise.resolve(result)
          }),
        }
      }),
    })),
  }
}

function insertChain(result: ContactMessageRow[], cap: InsCap) {
  return {
    values: vi.fn((v: Record<string, unknown>) => {
      cap.valuesArg = v
      return { returning: vi.fn(() => Promise.resolve(result)) }
    }),
  }
}

function updateChain(result: ContactMessageRow[], cap: UpdCap) {
  return {
    set: vi.fn((v: Record<string, unknown>) => {
      cap.setArg = v
      return {
        where: vi.fn((w: unknown) => {
          cap.whereArg = w
          return { returning: vi.fn(() => Promise.resolve(result)) }
        }),
      }
    }),
  }
}

describe('contact-messages-repo', () => {
  describe('serializeContactMessage', () => {
    it('maps camelCase row to snake_case API shape', () => {
      const r = row({
        subject: 'Hello',
        ip: '1.2.3.4',
        userAgent: 'curl',
        readAt: new Date('2026-05-26T12:00:00.000Z'),
      })
      const out = serializeContactMessage(r)
      expect(out.owner_id).toBe(OWNER)
      expect(out.from_email).toBe('ada@example.com')
      expect(out.user_agent).toBe('curl')
      expect(out.read_at).toBe('2026-05-26T12:00:00.000Z')
    })

    it('preserves nulls for optional fields', () => {
      const out = serializeContactMessage(row())
      expect(out.subject).toBeNull()
      expect(out.ip).toBeNull()
      expect(out.user_agent).toBeNull()
      expect(out.read_at).toBeNull()
    })
  })

  describe('listContactMessages', () => {
    it('over-fetches limit+1 and mints cursor when overflow', async () => {
      const cap: SelCap = {}
      const rows = [
        row({ id: 'a', createdAt: new Date('2026-05-26T03:00:00.000Z') }),
        row({ id: 'b', createdAt: new Date('2026-05-26T02:00:00.000Z') }),
        row({ id: 'c', createdAt: new Date('2026-05-26T01:00:00.000Z') }),
      ]
      const db = { select: vi.fn(() => selectChain(rows, cap)) } as never
      const page = await listContactMessages({ db, ownerId: OWNER }, { limit: 2 })
      expect(cap.limitArg).toBe(3)
      expect(page.rows).toHaveLength(2)
      expect(page.has_more).toBe(true)
    })
  })

  describe('getContactMessage', () => {
    it('null when owner-scoped row missing', async () => {
      const cap: SelCap = {}
      const db = { select: vi.fn(() => selectChain([], cap)) } as never
      expect(await getContactMessage({ db, ownerId: OWNER }, 'x')).toBeNull()
    })
  })

  describe('createContactMessage', () => {
    it('stamps owner from ctx and persists ip/user_agent metadata', async () => {
      const cap: InsCap = {}
      const db = { insert: vi.fn(() => insertChain([row()], cap)) } as never
      await createContactMessage(
        { db, ownerId: OWNER },
        { from_name: 'Ada', from_email: 'ada@example.com', message: 'hi' },
        { ip: '9.9.9.9', userAgent: 'curl/8' },
      )
      expect(cap.valuesArg?.ownerId).toBe(OWNER)
      expect(cap.valuesArg?.ip).toBe('9.9.9.9')
      expect(cap.valuesArg?.userAgent).toBe('curl/8')
    })

    it('coerces missing subject to null', async () => {
      const cap: InsCap = {}
      const db = { insert: vi.fn(() => insertChain([row()], cap)) } as never
      await createContactMessage(
        { db, ownerId: OWNER },
        { from_name: 'Ada', from_email: 'ada@example.com', message: 'hi' },
      )
      expect(cap.valuesArg?.subject).toBeNull()
      expect(cap.valuesArg?.ip).toBeNull()
    })
  })

  describe('markContactMessageRead', () => {
    it('sets readAt to a Date and is owner-scoped', async () => {
      const cap: UpdCap = {}
      const db = {
        update: vi.fn(() => updateChain([row({ readAt: new Date() })], cap)),
      } as never
      const out = await markContactMessageRead({ db, ownerId: OWNER }, 'x')
      expect(cap.setArg?.readAt).toBeInstanceOf(Date)
      expect(out?.owner_id).toBe(OWNER)
    })

    it('returns null when owner-scoped row missing', async () => {
      const cap: UpdCap = {}
      const db = { update: vi.fn(() => updateChain([], cap)) } as never
      expect(await markContactMessageRead({ db, ownerId: OWNER }, 'x')).toBeNull()
    })
  })
})
