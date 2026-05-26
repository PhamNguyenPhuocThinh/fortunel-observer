import { z, type ZodTypeAny } from 'zod'
import { paginationMetaSchema } from './pagination'

export const envelopeMetaSchema = paginationMetaSchema.partial().passthrough()

export type EnvelopeMeta = z.infer<typeof envelopeMetaSchema>

export const envelope = <T extends ZodTypeAny>(data: T) =>
  z.object({
    data,
    meta: envelopeMetaSchema.optional(),
    errors: z.null(),
  })

export type Envelope<T> = {
  data: T
  meta?: EnvelopeMeta
  errors: null
}
