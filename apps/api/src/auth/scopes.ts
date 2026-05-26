import { HTTPException } from 'hono/http-exception'
import type { Context } from 'hono'
import { scopeSchema, type Scope } from '@fortunel/shared-types'
import type { AppBindings } from '../lib/context'

export type { Scope }
export const SCOPES = scopeSchema.options
export const WILDCARD: Scope = '*:*'

export function hasScope(granted: readonly string[], required: Scope): boolean {
  if (granted.includes(WILDCARD)) return true
  const [resource] = required.split(':')
  if (resource && granted.includes(`${resource}:*` as Scope)) return true
  return granted.includes(required)
}

export function parseScopes(raw: readonly string[] | null | undefined): Scope[] {
  if (!raw) return []
  const out: Scope[] = []
  for (const s of raw) {
    const parsed = scopeSchema.safeParse(s)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

export function requireScope(c: Context<AppBindings>, required: Scope): void {
  const user = c.get('user')
  if (!user) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }
  if (!hasScope(user.scopes, required)) {
    throw new HTTPException(403, {
      message: `Forbidden: missing scope ${required}`,
    })
  }
}
