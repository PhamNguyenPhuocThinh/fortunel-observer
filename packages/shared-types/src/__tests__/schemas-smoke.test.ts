import { describe, expect, it } from 'vitest'
import {
  apiKeyCreateSchema,
  contactMessageCreateSchema,
  envelope,
  paginationQuerySchema,
  postSchema,
  problemSchema,
  scopeSchema,
  userSchema,
} from '../index'

describe('shared-types smoke', () => {
  it('envelope wraps a payload and rejects errors !== null', () => {
    const wrapped = envelope(userSchema)
    const ok = wrapped.safeParse({
      data: {
        id: '00000000-0000-4000-8000-000000000000',
        email: 'a@b.co',
        email_verified: false,
        name: null,
        image: null,
        role: 'owner',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      errors: null,
    })
    expect(ok.success).toBe(true)
    const bad = wrapped.safeParse({ data: null, errors: null })
    expect(bad.success).toBe(false)
  })

  it('problem accepts RFC 7807 shapes and rejects invalid status', () => {
    expect(
      problemSchema.safeParse({
        type: 'https://api.fortunel.dev/errors/posts/not-found',
        title: 'Not Found',
        status: 404,
      }).success,
    ).toBe(true)
    expect(
      problemSchema.safeParse({ type: 'about:blank', title: 'x', status: 500 }).success,
    ).toBe(true)
    expect(problemSchema.safeParse({ type: '', title: 'x', status: 500 }).success).toBe(false)
    expect(
      problemSchema.safeParse({ type: 'https://x', title: 'x', status: 99 }).success,
    ).toBe(false)
  })

  it('paginationQuery coerces and caps limit', () => {
    expect(paginationQuerySchema.parse({}).limit).toBe(20)
    expect(paginationQuerySchema.parse({ limit: '50' }).limit).toBe(50)
    expect(paginationQuerySchema.safeParse({ limit: 500 }).success).toBe(false)
  })

  it('scope enum rejects typos', () => {
    expect(scopeSchema.safeParse('posts:read').success).toBe(true)
    expect(scopeSchema.safeParse('post:read').success).toBe(false)
  })

  it('apiKeyCreate requires at least one scope', () => {
    expect(apiKeyCreateSchema.safeParse({ name: 'k', scopes: [] }).success).toBe(false)
    expect(
      apiKeyCreateSchema.safeParse({ name: 'k', scopes: ['posts:read'] }).success,
    ).toBe(true)
  })

  it('contactMessageCreate enforces email + length', () => {
    expect(
      contactMessageCreateSchema.safeParse({
        from_name: 'a',
        from_email: 'a@b.co',
        message: 'hi',
      }).success,
    ).toBe(true)
    expect(
      contactMessageCreateSchema.safeParse({
        from_name: 'a',
        from_email: 'not-an-email',
        message: 'hi',
      }).success,
    ).toBe(false)
  })

  it('post slug enforces kebab-case', () => {
    const base = {
      id: '00000000-0000-4000-8000-000000000000',
      owner_id: '00000000-0000-4000-8000-000000000000',
      title: 't',
      body_md: 'b',
      excerpt: null,
      tags: [],
      published_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
    expect(postSchema.safeParse({ ...base, slug: 'hello-world' }).success).toBe(true)
    expect(postSchema.safeParse({ ...base, slug: 'Hello World' }).success).toBe(false)
  })
})
