import { z } from 'zod'
import { urlSchema } from '../primitives'
import { knowledgeStatusSchema, knowledgeTagsSchema, repoPathSchema } from './primitives'

export const conceptFrontmatterSchema = z.object({
  type: z.literal('concept'),
  name: z.string().min(1).max(100),
  summary: z.string().min(1).max(2000),
  related_concepts: z.array(repoPathSchema).max(50).default([]),
  sources: z.array(z.union([urlSchema, repoPathSchema])).max(50).default([]),
  tags: knowledgeTagsSchema,
  status: knowledgeStatusSchema.default('draft'),
})
export type ConceptFrontmatter = z.infer<typeof conceptFrontmatterSchema>
