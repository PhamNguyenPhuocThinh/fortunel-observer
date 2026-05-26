import { z } from 'zod'
import { isoDateSchema, knowledgeStatusSchema, knowledgeTagsSchema } from './primitives'

export const tradeJournalFrontmatterSchema = z.object({
  type: z.literal('trade-journal'),
  date: isoDateSchema,
  symbol: z.string().min(1).max(20),
  strategy: z.string().min(1).max(100),
  entry: z.number().finite(),
  exit: z.number().finite(),
  pnl_pct: z.number().finite(),
  hypothesis: z.string().min(1).max(2000),
  outcome: z.string().min(1).max(2000),
  lessons: z.array(z.string().min(1).max(500)).max(20).default([]),
  tags: knowledgeTagsSchema,
  status: knowledgeStatusSchema.default('draft'),
})
export type TradeJournalFrontmatter = z.infer<typeof tradeJournalFrontmatterSchema>
