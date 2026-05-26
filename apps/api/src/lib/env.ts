import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  COMMIT_SHA: z.string().default('dev'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(100000).default(100),
})

type ParsedEnv = z.infer<typeof envSchema>

export type RuntimeEnv = ParsedEnv & {
  RATE_LIMIT?: KVNamespace
  SESSION_CACHE?: KVNamespace
}

const cache = new WeakMap<object, ParsedEnv>()

export function parseEnv(raw: Record<string, unknown>): ParsedEnv {
  const cached = cache.get(raw)
  if (cached) return cached
  const parsed = envSchema.parse(raw)
  cache.set(raw, parsed)
  return parsed
}

export function corsOrigins(env: ParsedEnv): string[] {
  return env.CORS_ALLOWED_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}
