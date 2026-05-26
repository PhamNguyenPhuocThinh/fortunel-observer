/**
 * Mirrors projects-repo.test.ts — fake `Database` with chainable Drizzle
 * stubs so we can verify owner_id scoping, mapping, and conflict handling
 * without booting Postgres.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  serializePost,
  updatePost,
} from '../repositories/posts-repo'
import { RepoConflictError } from '../repositories/base-repo'
import type { Post as PostRow } from '@fortunel/db'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

function row(over: Partial<PostRow> = {}): PostRow {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    ownerId: OWNER,
    slug: 'hello',
    title: 'Hello',
    bodyMd: '# hello',
    excerpt: null,
    tags: [],
    publishedAt: null,
    createdAt: new Date('2026-05-26T10:00:00.000Z'),
    updatedAt: new Date('2026-05-26T10:00:00.000Z'),
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
interface DelCap {
  whereArg?: unknown
}

function selectChain(result: PostRow[], cap: SelCap) {
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

function insertChain(result: PostRow[] | Error, cap: InsCap) {
  return {
    values: vi.fn((v: Record<string, unknown>) => {
      cap.valuesArg = v
      return {
        returning: vi.fn(() =>
          result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
        ),
      }
    }),
  }
}

function updateChain(result: PostRow[] | Error, cap: UpdCap) {
  return {
    set: vi.fn((v: Record<string, unknown>) => {
      cap.setArg = v
      return {
        where: vi.fn((w: unknown) => {
          cap.whereArg = w
          return {
            returning: vi.fn(() =>
              result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
            ),
          }
        }),
      }
    }),
  }
}

function deleteChain(result: Array<{ id: string }>, cap: DelCap) {
  return {
    where: vi.fn((w: unknown) => {
      cap.whereArg = w
      return { returning: vi.fn(() => Promise.resolve(result)) }
    }),
  }
}

describe('posts-repo', () => {
  describe('serializePost', () => {
    it('maps camelCase row to snake_case API shape', () => {
      const r = row({
        bodyMd: '# title',
        excerpt: 'hi',
        tags: ['ts'],
        publishedAt: new Date('2026-05-20T00:00:00.000Z'),
      })
      const out = serializePost(r)
      expect(out.owner_id).toBe(OWNER)
      expect(out.body_md).toBe('# title')
      expect(out.excerpt).toBe('hi')
      expect(out.tags).toEqual(['ts'])
      expect(out.published_at).toBe('2026-05-20T00:00:00.000Z')
    })
  })

  describe('listPosts', () => {
    it('over-fetches limit+1 and mints cursor when overflow', async () => {
      const cap: SelCap = {}
      const rows = [
        row({ id: 'a', createdAt: new Date('2026-05-26T03:00:00.000Z') }),
        row({ id: 'b', createdAt: new Date('2026-05-26T02:00:00.000Z') }),
        row({ id: 'c', createdAt: new Date('2026-05-26T01:00:00.000Z') }),
      ]
      const db = { select: vi.fn(() => selectChain(rows, cap)) } as never
      const page = await listPosts({ db, ownerId: OWNER }, { limit: 2 })
      expect(cap.limitArg).toBe(3)
      expect(page.rows).toHaveLength(2)
      expect(page.has_more).toBe(true)
      expect(page.nextCursor).not.toBeNull()
    })
  })

  describe('getPost', () => {
    it('returns null when no row matches', async () => {
      const cap: SelCap = {}
      const db = { select: vi.fn(() => selectChain([], cap)) } as never
      const out = await getPost({ db, ownerId: OWNER }, 'x')
      expect(out).toBeNull()
    })
  })

  describe('createPost', () => {
    it('stamps owner_id from ctx; cannot be spoofed', async () => {
      const cap: InsCap = {}
      const db = { insert: vi.fn(() => insertChain([row()], cap)) } as never
      await createPost({ db, ownerId: OWNER }, {
        slug: 'hello',
        title: 'Hello',
        body_md: '# hi',
        // @ts-expect-error — owner_id not in create schema
        owner_id: OTHER,
      })
      expect(cap.valuesArg?.ownerId).toBe(OWNER)
    })

    it('defaults tags to [] and maps body_md', async () => {
      const cap: InsCap = {}
      const db = { insert: vi.fn(() => insertChain([row()], cap)) } as never
      await createPost(
        { db, ownerId: OWNER },
        { slug: 'hello', title: 'Hello', body_md: '# hi' },
      )
      expect(cap.valuesArg?.tags).toEqual([])
      expect(cap.valuesArg?.bodyMd).toBe('# hi')
    })

    it('rethrows 23505 as RepoConflictError("slug")', async () => {
      const err = Object.assign(new Error('dup'), { code: '23505' })
      const cap: InsCap = {}
      const db = { insert: vi.fn(() => insertChain(err, cap)) } as never
      await expect(
        createPost({ db, ownerId: OWNER }, { slug: 'hello', title: 'Hello', body_md: '# hi' }),
      ).rejects.toBeInstanceOf(RepoConflictError)
    })
  })

  describe('updatePost', () => {
    it('returns null on owner-scoped miss', async () => {
      const cap: UpdCap = {}
      const db = { update: vi.fn(() => updateChain([], cap)) } as never
      const out = await updatePost({ db, ownerId: OWNER }, 'x', { title: 'New' })
      expect(out).toBeNull()
      expect(cap.setArg?.title).toBe('New')
    })

    it('rethrows 23505 as RepoConflictError', async () => {
      const err = Object.assign(new Error('dup'), { code: '23505' })
      const cap: UpdCap = {}
      const db = { update: vi.fn(() => updateChain(err, cap)) } as never
      await expect(
        updatePost({ db, ownerId: OWNER }, 'x', { slug: 'taken' }),
      ).rejects.toBeInstanceOf(RepoConflictError)
    })

    it('skips empty patches and falls through to getPost', async () => {
      const cap: SelCap = {}
      const db = {
        select: vi.fn(() => selectChain([row()], cap)),
        update: vi.fn(),
      } as never
      const out = await updatePost({ db, ownerId: OWNER }, 'x', {})
      expect(out?.owner_id).toBe(OWNER)
      expect((db as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled()
    })
  })

  describe('deletePost', () => {
    it('false when nothing deleted', async () => {
      const cap: DelCap = {}
      const db = { delete: vi.fn(() => deleteChain([], cap)) } as never
      expect(await deletePost({ db, ownerId: OWNER }, 'x')).toBe(false)
    })

    it('true when row deleted', async () => {
      const cap: DelCap = {}
      const db = { delete: vi.fn(() => deleteChain([{ id: 'x' }], cap)) } as never
      expect(await deletePost({ db, ownerId: OWNER }, 'x')).toBe(true)
    })
  })
})
