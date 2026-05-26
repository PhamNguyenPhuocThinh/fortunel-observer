import { z } from 'zod'
import { emailSchema, isoDateTimeSchema, urlSchema, userRoleSchema, uuidSchema } from '../primitives'

export const userSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  email_verified: z.boolean(),
  name: z.string().nullable(),
  image: urlSchema.nullable(),
  role: userRoleSchema,
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
})
export type User = z.infer<typeof userSchema>

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(120).nullable().optional(),
  image: urlSchema.nullable().optional(),
})
export type UserUpdate = z.infer<typeof userUpdateSchema>
