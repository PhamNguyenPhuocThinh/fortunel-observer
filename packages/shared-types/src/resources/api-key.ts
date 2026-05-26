import { z } from 'zod'
import { isoDateTimeSchema, scopeSchema, uuidSchema } from '../primitives'

export const apiKeySchema = z.object({
  id: uuidSchema,
  owner_id: uuidSchema,
  name: z.string().min(1).max(120),
  key_prefix: z.string(),
  scopes: z.array(scopeSchema),
  last_used_at: isoDateTimeSchema.nullable(),
  expires_at: isoDateTimeSchema.nullable(),
  created_at: isoDateTimeSchema,
  revoked_at: isoDateTimeSchema.nullable(),
})
export type ApiKey = z.infer<typeof apiKeySchema>

export const apiKeyCreateSchema = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(scopeSchema).min(1),
  expires_at: isoDateTimeSchema.nullable().optional(),
})
export type ApiKeyCreate = z.infer<typeof apiKeyCreateSchema>

export const apiKeyMintedSchema = apiKeySchema.extend({
  plaintext: z.string(),
})
export type ApiKeyMinted = z.infer<typeof apiKeyMintedSchema>
