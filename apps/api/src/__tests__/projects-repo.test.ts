/**
 * Repository tests use a recording fake `Database` — chainable Drizzle calls
 * are captured so we can assert the WHERE/values shape without a real PG.
 * The fake mirrors only the surface area projects-repo actually uses.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  serializeProject,
  updateProject,
} from '../repositories/projects-repo'
import { RepoConflictError } from '../repositories/base-repo'
import type { Project as ProjectRow } from '@fortunel/db'

const OWNER = '11111111-1111-1111-1111-111111111111'
const OTHER = '22222222-2222-2222-2222-222222222222'

function row(over: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    ownerId: OWNER,
    slug: 'demo',
    title: 'Demo',
    description: null,
    tech: [],
    links: {},
    publishedAt: null,
    createdAt: new Date('2026-05-26T10:00:00.000Z'),
    updatedAt: new Date('2026-05-26T10:00:00.000Z'),
    ...over,
  }
}

interface SelectCapture {
  whereArg?: unknown
  limitArg?: number
}
interface InsertCapture {
  valuesArg?: Record<string, unknown>
}
interface UpdateCapture {
  setArg?: Record<string, unknown>
  whereArg?: unknown
}
interface DeleteCapture {
  whereArg?: unknown
}

function makeSelectChain(result: ProjectRow[], capture: SelectCapture) {
  return {
    from: vi.fn(() => ({
      where: vi.fn((w: unknown) => {
        capture.whereArg = w
        return {
          orderBy: vi.fn(() => ({
            limit: vi.fn((n: number) => {
              capture.limitArg = n
              return Promise.resolve(result)
            }),
          })),
          limit: vi.fn((n: number) => {
            capture.limitArg = n
            return Promise.resolve(result)
          }),
        }
      }),
    })),
  }
}

function makeInsertChain(result: ProjectRow[] | Error, capture: InsertCapture) {
  return {
    values: vi.fn((v: Record<string, unknown>) => {
      capture.valuesArg = v
      return {
        returning: vi.fn(() =>
          result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
        ),
      }
    }),
  }
}

function makeUpdateChain(result: ProjectRow[] | Error, capture: UpdateCapture) {
  return {
    set: vi.fn((v: Record<string, unknown>) => {
      capture.setArg = v
      return {
        where: vi.fn((w: unknown) => {
          capture.whereArg = w
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

function makeDeleteChain(result: Array<{ id: string }>, capture: DeleteCapture) {
  return {
    where: vi.fn((w: unknown) => {
      capture.whereArg = w
      return { returning: vi.fn(() => Promise.resolve(result)) }
    }),
  }
}

describe('projects-repo', () => {
  describe('serializeProject', () => {
    it('maps camelCase row to snake_case API shape', () => {
      const r = row({
        publishedAt: new Date('2026-05-20T00:00:00.000Z'),
        description: 'hi',
        tech: ['ts'],
        links: { docs: 'https://x.dev' },
      })
      const out = serializeProject(r)
      expect(out.owner_id).toBe(OWNER)
      expect(out.published_at).toBe('2026-05-20T00:00:00.000Z')
      expect(out.created_at).toBe('2026-05-26T10:00:00.000Z')
      expect(out.tech).toEqual(['ts'])
      expect(out.links).toEqual({ docs: 'https://x.dev' })
      expect(out.description).toBe('hi')
    })

    it('passes through nulls for description and published_at', () => {
      const out = serializeProject(row())
      expect(out.description).toBeNull()
      expect(out.published_at).toBeNull()
    })
  })

  describe('listProjects', () => {
    it('over-fetches limit+1 and strips overflow into a cursor', async () => {
      const rows = [
        row({ id: 'a', createdAt: new Date('2026-05-26T03:00:00.000Z') }),
        row({ id: 'b', createdAt: new Date('2026-05-26T02:00:00.000Z') }),
        row({ id: 'c', createdAt: new Date('2026-05-26T01:00:00.000Z') }),
      ]
      const cap: SelectCapture = {}
      const db = { select: vi.fn(() => makeSelectChain(rows, cap)) } as never
      const page = await listProjects({ db, ownerId: OWNER }, { limit: 2 })
      expect(cap.limitArg).toBe(3)
      expect(page.rows).toHaveLength(2)
      expect(page.has_more).toBe(true)
      expect(page.nextCursor).not.toBeNull()
      expect(cap.whereArg).toBeDefined()
    })

    it('returns null cursor when result fits under limit', async () => {
      const cap: SelectCapture = {}
      const db = { select: vi.fn(() => makeSelectChain([row()], cap)) } as never
      const page = await listProjects({ db, ownerId: OWNER }, { limit: 20 })
      expect(page.has_more).toBe(false)
      expect(page.nextCursor).toBeNull()
      expect(page.rows[0]?.owner_id).toBe(OWNER)
    })
  })

  describe('getProject', () => {
    it('returns null when no row matches owner-scoped id', async () => {
      const cap: SelectCapture = {}
      const db = { select: vi.fn(() => makeSelectChain([], cap)) } as never
      const out = await getProject({ db, ownerId: OWNER }, 'missing')
      expect(out).toBeNull()
    })

    it('returns serialized row when found', async () => {
      const cap: SelectCapture = {}
      const db = { select: vi.fn(() => makeSelectChain([row()], cap)) } as never
      const out = await getProject({ db, ownerId: OWNER }, 'x')
      expect(out?.owner_id).toBe(OWNER)
    })
  })

  describe('createProject', () => {
    it('stamps owner_id from ctx and ignores caller-supplied owner_id', async () => {
      const cap: InsertCapture = {}
      const db = {
        insert: vi.fn(() => makeInsertChain([row()], cap)),
      } as never
      await createProject({ db, ownerId: OWNER }, {
        slug: 'demo',
        title: 'Demo',
        // @ts-expect-error — owner_id is not on the create schema
        owner_id: OTHER,
      })
      expect(cap.valuesArg?.ownerId).toBe(OWNER)
      expect(cap.valuesArg?.ownerId).not.toBe(OTHER)
    })

    it('defaults tech/links and serializes published_at', async () => {
      const cap: InsertCapture = {}
      const db = { insert: vi.fn(() => makeInsertChain([row()], cap)) } as never
      await createProject(
        { db, ownerId: OWNER },
        { slug: 'demo', title: 'Demo', published_at: '2026-05-26T10:00:00.000Z' },
      )
      expect(cap.valuesArg?.tech).toEqual([])
      expect(cap.valuesArg?.links).toEqual({})
      expect(cap.valuesArg?.publishedAt).toBeInstanceOf(Date)
    })

    it('rethrows 23505 unique violation as RepoConflictError("slug")', async () => {
      const err = Object.assign(new Error('dup'), { code: '23505' })
      const cap: InsertCapture = {}
      const db = { insert: vi.fn(() => makeInsertChain(err, cap)) } as never
      await expect(
        createProject({ db, ownerId: OWNER }, { slug: 'demo', title: 'Demo' }),
      ).rejects.toBeInstanceOf(RepoConflictError)
    })
  })

  describe('updateProject', () => {
    it('returns null when owner-scoped row does not exist', async () => {
      const cap: UpdateCapture = {}
      const db = { update: vi.fn(() => makeUpdateChain([], cap)) } as never
      const out = await updateProject({ db, ownerId: OWNER }, 'x', { title: 'New' })
      expect(out).toBeNull()
      expect(cap.setArg?.title).toBe('New')
    })

    it('rethrows 23505 as RepoConflictError', async () => {
      const err = Object.assign(new Error('dup'), { code: '23505' })
      const cap: UpdateCapture = {}
      const db = { update: vi.fn(() => makeUpdateChain(err, cap)) } as never
      await expect(
        updateProject({ db, ownerId: OWNER }, 'x', { slug: 'taken' }),
      ).rejects.toBeInstanceOf(RepoConflictError)
    })

    it('skips empty patches and falls through to getProject', async () => {
      const cap: SelectCapture = {}
      const db = {
        select: vi.fn(() => makeSelectChain([row()], cap)),
        update: vi.fn(),
      } as never
      const out = await updateProject({ db, ownerId: OWNER }, 'x', {})
      expect(out?.owner_id).toBe(OWNER)
      expect((db as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled()
    })
  })

  describe('deleteProject', () => {
    it('returns false when nothing was deleted', async () => {
      const cap: DeleteCapture = {}
      const db = { delete: vi.fn(() => makeDeleteChain([], cap)) } as never
      const out = await deleteProject({ db, ownerId: OWNER }, 'x')
      expect(out).toBe(false)
    })

    it('returns true when a row was deleted', async () => {
      const cap: DeleteCapture = {}
      const db = { delete: vi.fn(() => makeDeleteChain([{ id: 'x' }], cap)) } as never
      const out = await deleteProject({ db, ownerId: OWNER }, 'x')
      expect(out).toBe(true)
    })
  })
})
