import { z } from 'zod'

export const cursorSchema = z.string().min(1).max(512)

export const paginationQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export const paginationMetaSchema = z.object({
  cursor: cursorSchema.nullable(),
  has_more: z.boolean(),
})

export type PaginationMeta = z.infer<typeof paginationMetaSchema>
