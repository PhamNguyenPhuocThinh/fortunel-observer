import { z } from 'zod'
import { isoDateTimeSchema, slugSchema, uuidSchema } from '../primitives'

export const postSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  slug: slugSchema,
  title: z.string(),
  body_md: z.string(),
  excerpt: z.string().nullable(),
  tags: z.array(z.string()),
  published_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
})
export type Post = z.infer<typeof postSchema>

export const postCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  body_md: z.string().min(1).max(200_000),
  excerpt: z.string().max(500).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  published_at: isoDateTimeSchema.nullable().optional(),
})
export type PostCreate = z.infer<typeof postCreateSchema>

export const postUpdateSchema = postCreateSchema.partial()
export type PostUpdate = z.infer<typeof postUpdateSchema>
