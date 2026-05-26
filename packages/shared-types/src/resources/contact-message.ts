import { z } from 'zod'
import { emailSchema, isoDateTimeSchema, uuidSchema } from '../primitives'

export const contactMessageSchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  from_name: z.string(),
  from_email: emailSchema,
  subject: z.string().nullable(),
  message: z.string(),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  read_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
})
export type ContactMessage = z.infer<typeof contactMessageSchema>

export const contactMessageCreateSchema = z.object({
  from_name: z.string().min(1).max(120),
  from_email: emailSchema,
  subject: z.string().min(1).max(200).nullable().optional(),
  message: z.string().min(1).max(10_000),
})
export type ContactMessageCreate = z.infer<typeof contactMessageCreateSchema>
