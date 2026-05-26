import { z } from 'zod'
import { knowledgeStatusSchema, knowledgeTagsSchema } from './primitives'

export const strategyStatusSchema = z.enum(['draft', 'live', 'paused', 'retired'])
export type StrategyStatus = z.infer<typeof strategyStatusSchema>

export const strategyFrontmatterSchema = z.object({
  type: z.literal('strategy'),
  name: z.string().min(1).max(100),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  assumptions: z.array(z.string().min(1).max(500)).max(50).default([]),
  regimes: z.array(z.string().min(1).max(80)).max(20).default([]),
  // `status` is operational (is the strategy running?), `lifecycle_status` is
  // editorial (is this doc shippable?). Keep them split — collapsing breaks
  // the "draft strategy that's already live in shadow mode" case.
  status: strategyStatusSchema.default('draft'),
  tags: knowledgeTagsSchema,
  lifecycle_status: knowledgeStatusSchema.default('draft'),
})
export type StrategyFrontmatter = z.infer<typeof strategyFrontmatterSchema>
