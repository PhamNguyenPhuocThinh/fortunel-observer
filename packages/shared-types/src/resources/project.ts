import { z } from 'zod'
import { isoDateTimeSchema, slugSchema, urlSchema, uuidSchema } from '../primitives'

export const projectSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  slug: slugSchema,
  title: z.string(),
  description: z.string().nullable(),
  tech: z.array(z.string()),
  links: z.record(z.string(), urlSchema),
  published_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
})
export type Project = z.infer<typeof projectSchema>

export const projectCreateSchema = z.object({
  slug: slugSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  tech: z.array(z.string().min(1).max(40)).max(50).optional(),
  links: z.record(z.string().min(1).max(40), urlSchema).optional(),
  published_at: isoDateTimeSchema.nullable().optional(),
})
export type ProjectCreate = z.infer<typeof projectCreateSchema>

export const projectUpdateSchema = projectCreateSchema.partial()
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>
