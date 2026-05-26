import type { RuntimeEnv } from './env'
import type { Logger } from './logger'

export interface AppBindings {
  Bindings: RuntimeEnv
  Variables: {
    requestId: string
    logger: Logger
  }
}
