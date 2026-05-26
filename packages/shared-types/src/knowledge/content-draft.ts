import { z } from 'zod'
import { repoPathSchema } from './primitives'

export const contentDraftStatusSchema = z.enum([
  'draft',
  'reviewing',
  'ready',
  'published',
])
export type ContentDraftStatus = z.infer<typeof contentDraftStatusSchema>

export const contentDraftFrontmatterSchema = z.object({
  type: z.literal('content-draft'),
  generated_from: z.array(repoPathSchema).min(1).max(50),
  status: contentDraftStatusSchema.default('draft'),
  source_material_refs: z.array(repoPathSchema).max(50).default([]),
})
export type ContentDraftFrontmatter = z.infer<typeof contentDraftFrontmatterSchema>
