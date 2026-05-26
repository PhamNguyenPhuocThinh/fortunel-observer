import { z } from 'zod'

export const uuidSchema = z.string().uuid()
export const slugSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'must be kebab-case')
export const emailSchema = z.string().email().max(254)
export const urlSchema = z.string().url().max(2048)
export const isoDateTimeSchema = z.string().datetime({ offset: true })

export const userRoleSchema = z.enum(['owner', 'admin', 'user'])
export type UserRole = z.infer<typeof userRoleSchema>

export const scopeSchema = z.enum([
  'posts:read',
  'posts:write',
  'projects:read',
  'projects:write',
  'contact:read',
  'contact:write',
  'signals:read',
  'signals:write',
  '*:*',
])
export type Scope = z.infer<typeof scopeSchema>
