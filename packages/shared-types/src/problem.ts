import { z } from 'zod'

export const problemSchema = z
  .object({
    type: z.string().min(1),
    title: z.string().min(1),
    status: z.number().int().min(100).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
    code: z.string().optional(),
  })
  .passthrough()

export type Problem = z.infer<typeof problemSchema>

export const problemEnvelopeSchema = z.object({
  data: z.null(),
  meta: z.record(z.string(), z.unknown()).optional(),
  errors: z.array(problemSchema).min(1),
})

export type ProblemEnvelope = z.infer<typeof problemEnvelopeSchema>
