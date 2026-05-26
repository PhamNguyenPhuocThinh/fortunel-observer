import type { RuntimeEnv } from './env'
import type { Logger } from './logger'

export interface AuthUser {
  id: string
  scopes: string[]
  /** 'session' (Better Auth cookie) or 'api-key' (Bearer token). */
  method: 'session' | 'api-key'
  /** Set only when method === 'api-key' — the api_keys.id row used for revocation. */
  apiKeyId?: string
}

export interface AppBindings {
  Bindings: RuntimeEnv
  Variables: {
    requestId: string
    logger: Logger
    user?: AuthUser
  }
}
