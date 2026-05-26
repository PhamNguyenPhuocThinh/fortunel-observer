import { z } from 'zod'

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')

export const knowledgeStatusSchema = z.enum(['draft', 'published', 'archived'])
export type KnowledgeStatus = z.infer<typeof knowledgeStatusSchema>

export const knowledgeTagsSchema = z
  .array(z.string().min(1).max(40))
  .max(20)
  .default([])

export const repoPathSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[a-zA-Z0-9._\-/]+$/, 'must be a repo-relative path')
