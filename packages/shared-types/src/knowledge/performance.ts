import { z } from 'zod'
import { knowledgeStatusSchema, knowledgeTagsSchema } from './primitives'

export const performancePeriodSchema = z
  .string()
  .regex(
    /^(\d{4}-\d{2}-\d{2}|\d{4}-W\d{2}|\d{4}-\d{2}|\d{4})$/,
    'must be YYYY, YYYY-MM, YYYY-Www, or YYYY-MM-DD',
  )

export const performanceFrontmatterSchema = z.object({
  type: z.literal('performance'),
  period: performancePeriodSchema,
  pnl: z.number().finite(),
  drawdown_max: z.number().finite().nonpositive(),
  win_rate: z.number().min(0).max(1),
  sample_size: z.number().int().nonnegative(),
  tags: knowledgeTagsSchema,
  status: knowledgeStatusSchema.default('draft'),
})
export type PerformanceFrontmatter = z.infer<typeof performanceFrontmatterSchema>
